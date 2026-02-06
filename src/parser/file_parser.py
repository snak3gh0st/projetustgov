"""File parsing for Excel and CSV files with encoding detection."""

from pathlib import Path
import polars as pl
import pandas as pd
from loguru import logger

from .encoding import detect_encoding
from .schemas import (
    apply_column_mapping,
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

    # Apply column mapping for known aliases
    df = apply_column_mapping(df, file_type)

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

    # Read CSV - use pandas first (more tolerant with malformed CSVs)
    # Then convert to Polars DataFrame
    try:
        # Try with pandas first (handles encoding and malformed CSVs better)
        logger.debug(f"Reading CSV with pandas, encoding: {encoding}")
        # Try common separators: semicolon (common in Brazilian CSVs), comma, tab
        pandas_df = None
        for sep in [';', ',', '\t']:
            try:
                test_df = pd.read_csv(
                    str(path),
                    encoding=encoding,
                    dtype=str,  # Read all as strings to avoid type inference issues
                    on_bad_lines='skip',  # Skip malformed lines
                    engine='c',  # Use C engine (faster)
                    sep=sep,  # Try this separator
                    nrows=10,  # Read first 10 rows to test separator
                )
                logger.debug(f"Testing separator '{sep}': got {len(test_df.columns)} columns, shape: {test_df.shape}")
                # Check if we got more than 1 column (indicates correct separator)
                if len(test_df.columns) > 1:
                    logger.info(f"Found correct separator '{sep}' with {len(test_df.columns)} columns, reading full file")
                    # Read full file with correct separator
                    pandas_df = pd.read_csv(
                        str(path),
                        encoding=encoding,
                        dtype=str,
                        on_bad_lines='skip',
                        engine='c',
                        sep=sep,
                    )
                    logger.info(f"Successfully read full file with separator '{sep}': {pandas_df.shape}")
                    break
            except Exception as e:
                logger.debug(f"Failed to read CSV with separator '{sep}': {e}")
                continue
        
        if pandas_df is None:
            # If all separators failed, try without specifying separator (pandas will auto-detect)
            logger.warning("Could not determine separator, trying auto-detect")
            pandas_df = pd.read_csv(
                str(path),
                encoding=encoding,
                dtype=str,
                on_bad_lines='skip',
                engine='c',
            )
        # Convert to Polars - ensure all columns are simple types for conversion
        # Convert object columns to string explicitly
        for col in pandas_df.columns:
            if pandas_df[col].dtype == 'object':
                pandas_df[col] = pandas_df[col].astype(str)
        
        # Convert to Polars
        df = pl.from_pandas(pandas_df)
        logger.debug(f"Successfully read CSV with pandas and converted to Polars: {df.shape}")
    except Exception as e:
        logger.warning(f"Failed to read CSV with pandas, trying Polars directly: {e}")
        try:
            # Fallback to Polars with minimal options
            df = pl.read_csv(
                str(path),
                encoding=encoding,
                truncate_ragged_lines=True,
                infer_schema_length=0,  # All strings
            )
        except Exception as e2:
            # Last resort: try without encoding
            logger.warning(f"Failed to read CSV with Polars, trying without encoding: {e2}")
            df = pl.read_csv(
                str(path),
                truncate_ragged_lines=True,
                infer_schema_length=0,
            )

    # Validate not empty
    validate_file_not_empty(df, str(path))

    # Validate schema
    validate_schema(df, file_type)

    return df
