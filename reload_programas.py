"""Reload programas table with corrected COD_PROGRAMA mapping.

This script:
1. Deletes all existing programas
2. Reloads programas from source files using COD_PROGRAMA (13 digits with year)
3. Verifies the data was loaded correctly
"""

from pathlib import Path
from datetime import date
from sqlalchemy import text
from loguru import logger

from src.loader.database import get_engine, create_session_factory
from src.parser.file_parser import parse_file
from src.loader.upsert import upsert_records
from src.loader.db_models import Programa


def find_latest_data_directory(raw_data_dir: Path) -> Path:
    """Find the latest dated subdirectory in data/raw."""
    if not raw_data_dir.exists():
        return raw_data_dir

    dated_dirs = []
    for item in raw_data_dir.iterdir():
        if item.is_dir():
            try:
                date.fromisoformat(item.name)
                dated_dirs.append(item)
            except ValueError:
                continue

    if dated_dirs:
        return max(dated_dirs, key=lambda d: d.stat().st_mtime)

    return raw_data_dir


def main():
    """Main execution function."""
    logger.info("Starting programas reload...")

    # Get database connection
    engine = get_engine()
    SessionLocal = create_session_factory(engine)

    # Step 1: Delete all existing programas
    logger.info("Deleting all existing programas...")
    with engine.connect() as conn:
        result = conn.execute(text("DELETE FROM programas"))
        conn.commit()
        logger.info(f"Deleted {result.rowcount} programas")

    # Step 2: Find and parse the programas file
    project_root = Path(__file__).parent
    raw_data_dir = project_root / "data" / "raw"
    latest_dir = find_latest_data_directory(raw_data_dir)

    # Look for programas file
    programas_files = list(latest_dir.glob("**/sample_programas.csv"))
    if not programas_files:
        programas_files = list(latest_dir.glob("**/*programa*.csv"))
        programas_files = [f for f in programas_files if "proposta" not in f.name.lower()]

    if not programas_files:
        logger.error("No programas file found!")
        return

    programas_file = programas_files[0]
    logger.info(f"Parsing programas from: {programas_file}")

    # Parse the file
    df_programas = parse_file(str(programas_file), "programas")
    logger.info(f"Parsed {len(df_programas)} programas")
    logger.info(f"Columns after parsing: {df_programas.columns}")

    # Manually apply column mapping if needed (fallback)
    column_mapping = {
        "COD_PROGRAMA": "transfer_gov_id",
        "NOME_PROGRAMA": "nome",
        "DESC_ORGAO_SUP_PROGRAMA": "orgao_superior",
        "COD_ORGAO_SUP_PROGRAMA": "orgao_vinculado",
        "MODALIDADE_PROGRAMA": "modalidade",
        "ACAO_ORCAMENTARIA": "acao_orcamentaria",
        "NATUREZA_JURIDICA_PROGRAMA": "natureza_juridica",
    }

    # Apply mapping to existing columns
    rename_map = {}
    for old_name, new_name in column_mapping.items():
        if old_name in df_programas.columns:
            rename_map[old_name] = new_name

    if rename_map:
        logger.info(f"Applying manual column mapping: {rename_map}")
        df_programas = df_programas.rename(rename_map)

    # Select only the columns we need
    expected_columns = [
        "transfer_gov_id",
        "nome",
        "orgao_superior",
        "orgao_vinculado",
        "modalidade",
        "acao_orcamentaria",
        "natureza_juridica",
    ]
    df_programas = df_programas.select(expected_columns)

    logger.info(f"Final columns: {df_programas.columns}")

    # Check sample IDs
    if "transfer_gov_id" in df_programas.columns:
        sample_ids = df_programas.select("transfer_gov_id").head(10)
        logger.info(f"Sample transfer_gov_id values:\n{sample_ids}")

        # Extract years
        years = df_programas.select(
            df_programas["transfer_gov_id"].str.slice(5, 9).alias("year")
        ).unique()
        logger.info(f"Years found in programas: {years}")

    # Step 3: Upsert programas
    logger.info("Upserting programas to database...")
    session = SessionLocal()
    try:
        programas_data = df_programas.to_dicts()

        # Add extraction_date to all records
        for record in programas_data:
            record["extraction_date"] = date.today()

        result = upsert_records(
            session=session,
            model_class=Programa,
            records=programas_data,
            conflict_column="transfer_gov_id",
            batch_size=1000
        )
        logger.info(f"Upsert result: {result}")
        session.commit()
    except Exception as e:
        logger.error(f"Error upserting programas: {e}")
        session.rollback()
        raise
    finally:
        session.close()

    # Step 4: Verify the data
    logger.info("Verifying programas data...")
    with engine.connect() as conn:
        # Count total
        result = conn.execute(text("SELECT COUNT(*) FROM programas"))
        total = result.scalar()
        logger.info(f"Total programas in DB: {total}")

        # Count by year
        result = conn.execute(text("""
            SELECT
                SUBSTRING(transfer_gov_id FROM 6 FOR 4) as ano,
                COUNT(*) as count
            FROM programas
            WHERE LENGTH(transfer_gov_id) = 13
            GROUP BY SUBSTRING(transfer_gov_id FROM 6 FOR 4)
            ORDER BY ano DESC
        """))
        logger.info("Programas by year:")
        for row in result:
            logger.info(f"  {row[0]}: {row[1]}")

        # Sample IDs
        result = conn.execute(text("SELECT transfer_gov_id FROM programas LIMIT 10"))
        logger.info("Sample transfer_gov_id values:")
        for row in result:
            logger.info(f"  {row[0]}")

    logger.info("Programas reload completed successfully!")


if __name__ == "__main__":
    main()
