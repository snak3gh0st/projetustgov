"""Schema definitions and validation for file parsing."""

import polars as pl
from loguru import logger


class SchemaValidationError(Exception):
    """Raised when file schema doesn't match expected columns."""

    pass


class EmptyFileError(Exception):
    """Raised when file is empty or contains no valid rows."""

    pass


# Expected columns per file type
# Note: Column names are normalized (lowercase, stripped) before comparison
EXPECTED_COLUMNS = {
    "propostas": [
        "transfer_gov_id",
        "titulo",
        "valor_global",
        "valor_repasse",
        "valor_contrapartida",
        "situacao",
        "estado",
        "municipio",
        "proponente",
        "programa_id",
    ],
    "apoiadores": ["transfer_gov_id", "nome", "tipo", "orgao"],
    "emendas": ["transfer_gov_id", "numero", "autor", "valor", "tipo", "ano"],
    "programas": [
        "transfer_gov_id",
        "nome",
        "orgao_superior",
        "orgao_vinculado",
        "modalidade",
        "acao_orcamentaria",
        "natureza_juridica",
    ],
}


def validate_schema(df: pl.DataFrame, file_type: str) -> None:
    """
    Validate that DataFrame contains all expected columns for the file type.

    Args:
        df: Polars DataFrame to validate
        file_type: Type of file (propostas, apoiadores, emendas, programas)

    Raises:
        SchemaValidationError: If required columns are missing
    """
    if file_type not in EXPECTED_COLUMNS:
        logger.warning(f"Unknown file type: {file_type}, skipping schema validation")
        return

    expected = EXPECTED_COLUMNS[file_type]

    # Normalize column names (lowercase, strip whitespace)
    normalized_columns = {col.lower().strip(): col for col in df.columns}
    normalized_expected = [col.lower().strip() for col in expected]

    # Check for missing columns
    missing = []
    for exp_col in normalized_expected:
        if exp_col not in normalized_columns:
            # Get original column name if exists with different casing
            original_col = expected[normalized_expected.index(exp_col)]
            missing.append(original_col)

    if missing:
        logger.error(f"Missing required columns for {file_type}: {missing}")
        raise SchemaValidationError(
            f"Missing required columns for {file_type}: {missing}. "
            f"Expected columns: {expected}"
        )

    logger.debug(
        f"Schema validation passed for {file_type}: {len(df)} rows, {len(df.columns)} columns"
    )


def validate_file_not_empty(df: pl.DataFrame, file_path: str) -> None:
    """
    Validate that DataFrame contains data.

    Args:
        df: Polars DataFrame to check
        file_path: Path to the file (for error messages)

    Raises:
        EmptyFileError: If DataFrame is empty
    """
    if df.shape[0] == 0:
        logger.error(f"File is empty: {file_path}")
        raise EmptyFileError(f"File contains no data: {file_path}")


def get_column_name(df: pl.DataFrame, column_name: str) -> str:
    """
    Get the actual column name from a DataFrame, handling case differences.

    Args:
        df: Polars DataFrame
        column_name: Column name to find (normalized form)

    Returns:
        Actual column name as it appears in the DataFrame
    """
    normalized = column_name.lower().strip()
    for col in df.columns:
        if col.lower().strip() == normalized:
            return col
    return column_name
