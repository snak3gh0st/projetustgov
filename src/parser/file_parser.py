"""File parsing for Excel and CSV files with encoding detection."""

from pathlib import Path
import polars as pl
from loguru import logger

from .encoding import detect_encoding
from .schemas import (
    validate_schema,
    validate_file_not_empty,
    SchemaValidationError,
    EmptyFileError,
)


def parse_file(file_path: str, file_type: str) -> pl.DataFrame:
    """
    Parse a file (Excel or CSV) and return a Polars DataFrame.

    Args:
        file_path: Path to the file to parse
        file_type: Type of file (propostas, apoiadores, emendas, programas)

    Returns:
        Polars DataFrame with parsed data

    Raises:
        EmptyFileError: If file contains no data
        SchemaValidationError: If required columns are missing
        ValueError: If file extension is not supported
    """
    path = Path(file_path)

    if not path.exists():
        logger.error(f"File not found: {file_path}")
        raise FileNotFoundError(f"File not found: {file_path}")

    logger.info(f"Parsing file: {file_path} (type: {file_type})")

    # Determine file type and parse accordingly
    if path.suffix.lower() == ".xlsx":
        df = _parse_excel(path, file_type)
    elif path.suffix.lower() == ".csv":
        df = _parse_csv(path, file_type)
    else:
        raise ValueError(
            f"Unsupported file extension: {path.suffix}. Only .xlsx and .csv are supported"
        )

    logger.info(f"Parsed {file_path}: {df.shape[0]} rows, {df.shape[1]} columns")

    return df


def _parse_excel(path: Path, file_type: str) -> pl.DataFrame:
    """
    Parse an Excel (.xlsx) file.

    Args:
        path: Path to the Excel file
        file_type: Type of file for schema validation

    Returns:
        Polars DataFrame
    """
    logger.debug(f"Parsing Excel file: {path}")

    # Read Excel file using Polars with openpyxl engine
    df = pl.read_excel(str(path), engine="openpyxl")

    # Validate not empty
    validate_file_not_empty(df, str(path))

    # Validate schema
    validate_schema(df, file_type)

    return df


def _parse_csv(path: Path, file_type: str) -> pl.DataFrame:
    """
    Parse a CSV file with encoding detection.

    Args:
        path: Path to the CSV file
        file_type: Type of file for schema validation

    Returns:
        Polars DataFrame
    """
    logger.debug(f"Parsing CSV file: {path}")

    # Detect encoding first
    encoding = detect_encoding(str(path))
    logger.debug(f"Detected encoding: {encoding} for {path}")

    # Read CSV with detected encoding (eager mode for encoding support)
    df = pl.read_csv(str(path), encoding=encoding)

    # Validate not empty
    validate_file_not_empty(df, str(path))

    # Validate schema
    validate_schema(df, file_type)

    return df
