"""File download orchestration with retry logic and raw file storage."""

import os
from datetime import date, datetime
from pathlib import Path
from typing import Generator

from loguru import logger
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
from playwright.sync_api import Page, Download

from src.config import get_settings

from .browser import BrowserManager, BrowserError
from .navigator import navigate_to_panel, find_export_buttons, NavigationError


class DownloadError(Exception):
    """Raised when file download fails."""

    pass


class CrawlerError(Exception):
    """Raised when crawler operations fail."""

    pass


def get_raw_dir(extraction_date: date | None = None) -> str:
    """Create and return date-organized raw file directory.

    Args:
        extraction_date: Date for directory organization.
                         Defaults to today's date.

    Returns:
        Path to raw data directory: data/raw/YYYY-MM-DD/
    """
    d = extraction_date or date.today()
    raw_dir = f"data/raw/{d.isoformat()}"

    # Create directory if it doesn't exist
    Path(raw_dir).mkdir(parents=True, exist_ok=True)

    logger.debug("Raw data directory: {}", raw_dir)
    return raw_dir


def cleanup_old_raw_files(
    raw_data_dir: str | None = None, retention_days: int | None = None
) -> int:
    """Clean up raw files older than retention period.

    Args:
        raw_data_dir: Base directory for raw files.
                     Defaults to settings.raw_data_dir.
        retention_days: Number of days to retain files.
                       Defaults to settings.raw_retention_days.

    Returns:
        Number of directories deleted.
    """
    # Use defaults if not provided
    base_dir = raw_data_dir or "data/raw"
    days = retention_days or 30

    if not os.path.isdir(base_dir):
        logger.info("Raw data directory doesn't exist, nothing to clean up")
        return 0

    cutoff_date = date.today()
    deleted_count = 0

    logger.info("Cleaning up raw files older than {} days in {}", days, base_dir)

    for entry in os.listdir(base_dir):
        entry_path = os.path.join(base_dir, entry)

        # Only process date-named directories (YYYY-MM-DD format)
        if not os.path.isdir(entry_path):
            continue

        try:
            entry_date = datetime.strptime(entry, "%Y-%m-%d").date()
            age = (cutoff_date - entry_date).days

            if age > days:
                # Delete old directory and all contents
                import shutil

                shutil.rmtree(entry_path)
                deleted_count += 1
                logger.info("Deleted old raw directory: {} ({} days old)", entry, age)

        except ValueError:
            # Not a date-formatted directory, skip
            continue

    logger.info("Cleaned up {} old raw directories", deleted_count)
    return deleted_count


def get_retry_decorator():
    """Get retry decorator for download operations.

    Uses exponential backoff as recommended in RESEARCH.md.
    """
    # Default retry settings
    max_retries = 3
    retry_base_delay = 2

    return retry(
        stop=stop_after_attempt(max_retries),
        wait=wait_exponential(
            multiplier=retry_base_delay,
            min=2,  # Minimum 2 seconds
            max=8,  # Maximum 8 seconds
        ),
        retry=retry_if_exception_type((TimeoutError, DownloadError, Exception)),
        before_sleep=before_sleep_log(logger, "WARNING"),
    )


@get_retry_decorator()
def download_single_file(
    page: Page,
    selector: str,
    save_dir: str,
    file_type: str,
) -> str:
    """Download a single file using the specified selector.

    Decorated with retry logic for resilience.

    Args:
        page: Playwright page object.
        selector: CSS or XPath selector for the download button.
        save_dir: Directory to save the downloaded file.
        file_type: Type of file (propostas, apoiadores, etc.).

    Returns:
        Path to the saved file.

    Raises:
        DownloadError: If download fails after all retries.
    """
    logger.info("Downloading {} file (selector: {})", file_type, selector)

    try:
        # Set up download expectation with generous timeout (5 minutes for government report generation)
        with page.expect_download(timeout=300_000) as download_info:
            # Click the download button
            page.click(selector)
            logger.debug("Clicked download button for {}", file_type)

        # Get download object
        download: Download = download_info.value

        # Get suggested filename or generate one
        filename = download.suggested_filename
        if not filename or not filename.strip():
            filename = f"{file_type}.xlsx"

        # Ensure clean filename
        filename = _clean_filename(filename)

        # Save file
        save_path = os.path.join(save_dir, filename)
        download.save_as(save_path)

        # Get file size for logging
        file_size = os.path.getsize(save_path)
        file_size_kb = file_size / 1024

        logger.info(
            "Downloaded {} -> {} ({:.1f} KB)", filename, save_path, file_size_kb
        )

        return save_path

    except Exception as e:
        logger.error("Failed to download {} file: {}", file_type, e)
        raise DownloadError(f"Failed to download {file_type}: {e}") from e


def _clean_filename(filename: str) -> str:
    """Clean filename to ensure safe file operations.

    Args:
        filename: Original filename from download.

    Returns:
        Cleaned filename safe for filesystem.
    """
    # Remove or replace unsafe characters
    import re

    # Replace spaces with underscores
    cleaned = re.sub(r"\s+", "_", filename)

    # Keep only safe characters (alphanumeric, underscore, hyphen, dot)
    cleaned = re.sub(r"[^\w\-.]", "", cleaned)

    # Ensure it ends with .xlsx or .csv if no extension
    if not cleaned.endswith((".xlsx", ".csv", ".xls")):
        # Default to .xlsx if unclear
        cleaned = f"{cleaned}.xlsx"

    return cleaned


def download_all_files(
    page: Page,
    export_buttons: list[dict],
    save_dir: str,
) -> dict[str, str | None]:
    """Download all files from Transfer Gov panel.

    Implements partial extraction: failed files don't block successful ones.

    Args:
        page: Playwright page object.
        export_buttons: List of export button dicts from find_export_buttons.
        save_dir: Directory to save downloaded files.

    Returns:
        Dict mapping file_type to saved file path (or None if failed).
        Example: {"propostas": "/path/to/propostas.xlsx", "apoiadores": None, ...}
    """
    logger.info("Starting download of {} files to {}", len(export_buttons), save_dir)

    results: dict[str, str | None] = {}
    success_count = 0
    failure_count = 0

    for button in export_buttons:
        file_type = button["file_type"]
        selector = button["selector"]

        try:
            file_path = download_single_file(page, selector, save_dir, file_type)
            results[file_type] = file_path
            success_count += 1
            logger.info("Successfully downloaded {}: {}", file_type, file_path)

        except Exception as e:
            # Per CONTEXT.md: "Skip that file, process others"
            results[file_type] = None
            failure_count += 1
            logger.error("Failed to download {} after all retries: {}", file_type, e)
            # Continue to next file - partial extraction is acceptable

    # Log summary
    logger.info(
        "Download complete: {}/{} files successful", success_count, len(export_buttons)
    )

    if failure_count > 0:
        logger.warning(
            "{} files failed to download (partial extraction)", failure_count
        )

    return results


def run_crawler(
    extraction_date: date | None = None,
    headless: bool = True,
) -> dict[str, str | None]:
    """Run the full Transfer Gov crawler.

    Orchestrates: create directory -> cleanup old -> open browser ->
    navigate -> find buttons -> download all -> return results.

    Args:
        extraction_date: Date for raw file directory. Defaults to today.
        headless: Run browser in headless mode. Defaults to True.

    Returns:
        Dict mapping file_type to saved file path (or None if failed).
        Example: {"propostas": "/path/to/propostas.xlsx", "apoiadores": "/path/to/apoiadores.xlsx", ...}

    Raises:
        CrawlerError: If critical crawler operations fail.
    """
    results: dict[str, str | None] = {}

    logger.info("Starting Transfer Gov crawler (headless={})", headless)

    try:
        # Step 1: Create raw directory for today
        raw_dir = get_raw_dir(extraction_date)
        logger.info("Raw data directory: {}", raw_dir)

        # Step 2: Cleanup old raw files
        cleanup_old_raw_files()
        logger.info("Old raw files cleaned up")

        # Step 3: Open browser
        with BrowserManager(headless=headless) as bm:
            logger.info("Browser opened")

            # Step 4: Navigate to Transfer Gov panel
            page = bm.new_page()
            navigate_to_panel(page)

            # Step 5: Find export buttons
            export_buttons = find_export_buttons(page)
            logger.info("Found {} export buttons", len(export_buttons))

            # Step 6: Download all files
            results = download_all_files(page, export_buttons, raw_dir)
            logger.info("All files downloaded")

        logger.info("Crawler completed successfully")
        return results

    except NavigationError as e:
        logger.error("Navigation failed: {}", e)
        # Return empty results for navigation errors
        return {}
    except BrowserError as e:
        logger.error("Browser error: {}", e)
        raise CrawlerError(f"Browser error: {e}") from e
    except Exception as e:
        logger.exception("Unexpected error during crawl: {}", e)
        raise CrawlerError(f"Unexpected error: {e}") from e


def get_latest_download(raw_data_dir: str | None = None) -> dict[str, str] | None:
    """Get the most recent downloaded files.

    Useful for checking what was downloaded in the last run.

    Args:
        raw_data_dir: Directory to search. Defaults to today's directory.

    Returns:
        Dict of file_type -> file_path, or None if directory doesn't exist.
    """
    # Use default if not provided
    base_dir = raw_data_dir or "data/raw"
    today_dir = get_raw_dir()

    if not os.path.isdir(today_dir):
        logger.info("No raw files found for today")
        return None

    files: dict[str, str] = {}
    file_types = ["propostas", "apoiadores", "emendas", "programas"]

    for file_type in file_types:
        # Try common extensions
        for ext in [".xlsx", ".csv", ".xls"]:
            file_path = os.path.join(today_dir, f"{file_type}{ext}")
            if os.path.isfile(file_path):
                files[file_type] = file_path
                break

    return files


def verify_download_complete(results: dict[str, str | None]) -> bool:
    """Verify that all expected files were downloaded.

    Args:
        results: Dict from download_all_files or run_crawler.

    Returns:
        True if all 4 file types are present, False otherwise.
    """
    expected = {"propostas", "apoiadores", "emendas", "programas"}
    downloaded = {k for k, v in results.items() if v is not None}

    missing = expected - downloaded

    if missing:
        logger.warning("Download incomplete. Missing: {}", missing)
        return False

    logger.info("All expected files downloaded successfully")
    return True
