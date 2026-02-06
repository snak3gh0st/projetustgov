"""Direct file downloader from dados.gov.br repository.

This module downloads files directly from the dados.gov.br repository
instead of using browser automation, which is more reliable and faster.
"""

import os
import zipfile
from datetime import date
from pathlib import Path
from typing import Optional

import httpx
from loguru import logger


REPOSITORY_BASE_URL = "https://repositorio.dados.gov.br/seges/detru/"

# Mapping of entity types to repository file names
FILE_MAPPING = {
    "propostas": "siconv_proposta.csv.zip",
    "apoiadores": "siconv_apoiadores_emendas_programas.zip",  # Contains apoiadores
    "emendas": "siconv_apoiadores_emendas_programas.zip",  # Contains emendas
    "programas": "siconv_programa.csv.zip",
    "programa_proposta": "siconv_programa_proposta.csv.zip",  # Links propostas to programas
}


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


def download_file(url: str, save_path: str, timeout: int = 300) -> str:
    """Download a file from URL.

    Args:
        url: URL to download from
        save_path: Path to save the file
        timeout: Download timeout in seconds

    Returns:
        Path to downloaded file

    Raises:
        Exception: If download fails
    """
    logger.info("Downloading {} -> {}", url, save_path)

    try:
        with httpx.stream("GET", url, timeout=timeout, follow_redirects=True) as response:
            response.raise_for_status()

            # Ensure directory exists
            os.makedirs(os.path.dirname(save_path), exist_ok=True)

            # Download file
            with open(save_path, "wb") as f:
                for chunk in response.iter_bytes():
                    f.write(chunk)

        file_size = os.path.getsize(save_path)
        file_size_mb = file_size / (1024 * 1024)
        logger.info("Downloaded {} ({:.2f} MB)", save_path, file_size_mb)

        return save_path

    except Exception as e:
        logger.error("Failed to download {}: {}", url, e)
        raise


def extract_zip(zip_path: str, extract_dir: str) -> list[str]:
    """Extract ZIP file and return list of extracted file paths.

    Args:
        zip_path: Path to ZIP file
        extract_dir: Directory to extract to

    Returns:
        List of extracted file paths
    """
    logger.info("Extracting {} to {}", zip_path, extract_dir)

    extracted_files = []

    try:
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            # Extract all files
            zip_ref.extractall(extract_dir)

            # Get list of extracted files
            for name in zip_ref.namelist():
                extracted_path = os.path.join(extract_dir, name)
                if os.path.isfile(extracted_path):
                    extracted_files.append(extracted_path)

        logger.info("Extracted {} files from {}", len(extracted_files), zip_path)
        return extracted_files

    except Exception as e:
        logger.error("Failed to extract {}: {}", zip_path, e)
        raise


def find_file_by_pattern(directory: str, pattern: str) -> Optional[str]:
    """Find a file in directory matching pattern.

    Args:
        directory: Directory to search
        pattern: Pattern to match (e.g., "*proposta*.csv")

    Returns:
        Path to matching file or None if not found
    """
    dir_path = Path(directory)
    matches = list(dir_path.glob(pattern))

    if matches:
        return str(matches[0])
    return None


def download_entity_file(entity_type: str, extraction_date: date | None = None) -> Optional[str]:
    """Download file for a specific entity type.

    Args:
        entity_type: Type of entity (propostas, apoiadores, emendas, programas)
        extraction_date: Date for directory organization

    Returns:
        Path to downloaded/extracted file or None if failed
    """
    if entity_type not in FILE_MAPPING:
        logger.error("Unknown entity type: {}", entity_type)
        return None

    raw_dir = get_raw_dir(extraction_date)
    filename = FILE_MAPPING[entity_type]
    url = REPOSITORY_BASE_URL + filename

    # Download ZIP file
    zip_path = os.path.join(raw_dir, filename)

    try:
        download_file(url, zip_path)

        # Extract ZIP
        extract_dir = os.path.join(raw_dir, entity_type)
        os.makedirs(extract_dir, exist_ok=True)
        extracted_files = extract_zip(zip_path, extract_dir)

        # Find the CSV file we need
        # For propostas and programas, the CSV is directly in the ZIP
        # For apoiadores/emendas, we need to find the right file in the ZIP
        if entity_type in ["propostas", "programas", "programa_proposta"]:
            # Look for CSV file
            csv_file = find_file_by_pattern(extract_dir, "*.csv")
            if csv_file:
                # Move to main directory with proper name
                final_path = os.path.join(raw_dir, f"sample_{entity_type}.csv")
                os.rename(csv_file, final_path)
                return final_path
        elif entity_type in ["apoiadores", "emendas"]:
            # The ZIP contains multiple files, we need to find the right one
            # This is a simplified approach - may need adjustment based on actual ZIP structure
            for extracted_file in extracted_files:
                if entity_type in extracted_file.lower():
                    final_path = os.path.join(raw_dir, f"sample_{entity_type}.csv")
                    if os.path.exists(final_path):
                        os.remove(final_path)
                    os.rename(extracted_file, final_path)
                    return final_path

        logger.warning("Could not find CSV file for {} in extracted files", entity_type)
        return None

    except Exception as e:
        logger.error("Failed to download {}: {}", entity_type, e)
        return None


def run_repository_download(extraction_date: date | None = None) -> dict[str, str | None]:
    """Download all files from dados.gov.br repository.

    Args:
        extraction_date: Date for directory organization

    Returns:
        Dict mapping entity type to file path (or None if failed)
    """
    logger.info("Starting repository download from {}", REPOSITORY_BASE_URL)

    results: dict[str, str | None] = {}

    entity_types = ["propostas", "apoiadores", "emendas", "programas", "programa_proposta"]

    for entity_type in entity_types:
        logger.info("Downloading {}...", entity_type)
        file_path = download_entity_file(entity_type, extraction_date)
        results[entity_type] = file_path

        if file_path:
            logger.info("Successfully downloaded {}: {}", entity_type, file_path)
        else:
            logger.warning("Failed to download {}", entity_type)

    success_count = sum(1 for v in results.values() if v is not None)
    logger.info("Repository download complete: {}/{} files successful", success_count, len(entity_types))

    return results
