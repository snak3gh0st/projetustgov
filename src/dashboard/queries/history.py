"""Query functions for extraction history and pipeline audit trail."""

from datetime import date, timedelta

import pandas as pd
import streamlit as st
from sqlalchemy import select

from src.dashboard.config import get_db_engine
from src.loader.db_models import ExtractionLog


@st.cache_data(ttl="10m")
def get_extraction_history(days: int = 30) -> pd.DataFrame:
    """Query extraction logs for the last N days.

    Args:
        days: Number of days to look back (default: 30)

    Returns:
        DataFrame with columns:
        - run_date: datetime
        - status: str ('success', 'partial', 'failed')
        - total_records: int
        - records_inserted: int
        - records_updated: int
        - duration_seconds: float
        - error_message: str (optional)
    """
    cutoff_date = date.today() - timedelta(days=days)

    engine = get_db_engine()

    with engine.connect() as conn:
        query = (
            select(
                ExtractionLog.run_date,
                ExtractionLog.status,
                ExtractionLog.total_records,
                ExtractionLog.records_inserted,
                ExtractionLog.records_updated,
                ExtractionLog.duration_seconds,
                ExtractionLog.error_message,
            )
            .where(ExtractionLog.run_date >= cutoff_date)
            .order_by(ExtractionLog.run_date.desc())
        )

        result = conn.execute(query)
        rows = result.fetchall()

        if not rows:
            return pd.DataFrame(
                columns=[
                    "run_date",
                    "status",
                    "total_records",
                    "records_inserted",
                    "records_updated",
                    "duration_seconds",
                    "error_message",
                ]
            )

        df = pd.DataFrame(
            [
                {
                    "run_date": row[0],
                    "status": row[1],
                    "total_records": row[2],
                    "records_inserted": row[3],
                    "records_updated": row[4],
                    "duration_seconds": row[5],
                    "error_message": row[6],
                }
                for row in rows
            ]
        )

        return df
