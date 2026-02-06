"""Database connection configuration for Streamlit dashboard.

This module provides cached database access functions that reuse the
existing database infrastructure from src.loader.database.
"""

import pandas as pd
import streamlit as st
from sqlalchemy import Engine, text

from src.loader.database import get_engine


def get_db_engine() -> Engine:
    """Get the SQLAlchemy engine for database queries.

    Reuses the existing engine from src.loader.database.get_engine().

    Returns:
        SQLAlchemy Engine instance
    """
    return get_engine()


@st.cache_data(ttl="10m")
def run_query(query_str: str, params: dict = None) -> pd.DataFrame:
    """Execute a SQL query and return results as a pandas DataFrame.

    This function is cached for 10 minutes to improve dashboard performance.

    Args:
        query_str: SQL query string (can use :param_name for parameters)
        params: Dictionary of parameter values (default: None)

    Returns:
        DataFrame with query results
    """
    engine = get_db_engine()

    with engine.connect() as conn:
        result = conn.execute(text(query_str), params or {})
        df = pd.DataFrame(result.fetchall(), columns=result.keys())

    return df
