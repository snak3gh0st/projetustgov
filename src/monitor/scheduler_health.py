"""
Scheduler health check for PROJETUS ETL pipeline.

Monitors extraction scheduler and alerts when runs are missed or delayed.
"""

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from src.loader.database import get_engine
from src.loader.extraction_log import get_last_extraction


def _get_extraction_hour() -> int:
    """Get expected extraction hour from config or use default.

    Returns:
        Expected extraction hour (default 9 for 9 AM).
    """
    try:
        from src.config.loader import get_config

        config = get_config()
        return config.extraction.hour
    except (ImportError, ModuleNotFoundError, AttributeError):
        return 9


def should_alert_scheduler_miss(
    last_extraction: Optional[object],
    expected_hour: int = 9,
) -> bool:
    """Check if scheduler miss should trigger an alert.

    Args:
        last_extraction: The last extraction log entry (or None)
        expected_hour: The hour when extraction should run (0-23)

    Returns:
        True if scheduler miss should be alerted, False otherwise.
    """
    if last_extraction is None:
        # No extraction records - definitely should alert
        return True

    # Check if last extraction was within the expected window
    now = datetime.now()
    last_time = last_extraction.run_date

    # Calculate the expected extraction window
    # Extraction should run at expected_hour on the current day (if after that hour)
    # or yesterday (if before that hour)
    expected_time_today = now.replace(
        hour=expected_hour, minute=0, second=0, microsecond=0
    )

    # If we're past today's extraction time, it should have run today
    if now >= expected_time_today:
        expected_run_time = expected_time_today
    else:
        # If we're before today's extraction time, it should have run yesterday
        expected_run_time = expected_time_today - timedelta(days=1)

    # Allow a 25-hour window (one missed day plus some buffer)
    alert_threshold = expected_run_time + timedelta(hours=25)

    return last_time < alert_threshold


def get_scheduler_status() -> dict:
    """Get the current scheduler status as a dictionary.

    This function is used by health check endpoints to report
    the status of the extraction scheduler.

    Returns:
        Dictionary with status, details, and hours_since information.
    """
    expected_hour = _get_extraction_hour()

    # Get last extraction
    SessionLocal = Session(bind=get_engine())
    with SessionLocal() as session:
        last_extraction = get_last_extraction(session)

    # Determine status
    now = datetime.now()

    if last_extraction is None:
        return {
            "status": "unhealthy",
            "details": "No extraction records found",
            "hours_since": None,
            "expected_hour": expected_hour,
        }

    last_time = last_extraction.run_date
    hours_since = (now - last_time).total_seconds() / 3600

    # Calculate expected time
    expected_time_today = now.replace(
        hour=expected_hour, minute=0, second=0, microsecond=0
    )

    if now >= expected_time_today:
        expected_run_time = expected_time_today
    else:
        expected_run_time = expected_time_today - timedelta(days=1)

    # Allow 25 hours window (one missed day)
    if last_time >= expected_run_time:
        status = "healthy"
        details = (
            f"Scheduler healthy: Last ran at {last_time.strftime('%Y-%m-%d %H:%M')}"
        )
    elif last_time >= expected_run_time - timedelta(hours=1):
        status = "healthy"  # Still within acceptable window
        details = (
            f"Scheduler healthy: Last ran at {last_time.strftime('%Y-%m-%d %H:%M')}"
        )
    else:
        status = "degraded"
        details = (
            f"Scheduler degraded: Last extraction was at "
            f"{last_time.strftime('%Y-%m-%d %H:%M')}, "
            f"expected by {expected_run_time.strftime('%Y-%m-%d %H:%M')}"
        )

    return {
        "status": status,
        "details": details,
        "hours_since": round(hours_since, 1),
        "expected_hour": expected_hour,
        "last_extraction_time": last_time.isoformat(),
    }


def check_scheduler_health(
    expected_hour: int = 9,
) -> tuple[bool, str]:
    """Check if the extraction scheduler is running on schedule.

    This function verifies that extractions are running at the expected
    time and alerts if there's a significant delay or miss.

    Args:
        expected_hour: The hour when extraction should run (0-23, default 9)

    Returns:
        Tuple of (is_healthy: bool, message: str).
        - is_healthy=True, message="..." if running on schedule
        - is_healthy=False, message="..." if scheduler miss detected
    """
    # Get last extraction
    SessionLocal = Session(bind=get_engine())
    with SessionLocal() as session:
        last_extraction = get_last_extraction(session)

    # Calculate time boundaries
    now = datetime.now()

    if expected_hour < 0 or expected_hour > 23:
        expected_hour = 9  # Fallback to default

    # Calculate when the last extraction should have been
    expected_time_today = now.replace(
        hour=expected_hour, minute=0, second=0, microsecond=0
    )

    if now >= expected_time_today:
        expected_run_time = expected_time_today
    else:
        expected_run_time = expected_time_today - timedelta(days=1)

    # No extractions yet
    if last_extraction is None:
        return False, (
            f"Scheduler miss: No extraction records found. "
            f"Expected by {expected_run_time.strftime('%Y-%m-%d %H:%M')}"
        )

    last_time = last_extraction.run_date

    # Check if last extraction was within the 25-hour window
    alert_threshold = expected_run_time + timedelta(hours=25)

    if last_time >= alert_threshold:
        # Last extraction was too long ago
        hours_overdue = (alert_threshold - last_time).total_seconds() / 3600
        return False, (
            f"Scheduler miss: Last extraction was {hours_overdue:.1f} hours overdue. "
            f"Expected by {expected_run_time.strftime('%Y-%m-%d %H:%M')}, "
            f"last ran at {last_time.strftime('%Y-%m-%d %H:%M')}"
        )

    # Everything is fine
    return True, (
        f"Scheduler healthy: Last ran at {last_time.strftime('%Y-%m-%d %H:%M')}"
    )
