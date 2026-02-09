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
import hashlib
import polars as pl
from loguru import logger
from sqlalchemy import text

from src.loader.database import get_engine, create_session_factory
from src.loader.upsert import upsert_records, extract_proponentes_from_propostas
from src.loader.db_models import (
    Proposta,
    Programa,
    Proponente,
    Apoiador,
    Emenda,
    PropostaApoiador,
    PropostaEmenda,
)


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
    logger.info("\n[6/8] Loading to database...")

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

        # Extract proponentes from loaded propostas
        logger.info("\n[7/8] Extracting and upserting proponentes...")

        # Get unique proponentes from loaded propostas
        df_proponentes_extract = df_pd[["proponente_cnpj", "proponente", "estado", "municipio"]].copy()
        df_proponentes_extract = df_proponentes_extract[df_proponentes_extract["proponente_cnpj"].notna()]
        df_proponentes_extract = df_proponentes_extract.drop_duplicates(subset=["proponente_cnpj"])

        # Build proponente records
        proponente_records = []
        for _, row in df_proponentes_extract.iterrows():
            proponente_records.append({
                "cnpj": row["proponente_cnpj"],
                "nome": row["proponente"],
                "estado": row.get("estado"),
                "municipio": row.get("municipio"),
                "is_osc": True,  # All qualified leads are OSCs
                "extraction_date": date.today(),
                "total_propostas": 0,  # Will be recalculated below
                "total_emendas": 0,  # Will be recalculated below
                "valor_total_emendas": 0.0,  # Will be recalculated below
            })

        if proponente_records:
            result_prop = upsert_records(
                session=session,
                model_class=Proponente,
                records=proponente_records,
                conflict_column="cnpj",
                batch_size=5000
            )
            logger.info(f"Proponentes upsert result: {result_prop}")
            session.commit()
            logger.info(f"Upserted {len(proponente_records):,} proponentes")
        else:
            logger.warning("No proponentes data extracted")

        # Step 7: Load emenda linkages
        logger.info("\n[8/8] Loading emenda linkages...")

        # Re-load apoiadores CSV to get emenda linkages for our qualified propostas
        df_emendas_full = pl.read_csv(
            str(data_dir / "sample_apoiadores.csv"),
            separator=";",
            infer_schema_length=0,
        )

        # Filter only emendas for our loaded propostas (by CNPJ + ID_PROGRAMA)
        # First get the list of loaded propostas with their programa_id and CNPJ
        df_loaded_propostas = pl.from_pandas(df_pd[["transfer_gov_id", "programa_id", "proponente_cnpj"]].copy())

        # Map COD_PROGRAMA back to ID_PROGRAMA for the join
        cod_to_id_map = {v: k for k, v in id_to_cod_map.items()}
        df_loaded_propostas = df_loaded_propostas.with_columns(
            pl.col("programa_id").replace(cod_to_id_map).alias("id_programa_original")
        )

        # Normalize CNPJ in apoiadores for matching
        df_emendas_full = df_emendas_full.with_columns(
            pl.col("CNPJ_PROPONENTE_APOIADORES_EMENDAS").str.replace_all(r"[^0-9]", "").alias("cnpj_normalized")
        )

        # Join with emendas data using ID_PROGRAMA and CNPJ
        df_emendas_filtered = df_emendas_full.join(
            df_loaded_propostas,
            left_on=["ID_PROGRAMA", "cnpj_normalized"],
            right_on=["id_programa_original", "proponente_cnpj"],
            how="inner"
        )

        logger.info(f"Found {len(df_emendas_filtered):,} emenda linkages for qualified propostas")

        # Extract unique apoiadores
        apoiador_records = []
        for row in df_emendas_filtered.to_dicts():
            if row.get("NOME_PARLAMENTAR_APOIADORES_EMENDAS"):
                # Create a simple hash for transfer_gov_id
                apoiador_key = f"{row['NUMERO_EMENDA_APOIADORES_EMENDAS']}_{row['NOME_PARLAMENTAR_APOIADORES_EMENDAS']}"
                transfer_gov_id = hashlib.md5(apoiador_key.encode()).hexdigest()[:16]

                apoiador_records.append({
                    "transfer_gov_id": transfer_gov_id,
                    "nome": row["NOME_PARLAMENTAR_APOIADORES_EMENDAS"],
                    "tipo": row.get("INDICACAO_APOIADORES_EMENDAS", ""),
                    "orgao": "",  # Not available in this CSV
                    "extraction_date": date.today(),
                })

        # Deduplicate apoiadores
        seen_apoiadores = set()
        unique_apoiador_records = []
        for rec in apoiador_records:
            key = rec["transfer_gov_id"]
            if key not in seen_apoiadores:
                seen_apoiadores.add(key)
                unique_apoiador_records.append(rec)

        if unique_apoiador_records:
            result_apoiadores = upsert_records(
                session=session,
                model_class=Apoiador,
                records=unique_apoiador_records,
                conflict_column="transfer_gov_id",
                batch_size=5000
            )
            logger.info(f"Apoiadores upsert result: {result_apoiadores}")
            session.commit()

        # Extract unique emendas
        emenda_records = []
        for row in df_emendas_filtered.to_dicts():
            if row.get("NUMERO_EMENDA_APOIADORES_EMENDAS"):
                # Parse valor
                valor_str = row.get("VALOR_REPASSE_PROPOSTA_APOIADORES_EMENDAS", "0")
                try:
                    valor = float(str(valor_str).replace(",", ".")) if valor_str and valor_str != "nan" else 0.0
                except:
                    valor = 0.0

                emenda_records.append({
                    "transfer_gov_id": row["NUMERO_EMENDA_APOIADORES_EMENDAS"],
                    "numero": row["NUMERO_EMENDA_APOIADORES_EMENDAS"],
                    "autor": row.get("NOME_PARLAMENTAR_APOIADORES_EMENDAS", ""),
                    "valor": valor,
                    "tipo": row.get("INDICACAO_APOIADORES_EMENDAS", ""),
                    "ano": None,  # Not available in this CSV
                    "extraction_date": date.today(),
                })

        # Deduplicate emendas
        seen_emendas = set()
        unique_emenda_records = []
        for rec in emenda_records:
            key = rec["transfer_gov_id"]
            if key not in seen_emendas:
                seen_emendas.add(key)
                unique_emenda_records.append(rec)

        if unique_emenda_records:
            result_emendas = upsert_records(
                session=session,
                model_class=Emenda,
                records=unique_emenda_records,
                conflict_column="transfer_gov_id",
                batch_size=5000
            )
            logger.info(f"Emendas upsert result: {result_emendas}")
            session.commit()

        # Create junction table links
        logger.info("Creating junction table links...")

        proposta_apoiador_links = []
        proposta_emenda_links = []

        for row in df_emendas_filtered.to_dicts():
            proposta_id = row["transfer_gov_id"]
            emenda_numero = row.get("NUMERO_EMENDA_APOIADORES_EMENDAS")
            parlamentar = row.get("NOME_PARLAMENTAR_APOIADORES_EMENDAS")

            if emenda_numero:
                proposta_emenda_links.append({
                    "proposta_transfer_gov_id": proposta_id,
                    "emenda_transfer_gov_id": emenda_numero,
                    "extraction_date": date.today(),
                })

            if parlamentar:
                apoiador_key = f"{emenda_numero}_{parlamentar}"
                apoiador_id = hashlib.md5(apoiador_key.encode()).hexdigest()[:16]

                proposta_apoiador_links.append({
                    "proposta_transfer_gov_id": proposta_id,
                    "apoiador_transfer_gov_id": apoiador_id,
                    "extraction_date": date.today(),
                })

        if proposta_emenda_links:
            # Deduplicate
            seen_pe = set()
            unique_pe = []
            for link in proposta_emenda_links:
                key = (link["proposta_transfer_gov_id"], link["emenda_transfer_gov_id"])
                if key not in seen_pe:
                    seen_pe.add(key)
                    unique_pe.append(link)

            result_pe = upsert_records(
                session=session,
                model_class=PropostaEmenda,
                records=unique_pe,
                conflict_column=["proposta_transfer_gov_id", "emenda_transfer_gov_id"],
                batch_size=5000
            )
            logger.info(f"Proposta-Emenda links: {result_pe}")
            session.commit()

        if proposta_apoiador_links:
            # Deduplicate
            seen_pa = set()
            unique_pa = []
            for link in proposta_apoiador_links:
                key = (link["proposta_transfer_gov_id"], link["apoiador_transfer_gov_id"])
                if key not in seen_pa:
                    seen_pa.add(key)
                    unique_pa.append(link)

            result_pa = upsert_records(
                session=session,
                model_class=PropostaApoiador,
                records=unique_pa,
                conflict_column=["proposta_transfer_gov_id", "apoiador_transfer_gov_id"],
                batch_size=5000
            )
            logger.info(f"Proposta-Apoiador links: {result_pa}")
            session.commit()

        # Recalculate proponente aggregations
        logger.info("Recalculating proponente aggregations...")
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE proponentes SET
                    total_propostas = subq.total_propostas,
                    total_emendas = COALESCE(subq.total_emendas, 0),
                    valor_total_emendas = COALESCE(subq.valor_total_emendas, 0.0)
                FROM (
                    SELECT
                        p.cnpj,
                        COUNT(DISTINCT prop.id) as total_propostas,
                        COUNT(DISTINCT pe.emenda_transfer_gov_id) as total_emendas,
                        SUM(DISTINCT e.valor) as valor_total_emendas
                    FROM proponentes p
                    LEFT JOIN propostas prop ON p.cnpj = prop.proponente_cnpj
                    LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
                    LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
                    GROUP BY p.cnpj
                ) subq
                WHERE proponentes.cnpj = subq.cnpj
            """))
            conn.commit()

        logger.info("Proponente aggregations recalculated")

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
