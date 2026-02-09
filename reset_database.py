"""Reset Railway database and reload all data with corrected schemas.

This script:
1. Drops all tables
2. Recreates schema
3. Runs full ETL pipeline with corrected COD_PROGRAMA mapping
"""

from pathlib import Path
from loguru import logger
from sqlalchemy import text

from src.loader.database import get_engine, init_db
from src.loader.db_models import Base
from src.orchestrator.pipeline import run_pipeline


def drop_all_tables(engine):
    """Drop all tables in the database."""
    logger.info("Dropping all tables...")

    with engine.connect() as conn:
        # Drop tables in reverse order of dependencies
        tables = [
            "data_lineage",
            "extraction_logs",
            "proposta_emendas",
            "proposta_apoiadores",
            "emendas",
            "apoiadores",
            "propostas",
            "proponentes",
            "programas",
        ]

        for table in tables:
            try:
                conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
                logger.info(f"Dropped table: {table}")
            except Exception as e:
                logger.warning(f"Could not drop table {table}: {e}")

        conn.commit()

    logger.info("All tables dropped successfully")


def main():
    """Main execution function."""
    logger.info("=" * 80)
    logger.info("RAILWAY DATABASE RESET - Starting...")
    logger.info("=" * 80)

    # Get database connection
    engine = get_engine()

    # Step 1: Drop all tables
    logger.info("\n[1/3] Dropping all tables...")
    drop_all_tables(engine)

    # Step 2: Recreate schema
    logger.info("\n[2/3] Recreating database schema...")
    init_db(engine)
    logger.info("Schema recreated successfully")

    # Step 3: Run full ETL pipeline
    logger.info("\n[3/3] Running full ETL pipeline...")
    logger.info("This will take several minutes...")

    try:
        # run_pipeline finds latest data directory automatically
        run_pipeline()
        logger.info("Pipeline completed successfully!")
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        raise

    # Step 4: Verify data
    logger.info("\n" + "=" * 80)
    logger.info("VERIFICATION")
    logger.info("=" * 80)

    with engine.connect() as conn:
        # Count all entities
        entities = ["programas", "propostas", "proponentes", "apoiadores", "emendas"]

        for entity in entities:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {entity}"))
            count = result.scalar()
            logger.info(f"{entity.upper()}: {count:,} records")

        # Check programas by year
        logger.info("\nProgramas by year (2026 focus):")
        result = conn.execute(text("""
            SELECT
                SUBSTRING(transfer_gov_id FROM 6 FOR 4) as ano,
                COUNT(*) as count
            FROM programas
            WHERE SUBSTRING(transfer_gov_id FROM 6 FOR 4) IN ('2024', '2025', '2026')
            GROUP BY SUBSTRING(transfer_gov_id FROM 6 FOR 4)
            ORDER BY ano DESC
        """))
        for row in result:
            logger.info(f"  {row[0]}: {row[1]:,}")

        # Check proposta-programa links
        logger.info("\nProposta-Programa links:")
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total,
                COUNT(p.programa_id) as com_programa,
                COUNT(pr.transfer_gov_id) as com_programa_valido
            FROM propostas p
            LEFT JOIN programas pr ON p.programa_id = pr.transfer_gov_id
        """))
        row = result.fetchone()
        logger.info(f"  Total propostas: {row[0]:,}")
        logger.info(f"  Com programa_id: {row[1]:,}")
        logger.info(f"  Com programa válido: {row[2]:,}")

        # Check proponentes
        logger.info("\nProponentes:")
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_osc = true) as oscs
            FROM proponentes
        """))
        row = result.fetchone()
        logger.info(f"  Total: {row[0]:,}")
        logger.info(f"  OSCs: {row[1]:,}")

    logger.info("\n" + "=" * 80)
    logger.info("DATABASE RESET COMPLETED SUCCESSFULLY!")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
