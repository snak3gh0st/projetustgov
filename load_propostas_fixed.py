"""Load propostas with fixed data formats and column mapping.

This script handles:
1. Manual column mapping
2. Brazilian date format (DD/MM/YYYY → YYYY-MM-DD)
3. Brazilian decimal format (comma → dot)
4. COD_PROGRAMA extraction for programa_id
"""

from pathlib import Path
from datetime import date, datetime
import polars as pl
from loguru import logger
from sqlalchemy import text

from src.loader.database import get_engine, create_session_factory
from src.loader.upsert import upsert_records, extract_proponentes_from_propostas
from src.loader.db_models import Proposta


def parse_brazilian_date(date_str: str) -> str | None:
    """Convert DD/MM/YYYY to YYYY-MM-DD."""
    if not date_str or date_str == 'nan':
        return None
    try:
        dt = datetime.strptime(str(date_str), '%d/%m/%Y')
        return dt.strftime('%Y-%m-%d')
    except:
        return None


def parse_brazilian_decimal(value_str: str) -> float | None:
    """Convert comma decimal to float."""
    if not value_str or value_str == 'nan':
        return None
    try:
        # Replace comma with dot
        normalized = str(value_str).replace(',', '.')
        return float(normalized)
    except:
        return None


def main():
    """Main execution function."""
    logger.info("=" * 80)
    logger.info("LOADING PROPOSTAS WITH DATA FIXES")
    logger.info("=" * 80)

    # Step 1: Load programas ID_PROGRAMA → COD_PROGRAMA mapping
    logger.info("\n[1/5] Loading programa mapping...")
    programas_file = Path("data/raw/2026-02-06/sample_programas.csv")

    df_programas = pl.read_csv(
        str(programas_file),
        separator=";",
        schema_overrides={"ID_PROGRAMA": pl.Utf8, "COD_PROGRAMA": pl.Utf8}
    )

    # Create mapping dict
    id_to_cod_map = dict(
        zip(df_programas["ID_PROGRAMA"], df_programas["COD_PROGRAMA"])
    )
    logger.info(f"Loaded {len(id_to_cod_map):,} programa mappings")

    # Step 2: Load propostas file
    logger.info("\n[2/5] Loading propostas file...")
    propostas_file = Path("data/raw/2026-02-06/sample_propostas.csv")

    df = pl.read_csv(
        str(propostas_file),
        separator=";",
        infer_schema_length=0,  # Read all as strings
    )

    logger.info(f"Loaded {len(df):,} propostas from file")
    logger.info(f"Columns: {df.columns[:10]}...")

    # Step 3: Apply column mapping
    logger.info("\n[3/5] Applying column mapping and data fixes...")

    # Manual column mapping
    column_mapping = {
        "ID_PROPOSTA": "transfer_gov_id",
        "NR_PROPOSTA": "nr_proposta",
        "OBJETO_PROPOSTA": "titulo",
        "VL_GLOBAL_PROP": "valor_global",
        "VL_REPASSE_PROP": "valor_repasse",
        "VL_CONTRAPARTIDA_PROP": "valor_contrapartida",
        "SIT_PROPOSTA": "situacao",
        "UF_PROPONENTE": "estado",
        "MUNIC_PROPONENTE": "municipio",
        "NM_PROPONENTE": "proponente",
        "ID_PROGRAMA": "programa_id",  # We'll map to COD_PROGRAMA below
        "DIA_PROPOSTA": "data_publicacao",
        "DIA_INIC_VIGENCIA_PROPOSTA": "data_inicio_vigencia",
        "DIA_FIM_VIGENCIA_PROPOSTA": "data_fim_vigencia",
        "IDENTIF_PROPONENTE": "proponente_cnpj",
        "CEP_PROPONENTE": "cep_proponente",
        "ENDERECO_PROPONENTE": "endereco_proponente",
        "BAIRRO_PROPONENTE": "bairro_proponente",
        "NATUREZA_JURIDICA": "natureza_juridica_proponente",
    }

    # Rename columns
    rename_map = {}
    for old_name, new_name in column_mapping.items():
        if old_name in df.columns:
            rename_map[old_name] = new_name

    df = df.rename(rename_map)

    # Select only the columns that exist in Proposta model
    expected_columns = [
        "transfer_gov_id",
        "nr_proposta",
        "titulo",
        "valor_global",
        "valor_repasse",
        "valor_contrapartida",
        "situacao",
        "estado",
        "municipio",
        "proponente",
        "programa_id",
        "data_publicacao",
        "data_inicio_vigencia",
        "data_fim_vigencia",
        "proponente_cnpj",  # This is used for proponentes extraction
    ]

    # Keep proponent fields for later extraction
    proponent_columns = [
        "proponente_cnpj",
        "cep_proponente",
        "endereco_proponente",
        "bairro_proponente",
        "natureza_juridica_proponente",
    ]

    available_columns = [col for col in expected_columns if col in df.columns]
    df = df.select(available_columns)

    logger.info(f"Mapped columns: {df.columns}")

    # Step 4: Convert data formats
    logger.info("\n[4/5] Converting data formats...")

    # Convert to pandas for easier manipulation
    df_pd = df.to_pandas()

    # Convert dates
    for date_col in ["data_publicacao", "data_inicio_vigencia", "data_fim_vigencia"]:
        if date_col in df_pd.columns:
            logger.info(f"Converting {date_col}...")
            df_pd[date_col] = df_pd[date_col].apply(parse_brazilian_date)

    # Convert decimal values
    for value_col in ["valor_global", "valor_repasse", "valor_contrapartida"]:
        if value_col in df_pd.columns:
            logger.info(f"Converting {value_col}...")
            df_pd[value_col] = df_pd[value_col].apply(parse_brazilian_decimal)

    # Map ID_PROGRAMA → COD_PROGRAMA
    if "programa_id" in df_pd.columns:
        logger.info("Mapping programa_id to COD_PROGRAMA...")
        df_pd["programa_id"] = df_pd["programa_id"].map(id_to_cod_map)

        # Count successful mappings
        mapped = df_pd["programa_id"].notna().sum()
        logger.info(f"Mapped {mapped:,}/{len(df_pd):,} propostas to programa COD")

    # Add extraction_date
    df_pd["extraction_date"] = date.today()

    # Remove rows with null transfer_gov_id
    df_pd = df_pd[df_pd["transfer_gov_id"].notna()]

    logger.info(f"After cleanup: {len(df_pd):,} propostas ready to load")

    # Step 5: Load to database
    logger.info("\n[5/5] Loading to database...")

    engine = get_engine()
    SessionLocal = create_session_factory(engine)
    session = SessionLocal()

    try:
        # Keep a copy with proponent fields for extraction
        df_with_proponent = df_pd.copy()

        # Remove proponent fields from propostas before upsert
        proposta_columns = [col for col in df_pd.columns if col not in [
            "cep_proponente", "endereco_proponente", "bairro_proponente",
            "natureza_juridica_proponente"
        ]]
        df_propostas_only = df_pd[proposta_columns]

        # Convert to dict records
        records = df_propostas_only.to_dict('records')

        # Upsert propostas
        logger.info("Upserting propostas...")
        result = upsert_records(
            session=session,
            model_class=Proposta,
            records=records,
            conflict_column="transfer_gov_id",
            batch_size=1000
        )
        logger.info(f"Upsert result: {result}")

        session.commit()

        # Extract proponentes (use df with proponent fields)
        logger.info("Extracting proponentes...")
        df_with_proponent_pl = pl.from_pandas(df_with_proponent)
        extract_proponentes_from_propostas(session, df_with_proponent_pl, date.today())

        session.commit()
        logger.info("Proponentes extracted successfully")

    except Exception as e:
        logger.error(f"Error loading propostas: {e}")
        session.rollback()
        raise
    finally:
        session.close()

    # Verification
    logger.info("\n" + "=" * 80)
    logger.info("VERIFICATION")
    logger.info("=" * 80)

    with engine.connect() as conn:
        # Count propostas
        result = conn.execute(text("SELECT COUNT(*) FROM propostas"))
        count = result.scalar()
        logger.info(f"Total propostas: {count:,}")

        # Count proponentes
        result = conn.execute(text("SELECT COUNT(*) FROM proponentes"))
        count = result.scalar()
        logger.info(f"Total proponentes: {count:,}")

        # Check links
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total,
                COUNT(p.programa_id) as com_programa,
                COUNT(pr.transfer_gov_id) as com_programa_valido
            FROM propostas p
            LEFT JOIN programas pr ON p.programa_id = pr.transfer_gov_id
        """))
        row = result.fetchone()
        logger.info(f"\nProposta-Programa links:")
        logger.info(f"  Total propostas: {row[0]:,}")
        logger.info(f"  Com programa_id: {row[1]:,}")
        logger.info(f"  Com programa válido: {row[2]:,}")

    logger.info("\n" + "=" * 80)
    logger.info("PROPOSTAS LOADED SUCCESSFULLY!")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
