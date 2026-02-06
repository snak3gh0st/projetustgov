"""Query functions for entity data retrieval.

Provides cached functions for querying all entity tables with optional filters.
All queries use LIMIT to prevent large result sets from blocking reruns.
"""

from datetime import date, timedelta

import pandas as pd
import streamlit as st
from sqlalchemy import and_, select, text

from src.dashboard.config import get_db_engine, run_query
from src.loader.db_models import (
    Apoiador,
    Emenda,
    Programa,
    Proposta,
    PropostaApoiador,
    PropostaEmenda,
)


@st.cache_data(ttl="10m")
def get_propostas(limit: int = 1000, filters: dict = None) -> pd.DataFrame:
    """Query propostas table with optional filters.

    Args:
        limit: Maximum number of rows to return (default: 1000)
        filters: Optional dict with filter criteria:
            - estado: str (UF code)
            - situacao: str
            - date_start: date
            - date_end: date
            - year: int (filter by year from data_publicacao)

    Returns:
        DataFrame with proposta records
    """
    engine = get_db_engine()
    filters = filters or {}

    with engine.connect() as conn:
        query = select(Proposta)

        # Apply filters
        conditions = []
        if filters.get("estado"):
            conditions.append(Proposta.estado == filters["estado"])
        if filters.get("situacao"):
            conditions.append(Proposta.situacao == filters["situacao"])
        if filters.get("date_start"):
            conditions.append(Proposta.data_publicacao >= filters["date_start"])
        if filters.get("date_end"):
            conditions.append(Proposta.data_publicacao <= filters["date_end"])
        if filters.get("year"):
            from sqlalchemy import extract
            # Use extraction_date as fallback when data_publicacao is not populated
            conditions.append(extract('year', Proposta.extraction_date) == filters["year"])

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(Proposta.created_at.desc()).limit(limit)

        result = conn.execute(query)
        rows = result.fetchall()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame([row._asdict() for row in rows])
        return df


@st.cache_data(ttl="10m")
def get_recent_propostas(days: int = 7) -> pd.DataFrame:
    """Query recent propostas based on extraction_date.

    This is specifically for the home page's operational view.
    Filters WHERE extraction_date >= (today - days).

    Args:
        days: Number of days to look back (default: 7)

    Returns:
        DataFrame with recent propostas sorted by extraction_date DESC
    """
    cutoff_date = date.today() - timedelta(days=days)

    engine = get_db_engine()

    with engine.connect() as conn:
        query = (
            select(Proposta)
            .where(Proposta.extraction_date >= cutoff_date)
            .order_by(Proposta.extraction_date.desc())
            .limit(1000)
        )

        result = conn.execute(query)
        rows = result.fetchall()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame([row._asdict() for row in rows])
        return df


@st.cache_data(ttl="10m")
def get_programas(limit: int = 1000, filters: dict = None) -> pd.DataFrame:
    """Query programas table with optional filters.

    Args:
        limit: Maximum number of rows to return (default: 1000)
        filters: Optional dict with filter criteria

    Returns:
        DataFrame with programa records
    """
    engine = get_db_engine()

    with engine.connect() as conn:
        query = select(Programa).order_by(Programa.created_at.desc()).limit(limit)
        result = conn.execute(query)
        rows = result.fetchall()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame([row._asdict() for row in rows])
        return df


@st.cache_data(ttl="10m")
def get_apoiadores(limit: int = 1000, filters: dict = None) -> pd.DataFrame:
    """Query apoiadores table with optional filters.

    Args:
        limit: Maximum number of rows to return (default: 1000)
        filters: Optional dict with filter criteria

    Returns:
        DataFrame with apoiador records
    """
    engine = get_db_engine()

    with engine.connect() as conn:
        query = select(Apoiador).order_by(Apoiador.created_at.desc()).limit(limit)
        result = conn.execute(query)
        rows = result.fetchall()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame([row._asdict() for row in rows])
        return df


@st.cache_data(ttl="10m")
def get_emendas(limit: int = 1000, filters: dict = None) -> pd.DataFrame:
    """Query emendas table with optional filters.

    Args:
        limit: Maximum number of rows to return (default: 1000)
        filters: Optional dict with filter criteria

    Returns:
        DataFrame with emenda records
    """
    engine = get_db_engine()

    with engine.connect() as conn:
        query = select(Emenda).order_by(Emenda.created_at.desc()).limit(limit)
        result = conn.execute(query)
        rows = result.fetchall()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame([row._asdict() for row in rows])
        return df


@st.cache_data(ttl="10m")
def get_related_entities(proposta_id: str) -> dict:
    """Get all entities related to a specific proposta.

    Uses CNPJ-based lookups since junction tables reference propostas
    from all years but we only load 2025-2026 filtered data.

    Args:
        proposta_id: transfer_gov_id of the proposta

    Returns:
        Dictionary with:
        - proponente: DataFrame with proponente details (including emenda stats)
        - outras_propostas: DataFrame with other propostas from same proponente
    """
    # Get proponente details via CNPJ
    proponente_query = """
        SELECT prop.*
        FROM proponentes prop
        INNER JOIN propostas pr ON pr.proponente_cnpj = prop.cnpj
        WHERE pr.transfer_gov_id = :proposta_id
        LIMIT 1
    """
    proponente_df = run_query(proponente_query, {"proposta_id": proposta_id})

    # Get other propostas from the same proponente
    outras_query = """
        SELECT p2.*
        FROM propostas p2
        WHERE p2.proponente_cnpj = (
            SELECT p.proponente_cnpj FROM propostas p
            WHERE p.transfer_gov_id = :proposta_id
        )
        AND p2.transfer_gov_id != :proposta_id
        ORDER BY p2.created_at DESC
        LIMIT 50
    """
    outras_df = run_query(outras_query, {"proposta_id": proposta_id})

    return {
        "proponente": proponente_df,
        "outras_propostas": outras_df,
    }
