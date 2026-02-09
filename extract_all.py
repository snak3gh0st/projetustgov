"""Script to download and extract all Transfer Gov data.

This script:
1. Downloads complete datasets from dados.gov.br repository
2. Parses and validates the data
3. Loads everything into the database
"""

from datetime import date
from loguru import logger

from src.crawler.repository_downloader import run_repository_download
from src.orchestrator.pipeline import run_pipeline

if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("STARTING FULL DATA EXTRACTION")
    logger.info("=" * 80)

    # Step 1: Download complete datasets from repository
    logger.info("Step 1: Downloading complete datasets from dados.gov.br...")
    download_results = run_repository_download(extraction_date=date.today())

    success_count = sum(1 for v in download_results.values() if v is not None)
    logger.info(f"Download complete: {success_count}/4 entity types downloaded")

    if success_count == 0:
        logger.error("No files downloaded. Aborting.")
        exit(1)

    # Step 2: Run the full ETL pipeline
    logger.info("Step 2: Running ETL pipeline to load data into database...")
    run_pipeline()

    logger.info("=" * 80)
    logger.info("EXTRACTION COMPLETE")
    logger.info("=" * 80)
    logger.info("Check the dashboard to see all the data!")
