"""Query functions for chart data aggregations.

Provides cached functions for:
- Geographic distribution (proponents by estado)
- Value distribution (proponents by proposal count tiers)
- Time trends (proposals over time)
- Extraction sparkline data (daily extraction volumes)

All queries follow caching patterns from qualificacao.py and metrics.py.
"""

from datetime import date, timedelta

import pandas as pd
import streamlit as st
from sqlalchemy import text

from src.dashboard.config import get_db_engine


@st.cache_data(ttl="30m")
def get_proponentes_por_estado() -> pd.DataFrame:
    """Get proponent counts and aggregations by estado.

    Aggregates qualified leads (non-public administration) by state.
    Used for choropleth map coloring.

    Returns:
        DataFrame with columns:
        - estado: UF code (SP, RJ, etc.)
        - total_proponentes: count of proponents
        - total_emendas: sum of emendas across proponents
        - total_valor_emendas: sum of emenda values
    """
    engine = get_db_engine()

    query = text("""
        SELECT
            estado,
            COUNT(*) as total_proponentes,
            SUM(total_emendas) as total_emendas,
            SUM(valor_total_emendas) as total_valor_emendas
        FROM proponentes
        WHERE natureza_juridica NOT ILIKE '%Administra%'
        AND estado IS NOT NULL
        GROUP BY estado
        ORDER BY total_proponentes DESC
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn)

    return df


@st.cache_data(ttl="30m")
def get_value_distribution() -> pd.DataFrame:
    """Get proponent count distribution by value tier.

    Categorizes proponents by total_propostas (fewer = higher value).
    Used for horizontal bar chart.

    Returns:
        DataFrame with columns:
        - faixa: tier label (Portuguese)
        - quantidade: count of proponents in tier
    """
    engine = get_db_engine()

    query = text("""
        SELECT faixa, quantidade FROM (
            SELECT
                CASE
                    WHEN total_propostas = 1 THEN '1 proposta (Alto Valor)'
                    WHEN total_propostas BETWEEN 2 AND 3 THEN '2-3 propostas (Bom Valor)'
                    WHEN total_propostas BETWEEN 4 AND 5 THEN '4-5 propostas (Medio)'
                    WHEN total_propostas BETWEEN 6 AND 10 THEN '6-10 propostas (Baixo)'
                    ELSE '10+ propostas (Muito Baixo)'
                END as faixa,
                CASE
                    WHEN total_propostas = 1 THEN 1
                    WHEN total_propostas BETWEEN 2 AND 3 THEN 2
                    WHEN total_propostas BETWEEN 4 AND 5 THEN 3
                    WHEN total_propostas BETWEEN 6 AND 10 THEN 4
                    ELSE 5
                END as sort_order,
                COUNT(*) as quantidade
            FROM proponentes
            WHERE natureza_juridica NOT ILIKE '%Administra%'
            GROUP BY faixa, sort_order
        ) sub
        ORDER BY sort_order
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn)

    return df


@st.cache_data(ttl="30m")
def get_propostas_trend(granularity: str = "monthly") -> pd.DataFrame:
    """Get proposal counts over time.

    Aggregates proposals by publication date.
    Used for time series line chart.

    Args:
        granularity: 'monthly' or 'yearly' (default: monthly)

    Returns:
        DataFrame with columns:
        - periodo: date/year of period
        - total_propostas: count of proposals
        - valor_total: sum of valor_global
    """
    engine = get_db_engine()

    if granularity == "monthly":
        period_expr = "DATE_TRUNC('month', data_publicacao)"
    else:  # yearly
        period_expr = "EXTRACT(YEAR FROM data_publicacao)"

    query = text(f"""
        SELECT
            {period_expr} as periodo,
            COUNT(*) as total_propostas,
            SUM(valor_global) as valor_total
        FROM propostas
        WHERE data_publicacao IS NOT NULL
        GROUP BY periodo
        ORDER BY periodo ASC
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn)

    return df


@st.cache_data(ttl="10m")
def get_extraction_sparkline_data(days: int = 30) -> dict[str, list[float]]:
    """Get daily extraction volumes for sparkline charts.

    Queries extraction logs for the last N days and returns
    daily record counts suitable for sparkline visualization.

    Args:
        days: Number of days to look back (default: 30)

    Returns:
        Dictionary with entity names as keys and daily counts as values.
        Returns empty dict if fewer than 3 data points.
        Example: {'total_records': [100, 150, 200, ...]}
    """
    cutoff_date = date.today() - timedelta(days=days)

    engine = get_db_engine()

    query = text("""
        SELECT
            DATE(run_date) as extraction_date,
            SUM(total_records) as total_records
        FROM extraction_logs
        WHERE run_date >= :cutoff_date
        GROUP BY DATE(run_date)
        ORDER BY extraction_date ASC
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params={"cutoff_date": cutoff_date})

    # Return empty dict if insufficient data
    if len(df) < 3:
        return {}

    return {
        "total_records": df["total_records"].tolist(),
    }
