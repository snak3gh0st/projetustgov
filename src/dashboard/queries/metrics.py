"""Query functions for dashboard KPI metrics.

Provides cached functions for:
- Entity row counts across all tables
- Data freshness based on most recent extraction
"""

from datetime import datetime, timezone

import streamlit as st
from sqlalchemy import func, select

from src.dashboard.config import get_db_engine
from src.loader.db_models import Apoiador, Emenda, ExtractionLog, Programa, Proposta


@st.cache_data(ttl="10m")
def get_entity_counts() -> dict:
    """Get row counts for all entity tables.

    Returns:
        Dictionary with counts: {"programas": N, "propostas": N, "apoiadores": N, "emendas": N}
    """
    engine = get_db_engine()

    counts = {}

    with engine.connect() as conn:
        # Count programas
        result = conn.execute(select(func.count()).select_from(Programa))
        counts["programas"] = result.scalar() or 0

        # Count propostas
        result = conn.execute(select(func.count()).select_from(Proposta))
        counts["propostas"] = result.scalar() or 0

        # Count apoiadores
        result = conn.execute(select(func.count()).select_from(Apoiador))
        counts["apoiadores"] = result.scalar() or 0

        # Count emendas
        result = conn.execute(select(func.count()).select_from(Emenda))
        counts["emendas"] = result.scalar() or 0

    return counts


@st.cache_data(ttl="10m")
def get_data_freshness() -> dict:
    """Get data freshness information from most recent extraction.

    Returns:
        Dictionary with:
        - last_extraction: datetime of most recent extraction (or None)
        - hours_ago: hours since last extraction (or None)
        - status: "fresh" (<25h), "stale" (<48h), "critical" (>48h), or "no_data"
    """
    engine = get_db_engine()

    with engine.connect() as conn:
        # Get most recent extraction log
        result = conn.execute(
            select(ExtractionLog.run_date)
            .order_by(ExtractionLog.run_date.desc())
            .limit(1)
        )
        row = result.fetchone()

        if not row or row[0] is None:
            return {
                "last_extraction": None,
                "hours_ago": None,
                "status": "no_data",
            }

        last_extraction = row[0]

        # Calculate hours ago
        now = datetime.now(timezone.utc)
        # Make last_extraction timezone-aware if it isn't
        if last_extraction.tzinfo is None:
            last_extraction = last_extraction.replace(tzinfo=timezone.utc)

        hours_ago = (now - last_extraction).total_seconds() / 3600

        # Determine status
        if hours_ago < 25:
            status = "fresh"
        elif hours_ago < 48:
            status = "stale"
        else:
            status = "critical"

        return {
            "last_extraction": last_extraction,
            "hours_ago": hours_ago,
            "status": status,
        }
