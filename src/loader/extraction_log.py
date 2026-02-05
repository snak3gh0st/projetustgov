"""Extraction logging for the PROJETUS ETL pipeline.

This module provides:
- create_extraction_log: Creates audit trail entries for each pipeline run
- get_last_extraction: Retrieves the most recent extraction log entry

Design principles:
- Every extraction run is logged with status, row counts, duration, and errors
- Flushed (not committed) to make ID available to caller for transaction management
- Used by health check endpoints to report pipeline status
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from src.loader.db_models import ExtractionLog
from src.monitor.logger import logger


def create_extraction_log(
    session: Session,
    status: str,
    stats: Optional[dict[str, dict[str, int]]] = None,
    error: Optional[str] = None,
    duration: Optional[float] = None,
) -> ExtractionLog:
    """Create an extraction log entry for a pipeline run.

    This function creates an audit trail entry recording the execution
    of a single extraction run. It records status, row counts, duration,
    and any errors encountered.

    Note: This function uses session.flush() (not commit()) to make the
    ID available to the caller. The caller manages the transaction boundary.

    Args:
        session: SQLAlchemy Session for database operations
        status: Execution status - one of "success", "partial", or "failed"
        stats: Optional statistics dictionary from load_extraction_data:
            {
                "programas": {"inserted": N, "updated": M},
                "propostas": {"inserted": N, "updated": M},
                ...
            }
        error: Optional error message if the extraction failed
        duration: Optional duration in seconds for the extraction run

    Returns:
        The created ExtractionLog instance (with ID populated after flush)

    Example:
        >>> log = create_extraction_log(
        ...     session,
        ...     status="success",
        ...     stats={"programas": {"inserted": 5, "updated": 0}},
        ...     duration=45.3,
        ... )
        >>> print(log.id)
        123
    """
    # Aggregate statistics from stats dict
    files_downloaded: Optional[int] = None
    total_records: Optional[int] = 0
    records_inserted: Optional[int] = 0
    records_updated: Optional[int] = 0
    records_skipped: Optional[int] = None

    if stats:
        files_downloaded = len(stats)
        for table_stats in stats.values():
            total_records += table_stats.get("inserted", 0) + table_stats.get(
                "updated", 0
            )
            records_inserted += table_stats.get("inserted", 0)
            records_updated += table_stats.get("updated", 0)

    # Create the log entry
    log_entry = ExtractionLog(
        status=status,
        files_downloaded=files_downloaded,
        total_records=total_records,
        records_inserted=records_inserted,
        records_updated=records_updated,
        records_skipped=records_skipped,
        duration_seconds=duration,
        error_message=error,
    )

    # Add to session and flush to get ID (don't commit - caller manages transaction)
    session.add(log_entry)
    session.flush()

    logger.info(
        "Extraction log created: status=%s, records=%d, duration=%.2fs",
        status,
        total_records or 0,
        duration or 0,
    )

    return log_entry


def get_last_extraction(session: Session) -> Optional[ExtractionLog]:
    """Retrieve the most recent extraction log entry.

    This function queries extraction_logs ordered by run_date descending
    and returns the most recent entry. Used by health check endpoints
    to report the status of the last pipeline execution.

    Args:
        session: SQLAlchemy Session for database operations

    Returns:
        The most recent ExtractionLog entry, or None if no extractions exist

    Example:
        >>> log = get_last_extraction(session)
        >>> if log:
        ...     print(f"Last extraction: {log.status} at {log.run_date}")
    """
    last_log = (
        session.query(ExtractionLog)
        .order_by(ExtractionLog.run_date.desc())
        .limit(1)
        .first()
    )

    if last_log:
        logger.debug(
            "Last extraction: status=%s, run_date=%s",
            last_log.status,
            last_log.run_date,
        )
    else:
        logger.debug("No extraction logs found")

    return last_log
