"""Query functions for proponente data retrieval.

Provides cached functions for querying the proponentes table with optional filters.
Specifically designed for client qualification workflow - ranks proponents by value
(fewer proposals = higher value = more receptive to new partnerships).
"""

import pandas as pd
import streamlit as st
from sqlalchemy import and_, extract, func, select

from src.dashboard.config import get_db_engine
from src.loader.db_models import Proponente, Proposta


@st.cache_data(ttl="10m")
def get_proponentes(limit: int = 5000, filters: dict = None) -> pd.DataFrame:
    """Query proponentes table with optional filters.

    Args:
        limit: Maximum number of rows to return (default: 5000)
        filters: Optional dict with filter criteria:
            - is_osc: bool (filter by OSC classification)
            - estado: str (filter by state UF code)
            - search: str (ILIKE search on nome or cnpj)
            - min_propostas: int (filter by minimum proposal count)
            - max_propostas: int (filter by maximum proposal count)

    Returns:
        DataFrame with proponente records ordered by total_propostas ASC
        (fewer proposals = higher value = shown first)
    """
    engine = get_db_engine()
    filters = filters or {}

    with engine.connect() as conn:
        # Join with propostas to filter by year (using data_publicacao)
        query = (
            select(Proponente)
            .join(Proposta, Proponente.cnpj == Proposta.proponente_cnpj)
            .where(extract('year', Proposta.data_publicacao) == 2026)  # Filter for 2026 data only
            .distinct()  # Remove duplicates from join
        )

        # Apply filters
        conditions = []

        # ALWAYS filter to OSCs only (per user requirement)
        conditions.append(Proponente.is_osc == True)

        if filters.get("is_osc") is not None:
            # Override if explicitly set in filters
            conditions[-1] = Proponente.is_osc == filters["is_osc"]

        if filters.get("estado"):
            conditions.append(Proponente.estado == filters["estado"])

        if filters.get("search"):
            search_term = f"%{filters['search']}%"
            conditions.append(
                (Proponente.nome.ilike(search_term))
                | (Proponente.cnpj.ilike(search_term))
            )

        if filters.get("min_propostas") is not None:
            conditions.append(Proponente.total_propostas >= filters["min_propostas"])

        if filters.get("max_propostas") is not None:
            conditions.append(Proponente.total_propostas <= filters["max_propostas"])

        if conditions:
            query = query.where(and_(*conditions))

        # Order by total_propostas ASC - fewer proposals = higher value
        query = query.order_by(Proponente.total_propostas.asc()).limit(limit)

        result = conn.execute(query)
        rows = result.fetchall()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame([row._asdict() for row in rows])
        return df


@st.cache_data(ttl="10m")
def get_proponente_estados() -> list[str]:
    """Get distinct estado values for filter dropdown.

    Returns:
        List of unique estado UF codes, sorted alphabetically
    """
    engine = get_db_engine()

    with engine.connect() as conn:
        # Only estados from 2026 OSC proponentes (using data_publicacao)
        query = (
            select(Proponente.estado)
            .join(Proposta, Proponente.cnpj == Proposta.proponente_cnpj)
            .where(and_(
                extract('year', Proposta.data_publicacao) == 2026,
                Proponente.is_osc == True,
                Proponente.estado.isnot(None)
            ))
            .distinct()
        )
        result = conn.execute(query)
        rows = result.fetchall()

        estados = sorted([row[0] for row in rows if row[0]])
        return estados


@st.cache_data(ttl="10m")
def get_proponente_stats() -> dict:
    """Get aggregate statistics about proponentes.

    Returns:
        Dictionary with:
        - total_count: Total number of proponentes
        - osc_count: Number of OSC proponentes
        - government_count: Number of government proponentes
        - avg_propostas: Average number of propostas per proponente
    """
    engine = get_db_engine()

    with engine.connect() as conn:
        # Total count (2026 proponentes - all types)
        total_query = (
            select(func.count(func.distinct(Proponente.id)))
            .select_from(Proponente)
            .join(Proposta, Proponente.cnpj == Proposta.proponente_cnpj)
            .where(extract('year', Proposta.data_publicacao) == 2026)
        )
        total_result = conn.execute(total_query)
        total_count = total_result.scalar() or 0

        # OSC count (2026 + OSC)
        osc_query = (
            select(func.count(func.distinct(Proponente.id)))
            .select_from(Proponente)
            .join(Proposta, Proponente.cnpj == Proposta.proponente_cnpj)
            .where(and_(
                extract('year', Proposta.data_publicacao) == 2026,
                Proponente.is_osc == True
            ))
        )
        osc_result = conn.execute(osc_query)
        osc_count = osc_result.scalar() or 0

        # Government count
        gov_count = total_count - osc_count

        # Average propostas (for 2026 OSCs only)
        avg_query = (
            select(func.avg(Proponente.total_propostas))
            .select_from(Proponente)
            .join(Proposta, Proponente.cnpj == Proposta.proponente_cnpj)
            .where(and_(
                extract('year', Proposta.data_publicacao) == 2026,
                Proponente.is_osc == True
            ))
        )
        avg_result = conn.execute(avg_query)
        avg_propostas = avg_result.scalar() or 0.0

        return {
            "total_count": total_count,
            "osc_count": osc_count,
            "government_count": gov_count,
            "avg_propostas": round(avg_propostas, 2),
        }
