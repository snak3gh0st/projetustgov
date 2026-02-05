"""Batch validation of DataFrames against Pydantic models."""

import polars as pl
from loguru import logger
from pydantic import BaseModel

from .models import (
    PropostaValidation,
    ApoiadorValidation,
    EmendaValidation,
    ProgramaValidation,
)


# Mapping of file types to their validation models
VALIDATION_MODELS = {
    "propostas": PropostaValidation,
    "apoiadores": ApoiadorValidation,
    "emendas": EmendaValidation,
    "programas": ProgramaValidation,
}


def validate_dataframe(
    df: pl.DataFrame, file_type: str
) -> tuple[list[dict], list[dict]]:
    """
    Validate a DataFrame against the appropriate Pydantic model.

    Args:
        df: Polars DataFrame with row data
        file_type: Type of file (propostas, apoiadores, emendas, programas)

    Returns:
        Tuple of (valid_records, errors):
        - valid_records: List of dictionaries representing valid rows
        - errors: List of dictionaries with row data and error details
    """
    if file_type not in VALIDATION_MODELS:
        logger.warning(f"Unknown file type: {file_type}, skipping validation")
        return [], []

    model_class = VALIDATION_MODELS[file_type]

    valid_records = []
    errors = []

    # Iterate over rows as dictionaries
    for row_dict in df.iter_rows(named=True):
        try:
            # Validate the row using Pydantic model
            model = model_class(**row_dict)
            # Convert back to dictionary for processing
            valid_records.append(model.model_dump())
        except Exception as e:
            # Capture error details
            errors.append({"row": row_dict, "errors": str(e)})
            logger.debug(f"Validation error for row: {e}")

    # Log summary
    total = len(valid_records) + len(errors)
    logger.info(
        f"Validation complete for {file_type}: "
        f"{len(valid_records)} valid, {len(errors)} invalid out of {total} rows"
    )

    return valid_records, errors
