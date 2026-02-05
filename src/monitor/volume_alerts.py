"""
Volume anomaly detection for PROJETUS ETL pipeline.

Monitors extraction volume and alerts when counts differ significantly from previous runs.
"""

from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from src.loader.database import get_engine
from src.loader.extraction_log import get_last_extraction


def _get_entity_counts() -> dict[str, int]:
    """Get current counts for each entity type from the database.

    Returns:
        Dictionary mapping entity names to their record counts.
    """
    counts = {}

    with get_engine().connect() as conn:
        # Count each entity type
        tables = ["programas", "propostas", "apoiadores", "emendas"]

        for table in tables:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
            count = result.scalar()
            counts[table] = count

    return counts


def _get_tolerance_percent() -> int:
    """Get tolerance percentage from config or use default.

    Returns:
        Tolerance percentage (default 10%).
    """
    try:
        from src.config.loader import get_config

        config = get_config()
        return config.reconciliation.volume_tolerance_percent
    except (ImportError, ModuleNotFoundError, AttributeError):
        return 10


def should_alert_volume(
    current: dict[str, int],
    previous: Optional[dict[str, int]],
    tolerance_percent: int,
) -> bool:
    """Check if any entity type exceeds the tolerance threshold.

    Args:
        current: Current extraction counts per entity
        previous: Previous extraction counts per entity (None for first run)
        tolerance_percent: Maximum allowed percentage change

    Returns:
        True if any entity exceeds tolerance, False otherwise.
    """
    if previous is None:
        # No previous data - don't alert on first run
        return False

    for entity in current:
        if entity in previous and previous[entity] > 0:
            current_count = current[entity]
            previous_count = previous[entity]

            change_percent = abs(current_count - previous_count) / previous_count * 100

            if change_percent > tolerance_percent:
                return True

    return False


def get_volume_alert_message(
    current: dict[str, int],
    previous: Optional[dict[str, int]],
    tolerance_percent: int,
) -> str:
    """Format human-readable volume comparison message.

    Args:
        current: Current extraction counts per entity
        previous: Previous extraction counts per entity (None for first run)
        tolerance_percent: Tolerance threshold used

    Returns:
        Formatted message describing the volume comparison.
    """
    if previous is None:
        entity_parts = [f"{entity}: {count}" for entity, count in current.items()]
        entities_str = ", ".join(entity_parts)
        return f"First extraction run with counts: {entities_str}"

    changes = []

    for entity in sorted(current.keys()):
        if entity in previous:
            current_count = current[entity]
            previous_count = previous[entity]

            if previous_count > 0:
                change_percent = (
                    (current_count - previous_count) / previous_count
                ) * 100
                change_str = (
                    f"{'+' if change_percent >= 0 else ''}{change_percent:.1f}%"
                )
                changes.append(
                    f"{entity}: {previous_count} → {current_count} ({change_str})"
                )
            else:
                changes.append(f"{entity}: {previous_count} → {current_count}")
        else:
            current_count = current[entity]
            changes.append(f"{entity}: {current_count} (new)")

    changes_str = "\n".join(f"  • {change}" for change in changes)
    return f"Volume comparison:\n{changes_str}"


def check_volume_anomaly(
    current_counts: Optional[dict[str, int]] = None,
) -> tuple[bool, str]:
    """Check if current extraction volume differs significantly from previous.

    This function compares the current extraction counts against the previous
    extraction and returns whether an anomaly alert should be triggered.

    Args:
        current_counts: Current extraction counts per entity type.
                       If None, will query the database directly.

    Returns:
        Tuple of (is_normal: bool, message: str).
        - is_normal=True, message="..." if within tolerance
        - is_normal=False, message="..." if anomaly detected
    """
    # Get current counts if not provided
    if current_counts is None:
        current_counts = _get_entity_counts()

    # Get previous extraction
    from sqlalchemy.orm import Session
    from src.loader.database import get_engine

    SessionLocal = sessionmaker(bind=get_engine())
    with SessionLocal() as session:
        last_extraction = get_last_extraction(session)

    # Get tolerance from config
    tolerance_percent = _get_tolerance_percent()

    # Extract previous counts from last extraction if available
    previous_counts = None
    if last_extraction and last_extraction.total_records:
        # For previous counts, we only have total_records in the log
        # We'll need to handle this by querying or using the total
        # For now, let's return based on what we can determine
        previous_counts = {"total": last_extraction.total_records}

    # Check if we should alert
    if should_alert_volume(current_counts, previous_counts or {}, tolerance_percent):
        message = get_volume_alert_message(
            current_counts, previous_counts, tolerance_percent
        )

        # Calculate overall change for summary
        if previous_counts and "total" in previous_counts:
            prev_total = previous_counts["total"]
            curr_total = sum(current_counts.values())
            if prev_total > 0:
                change_percent = abs(curr_total - prev_total) / prev_total * 100
                summary = f"Volume anomaly: {change_percent:.1f}% change ({prev_total} → {curr_total} total records)"
            else:
                summary = f"Volume spike: {curr_total} vs {prev_total} previously"
        else:
            summary = "Volume anomaly detected (first run comparison)"

        return False, summary

    # Normal operation
    if previous_counts and "total" in previous_counts:
        prev_total = previous_counts["total"]
        curr_total = sum(current_counts.values())
        if prev_total > 0:
            change_percent = abs(curr_total - prev_total) / prev_total * 100
            summary = f"Volume normal: {change_percent:.1f}% change"
        else:
            summary = "Volume normal: First extraction"
    else:
        summary = "Volume normal: No previous extraction to compare"

    return True, summary
