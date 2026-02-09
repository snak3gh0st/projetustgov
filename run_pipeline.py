#!/usr/bin/env python3
"""Quick script to run the ETL pipeline on existing data."""

from loguru import logger
from src.orchestrator.pipeline import run_pipeline

if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("RUNNING ETL PIPELINE")
    logger.info("=" * 80)

    try:
        run_pipeline()
        logger.info("✅ Pipeline completed successfully!")
    except Exception as e:
        logger.error(f"❌ Pipeline failed: {e}")
        raise
