"""Reconciliation checks for zero data loss verification.

This module compares source file row counts with database insert counts
to detect any data loss during the ETL pipeline.

Reconciliation Results:
- reconcile_file: Compares single source file with DB count
- run_reconciliation: Processes all files and reports mismatches
- get_reconciliation_summary: Human-readable summary of results
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import polars as pl
from sqlalchemy import func, select

from src.config import get_settings
from src.loader.database import get_session
from src.loader.db_models import (
    Apoiador,
    DataLineage,
    Emenda,
    Programa,
    Proposta,
)
from src.monitor.alerting import send_alert
from src.monitor.logger import logger

# Entity type to model mapping
ENTITY_MODEL_MAP = {
    "programa": Programa,
    "proposta": Proposta,
    "apoiador": Apoiador,
    "emenda": Emenda,
}


@dataclass
class ReconciliationResult:
    """Result of a reconciliation check."""

    file_path: str
    entity_type: str
    source_count: int
    db_count: int
    match: bool
    discrepancy: int | None = None

    def __post_init__(self):
        if not self.match:
            self.discrepancy = abs(self.source_count - self.db_count)


def reconcile_file(file_path: str, entity_type: str) -> ReconciliationResult:
    """Compare source file row count with database inserts for a single file.

    Args:
        file_path: Path to the source file (Parquet format)
        entity_type: Entity type ('proposta', 'apoiador', 'emenda', 'programa')

    Returns:
        ReconciliationResult with counts and match status
    """
    logger.debug(f"Reconciling {file_path} for {entity_type}")

    # Count rows in source file using Polars
    source_df = pl.read_parquet(file_path)
    source_count = len(source_df)
    logger.debug(f"Source file has {source_count} rows")

    # Query DB count for this entity from this source_file
    with get_session() as session:
        db_count = session.execute(
            select(func.count(DataLineage.id)).where(
                DataLineage.source_file == file_path,
                DataLineage.entity_type == entity_type,
            )
        ).scalar_one()

    logger.debug(f"Database has {db_count} records for this source file")

    match = source_count == db_count
    result = ReconciliationResult(
        file_path=file_path,
        entity_type=entity_type,
        source_count=source_count,
        db_count=db_count,
        match=match,
    )

    if not match:
        logger.warning(
            f"Reconciliation mismatch: {file_path} "
            f"(source={source_count}, db={db_count})"
        )

    return result


def run_reconciliation(
    raw_data_dir: Optional[Path] = None, date_filter: Optional[str] = None
) -> list[ReconciliationResult]:
    """Run reconciliation checks on all source files.

    Args:
        raw_data_dir: Directory containing raw Parquet files (default: from config)
        date_filter: Optional date string (YYYY-MM-DD) to filter files

    Returns:
        List of ReconciliationResult for each file processed
    """
    settings = get_settings()
    raw_data_dir = raw_data_dir or Path(settings.raw_data_dir)

    logger.info(f"Starting reconciliation from {raw_data_dir}")

    results: list[ReconciliationResult] = []

    # Find all Parquet files
    if date_filter:
        pattern = f"*{date_filter}*.parquet"
    else:
        pattern = "*.parquet"

    parquet_files = list(raw_data_dir.glob(pattern))
    logger.info(f"Found {len(parquet_files)} parquet files to reconcile")

    for file_path in sorted(parquet_files):
        # Infer entity_type from filename
        # Expected format: {entity_type}_{timestamp}.parquet
        filename = file_path.stem
        parts = filename.split("_")

        if len(parts) >= 1:
            entity_type = parts[0].lower()

            if entity_type not in ENTITY_MODEL_MAP:
                logger.warning(
                    f"Unknown entity type '{entity_type}' in {file_path}, skipping"
                )
                continue

            try:
                result = reconcile_file(str(file_path), entity_type)
                results.append(result)

                # Alert on mismatch if configured
                if not result.match and settings.alert_on_mismatch:
                    send_alert(
                        title="Data Reconciliation Mismatch",
                        message=(
                            f"Mismatch detected in {file_path.name}:\n"
                            f"  Source rows: {result.source_count}\n"
                            f"  DB records: {result.db_count}\n"
                            f"  Difference: {result.discrepancy}"
                        ),
                    )

            except Exception as e:
                logger.error(f"Error reconciling {file_path}: {e}")
                # Still add a result indicating failure
                results.append(
                    ReconciliationResult(
                        file_path=str(file_path),
                        entity_type=entity_type,
                        source_count=-1,
                        db_count=-1,
                        match=False,
                    )
                )

    logger.info(
        f"Reconciliation complete: {len(results)} files processed, "
        f"{sum(1 for r in results if r.match)} matched"
    )

    return results


def get_reconciliation_summary(results: list[ReconciliationResult]) -> str:
    """Format reconciliation results into a human-readable summary.

    Args:
        results: List of ReconciliationResult from run_reconciliation()

    Returns:
        Formatted summary string
    """
    if not results:
        return "No files were processed for reconciliation."

    passed = sum(1 for r in results if r.match)
    failed = len(results) - passed
    total_discrepancy = sum(r.discrepancy or 0 for r in results if not r.match)

    lines = [
        "=" * 60,
        "RECONCILIATION SUMMARY",
        "=" * 60,
        f"Files processed: {len(results)}",
        f"Passed: {passed}",
        f"Failed: {failed}",
        f"Total discrepancy: {total_discrepancy} records",
        "-" * 60,
        "Details:",
    ]

    for result in results:
        status = "PASS" if result.match else "FAIL"
        if result.source_count == -1:
            count_info = "ERROR during processing"
        else:
            count_info = f"source={result.source_count}, db={result.db_count}"

        lines.append(f"  [{status}] {result.file_path} ({result.entity_type})")
        if not result.match:
            lines.append(f"         {count_info} (diff: {result.discrepancy})")

    lines.append("=" * 60)

    return "\n".join(lines)
