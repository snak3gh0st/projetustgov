"""Load only qualified leads: 2025/2026 OSCs with emendas (beneficiários de emenda).

This script implements the correct filtering strategy based on the meeting notes:
1. Filter propostas: ANO_PROP in (2025, 2026) AND NATUREZA_JURIDICA = OSC
2. Cross with programa_proposta to get programa links
3. Cross with emendas to identify "beneficiários de emenda"
4. Extract proponentes with qualification (project history)
5. Result: ~4,000 qualified leads for sales team
"""

from pathlib import Path
from datetime import date, datetime
import polars as pl
from loguru import logger
from sqlalchemy import text

from src.loader.database import get_engine, create_session_factory
from src.loader.upsert import upsert_records, extract_proponentes_from_propostas
from src.loader.db_models import Proposta, Programa


def parse_brazilian_date(date_str: str) -> str | None:
    """Convert DD/MM/YYYY to YYYY-MM-DD."""
    if not date_str or date_str == 'nan' or str(date_str).strip() == '':
        return None
    try:
        dt = datetime.strptime(str(date_str).strip(), '%d/%m/%Y')
        return dt.strftime('%Y-%m-%d')
    except:
        return None


def parse_brazilian_decimal(value_str: str) -> float | None:
    """Convert comma decimal to float."""
    if not value_str or value_str == 'nan' or str(value_str).strip() == '':
        return None
    try:
        normalized = str(value_str).replace(',', '.')
        return float(normalized)
    except:
        return None


def main():
    """Main execution function."""
    logger.info("=" * 80)
    logger.info("LOADING QUALIFIED LEADS (2025/2026 OSCs WITH EMENDAS)")
    logger.info("=" * 80)

    data_dir = Path("data/raw/2026-02-06")

    # Step 1: Load programas mapping (ID_PROGRAMA → COD_PROGRAMA)
    logger.info("\n[1/6] Loading programa mapping...")
    df_programas = pl.read_csv(
        str(data_dir / "sample_programas.csv"),
        separator=";",
        schema_overrides={"ID_PROGRAMA": pl.Utf8, "COD_PROGRAMA": pl.Utf8}
    )

    id_to_cod_map = dict(zip(df_programas["ID_PROGRAMA"], df_programas["COD_PROGRAMA"]))
    logger.info(f"Loaded {len(id_to_cod_map):,} programa mappings")

    # Step 2: Load programa_proposta links
    logger.info("\n[2/6] Loading programa_proposta links...")
    df_prog_prop = pl.read_csv(
        str(data_dir / "sample_programa_proposta.csv"),
        separator=";",
        schema_overrides={"ID_PROGRAMA": pl.Utf8, "ID_PROPOSTA": pl.Utf8}
    )
    logger.info(f"Loaded {len(df_prog_prop):,} programa-proposta links")

    # Step 3: Load emendas (to identify beneficiários de emenda)
    logger.info("\n[3/6] Loading emendas...")
    df_emendas = pl.read_csv(
        str(data_dir / "sample_apoiadores.csv"),
        separator=";",
        schema_overrides={
            "ID_PROGRAMA": pl.Utf8,
            "CNPJ_PROPONENTE_APOIADORES_EMENDAS": pl.Utf8,
            "NUMERO_EMENDA_APOIADORES_EMENDAS": pl.Utf8,
        }
    )

    # Get unique proponentes with emendas by CNPJ
    df_beneficiarios = df_emendas.filter(
        pl.col("NUMERO_EMENDA_APOIADORES_EMENDAS").is_not_null()
    ).select([
        pl.col("CNPJ_PROPONENTE_APOIADORES_EMENDAS").alias("cnpj"),
        pl.col("ID_PROGRAMA")
    ]).unique()

    logger.info(f"Identified {len(df_beneficiarios):,} unique beneficiários de emenda")

    # Step 4: Load propostas and filter
    logger.info("\n[4/6] Loading and filtering propostas...")
    df_propostas = pl.read_csv(
        str(data_dir / "sample_propostas.csv"),
        separator=";",
        infer_schema_length=0,  # All as strings
    )

    logger.info(f"Loaded {len(df_propostas):,} propostas from file")

    # Filter: ANO_PROP in (2025, 2026) AND NATUREZA_JURIDICA = OSC
    df_propostas = df_propostas.filter(
        (pl.col("ANO_PROP").is_in(["2025", "2026"])) &
        (pl.col("NATUREZA_JURIDICA") == "Organização da Sociedade Civil")
    )

    logger.info(f"After filter (2025/2026 + OSC): {len(df_propostas):,} propostas")

    # Join with programa_proposta to get ID_PROGRAMA
    df_propostas = df_propostas.join(
        df_prog_prop,
        left_on="ID_PROPOSTA",
        right_on="ID_PROPOSTA",
        how="inner"
    )

    logger.info(f"After join with programa_proposta: {len(df_propostas):,} propostas")

    # Filter only beneficiários de emenda (CNPJ + ID_PROGRAMA must exist in emendas)
    # First normalize CNPJ
    df_propostas = df_propostas.with_columns(
        pl.col("IDENTIF_PROPONENTE").str.replace_all(r"[^0-9]", "").alias("cnpj_normalized")
    )

    df_propostas = df_propostas.join(
        df_beneficiarios,
        left_on=["cnpj_normalized", "ID_PROGRAMA"],
        right_on=["cnpj", "ID_PROGRAMA"],
        how="inner"
    )

    logger.info(f"After filter (only beneficiários de emenda): {len(df_propostas):,} propostas")

    # Step 5: Apply column mapping and data conversion
    logger.info("\n[5/6] Applying column mapping and data conversion...")

    column_mapping = {
        "ID_PROPOSTA": "transfer_gov_id",
        "OBJETO_PROPOSTA": "titulo",
        "VL_GLOBAL_PROP": "valor_global",
        "VL_REPASSE_PROP": "valor_repasse",
        "VL_CONTRAPARTIDA_PROP": "valor_contrapartida",
        "SIT_PROPOSTA": "situacao",
        "UF_PROPONENTE": "estado",
        "MUNIC_PROPONENTE": "municipio",
        "NM_PROPONENTE": "proponente",
        "ID_PROGRAMA": "programa_id",
        "DIA_PROPOSTA": "data_publicacao",
        "DIA_INIC_VIGENCIA_PROPOSTA": "data_inicio_vigencia",
        "DIA_FIM_VIGENCIA_PROPOSTA": "data_fim_vigencia",
        "IDENTIF_PROPONENTE": "proponente_cnpj",
    }

    rename_map = {old: new for old, new in column_mapping.items() if old in df_propostas.columns}
    df_propostas = df_propostas.rename(rename_map)

    # Map ID_PROGRAMA → COD_PROGRAMA
    df_id_cod = pl.DataFrame({
        "programa_id": list(id_to_cod_map.keys()),
        "programa_id_cod": list(id_to_cod_map.values())
    })

    df_propostas = df_propostas.join(
        df_id_cod,
        on="programa_id",
        how="left"
    ).drop("programa_id").rename({"programa_id_cod": "programa_id"})

    # Convert to pandas for date/value conversion
    df_pd = df_propostas.to_pandas()

    # Convert dates
    for col in ["data_publicacao", "data_inicio_vigencia", "data_fim_vigencia"]:
        if col in df_pd.columns:
            df_pd[col] = df_pd[col].apply(parse_brazilian_date)

    # Convert values
    for col in ["valor_global", "valor_repasse", "valor_contrapartida"]:
        if col in df_pd.columns:
            df_pd[col] = df_pd[col].apply(parse_brazilian_decimal)

    # Normalize CNPJ
    if "proponente_cnpj" in df_pd.columns:
        df_pd["proponente_cnpj"] = df_pd["proponente_cnpj"].str.replace(r"[^0-9]", "", regex=True)

    # Add extraction_date
    df_pd["extraction_date"] = date.today()

    # Select only Proposta model columns
    proposta_columns = [
        "transfer_gov_id", "titulo", "valor_global", "valor_repasse",
        "valor_contrapartida", "situacao", "estado", "municipio",
        "proponente", "programa_id", "data_publicacao", "data_inicio_vigencia",
        "data_fim_vigencia", "proponente_cnpj", "extraction_date"
    ]
    df_pd = df_pd[[col for col in proposta_columns if col in df_pd.columns]]

    logger.info(f"Final propostas ready to load: {len(df_pd):,}")

    # Step 6: Load to database
    logger.info("\n[6/6] Loading to database...")

    engine = get_engine()
    SessionLocal = create_session_factory(engine)
    session = SessionLocal()

    try:
        records = df_pd.to_dict('records')

        logger.info("Upserting propostas...")
        result = upsert_records(
            session=session,
            model_class=Proposta,
            records=records,
            conflict_column="transfer_gov_id",
            batch_size=5000  # Larger batch for better performance
        )
        logger.info(f"Upsert result: {result}")

        session.commit()

        # Extract proponentes
        logger.info("Extracting proponentes...")
        df_pl = pl.from_pandas(df_pd)
        proponentes_data = extract_proponentes_from_propostas(records, df_pl)

        if proponentes_data:
            from src.loader.db_models import Proponente
            result_prop = upsert_records(
                session=session,
                model_class=Proponente,
                records=proponentes_data,
                conflict_column="cnpj",
                batch_size=5000
            )
            logger.info(f"Proponentes upsert result: {result_prop}")
            session.commit()
            logger.info("Proponentes extracted successfully")
        else:
            logger.warning("No proponentes data extracted")

    except Exception as e:
        logger.error(f"Error loading data: {e}")
        session.rollback()
        raise
    finally:
        session.close()

    # Verification
    logger.info("\n" + "=" * 80)
    logger.info("VERIFICATION")
    logger.info("=" * 80)

    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM propostas"))
        count = result.scalar()
        logger.info(f"Total propostas: {count:,}")

        result = conn.execute(text("SELECT COUNT(*) FROM proponentes WHERE is_osc = true"))
        count = result.scalar()
        logger.info(f"Total OSCs (proponentes): {count:,}")

        result = conn.execute(text("""
            SELECT COUNT(DISTINCT p.proponente_cnpj)
            FROM propostas p
            WHERE p.proponente_cnpj IS NOT NULL
        """))
        count = result.scalar()
        logger.info(f"Unique CNPJs (beneficiários de emenda 2025/2026): {count:,}")

    logger.info("\n" + "=" * 80)
    logger.info("QUALIFIED LEADS LOADED SUCCESSFULLY!")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
