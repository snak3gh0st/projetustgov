"""Full ETL pipeline orchestrator for PROJETUS.

This module orchestrates the complete extraction, transformation, and loading
process: parsing files, validating data, and loading into the database.
"""

import time
from datetime import date
from pathlib import Path
from typing import Optional

from loguru import logger

from src.config.loader import get_config
from src.loader.database import get_engine, create_session_factory, init_db
from src.loader.extraction_log import create_extraction_log
from src.loader.upsert import load_extraction_data
from src.parser.file_parser import parse_file
from src.transformer.validator import validate_dataframe


def infer_entity_type(filename: str) -> Optional[str]:
    """Infer entity type from filename.

    Args:
        filename: The filename to analyze

    Returns:
        Entity type string or None if cannot determine
    """
    name = filename.lower()

    if "proposta" in name:
        return "propostas"
    elif "apoiador" in name:
        return "apoiadores"
    elif "emenda" in name:
        return "emendas"
    elif "programa" in name:
        return "programas"
    else:
        return None


def find_latest_data_directory(raw_data_dir: Path) -> Path:
    """Find the latest dated subdirectory in data/raw.

    Args:
        raw_data_dir: The base data/raw directory

    Returns:
        Path to the latest dated subdirectory, or the base directory if none found
    """
    if not raw_data_dir.exists():
        return raw_data_dir

    # Look for dated subdirectories (format: YYYY-MM-DD)
    dated_dirs = []
    for item in raw_data_dir.iterdir():
        if item.is_dir():
            try:
                # Try to parse as date
                date.fromisoformat(item.name)
                dated_dirs.append(item)
            except ValueError:
                continue

    if dated_dirs:
        # Return the most recent dated directory
        latest_dir = max(dated_dirs, key=lambda d: d.stat().st_mtime)
        logger.debug(f"Found latest data directory: {latest_dir}")
        return latest_dir

    return raw_data_dir


def run_pipeline(config_path: Optional[str] = None) -> None:
    """Execute the full ETL pipeline.

    This function:
    1. Finds files in data/raw directory
    2. Parses each file (Excel/CSV)
    3. Validates data with Pydantic
    4. Loads validated data into database
    5. Creates extraction log entry

    Args:
        config_path: Path to configuration file (optional, uses default if not provided)
    """
    start_time = time.time()
    logger.info("Starting PROJETUS ETL pipeline")

    # Get config
    config = get_config(config_path)
    # Use default data/raw if not in config
    raw_data_dir = Path("data/raw")

    # Create directory if it doesn't exist
    raw_data_dir.mkdir(parents=True, exist_ok=True)

    # Find latest data directory
    data_dir = find_latest_data_directory(raw_data_dir)

    if not data_dir.exists():
        logger.warning(f"Data directory not found: {data_dir}, attempting to run crawler first")
        # Try to run crawler to download files
        try:
            from src.crawler.downloader import run_crawler
            logger.info("Running crawler to download files...")
            run_crawler(extraction_date=date.today(), headless=True)
            # Re-find data directory after crawler
            data_dir = find_latest_data_directory(raw_data_dir)
        except Exception as e:
            logger.error(f"Failed to run crawler: {e}")
            raise FileNotFoundError(f"Data directory not found and crawler failed: {data_dir}")

    # List all files (Excel and CSV)
    files = []
    for pattern in ["*.xlsx", "*.csv"]:
        files.extend(data_dir.glob(pattern))

    if not files:
        logger.warning(f"No files found in {data_dir}, attempting to run crawler first")
        # Try to download files from repository
        try:
            from src.crawler.repository_downloader import run_repository_download
            logger.info("Downloading files from repository...")
            download_results = run_repository_download(extraction_date=date.today())
            logger.info(f"Repository download completed: {download_results}")
            # Re-find data directory after crawler
            data_dir = find_latest_data_directory(raw_data_dir)
            # Re-list files
            files = []
            for pattern in ["*.xlsx", "*.csv"]:
                files.extend(data_dir.glob(pattern))
        except Exception as e:
            logger.error(f"Failed to download from repository: {e}")
            raise FileNotFoundError(f"No files found in {data_dir} and repository download failed: {e}")

    if not files:
        logger.error(f"No files found in {data_dir} after crawler")
        raise FileNotFoundError(f"No files found in {data_dir}")

    logger.info(f"Found {len(files)} files to process")

    # Initialize database
    engine = get_engine()
    init_db(engine)
    SessionLocal = create_session_factory(engine)
    session = SessionLocal()

    try:
        # Parse and validate all files
        validated_data: dict[str, list[dict]] = {
            "programas": [],
            "propostas": [],
            "apoiadores": [],
            "emendas": [],
            "proposta_apoiadores": [],
            "proposta_emendas": [],
        }

        extraction_date = date.today()
        validation_errors = []

        for file_path in sorted(files):
            file_name = file_path.name
            entity_type = infer_entity_type(file_name)

            if entity_type is None:
                logger.warning(f"Could not determine entity type for: {file_name}")
                continue

            logger.info(f"Processing {file_name} as {entity_type}")

            try:
                # Parse file
                df = parse_file(str(file_path), entity_type)
                logger.info(f"Parsed {file_name}: {len(df)} rows")

                # Validate data
                valid_records, errors = validate_dataframe(df, entity_type)

                if errors:
                    for error in errors:
                        validation_errors.append(
                            f"{file_name}: {error.get('errors', 'Validation error')}"
                        )
                    logger.warning(
                        f"Validation errors in {file_name}: {len(errors)} errors"
                    )

                # Add valid records to validated_data
                validated_data[entity_type].extend(valid_records)
                logger.info(
                    f"Validated {file_name}: {len(valid_records)} valid records"
                )

            except Exception as e:
                error_msg = f"Error processing {file_name}: {e}"
                validation_errors.append(error_msg)
                logger.error(error_msg)
                # Continue processing other files

        # Determine status based on results
        total_valid = sum(len(records) for records in validated_data.values())
        has_errors = len(validation_errors) > 0

        if total_valid == 0:
            status = "failed"
            error_message = "No valid records found in any file"
        elif has_errors:
            status = "partial"
            error_message = "; ".join(validation_errors[:5])  # First 5 errors
        else:
            status = "success"
            error_message = None

        # Load data into database
        stats = {}
        if total_valid > 0:
            try:
                stats = load_extraction_data(session, validated_data, extraction_date)
                logger.info(f"Loaded data: {stats}")
            except Exception as e:
                session.rollback()
                logger.error(f"Failed to load data: {e}")
                raise

        # Create extraction log
        duration = time.time() - start_time
        create_extraction_log(
            session,
            status=status,
            stats=stats if stats else None,
            error=error_message,
            duration=duration,
        )

        # Commit transaction
        session.commit()
        logger.info(
            f"Pipeline completed: status={status}, records={total_valid}, "
            f"duration={duration:.2f}s"
        )

    except Exception as e:
        session.rollback()
        logger.error(f"Pipeline failed: {e}")
        # Create failed log entry
        duration = time.time() - start_time
        try:
            create_extraction_log(
                session,
                status="failed",
                error=str(e),
                duration=duration,
            )
            session.commit()
        except Exception:
            session.rollback()
        raise
    finally:
        session.close()
