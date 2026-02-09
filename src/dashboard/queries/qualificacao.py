"""Queries for qualification dashboard - qualified leads with emenda details."""

import pandas as pd
import streamlit as st
from sqlalchemy import text

from src.dashboard.config import get_db_engine


@st.cache_data(ttl="10m")
def get_qualified_leads(limit: int = 5000, filters: dict = None) -> pd.DataFrame:
    """Get qualified leads (2025/2026 OSCs with emendas) with full details.

    Returns proponentes ranked by value (fewer propostas = higher value).
    Includes emenda aggregations and contact information.

    Args:
        limit: Maximum number of leads to return
        filters: Optional dict with:
            - estado: str
            - max_propostas: int (filter proponentes with at most N propostas)
            - min_emendas: int (filter proponentes with at least N emendas)
            - search: str (search in nome or CNPJ)
            - is_new_lead: bool (filter only new leads, not existing clients)
            - is_existing_client: bool (filter only existing clients)

    Returns:
        DataFrame with qualified leads sorted by total_propostas ASC (fewer = better)
    """
    engine = get_db_engine()
    filters = filters or {}

    # Build WHERE clause
    where_conditions = ["p.is_osc = true"]  # Only OSCs

    if filters.get("is_new_lead"):
        where_conditions.append("p.is_existing_client = false")

    if filters.get("is_existing_client"):
        where_conditions.append("p.is_existing_client = true")

    if filters.get("estado"):
        where_conditions.append(f"p.estado = '{filters['estado']}'")

    if filters.get("max_propostas") is not None:
        where_conditions.append(f"p.total_propostas <= {filters['max_propostas']}")

    if filters.get("min_emendas"):
        where_conditions.append(f"p.total_emendas >= {filters['min_emendas']}")

    if filters.get("search"):
        search_term = filters["search"].replace("'", "''")  # SQL escape
        where_conditions.append(
            f"(p.nome ILIKE '%{search_term}%' OR p.cnpj LIKE '%{search_term}%')"
        )

    where_clause = " AND ".join(where_conditions)

    query = text(f"""
        SELECT
            p.id,
            p.cnpj,
            p.nome,
            p.natureza_juridica,
            p.estado,
            p.municipio,
            p.cep,
            p.endereco,
            p.bairro,
            p.total_propostas,
            p.total_emendas,
            p.valor_total_emendas,
            p.is_osc,
            p.is_existing_client,
            STRING_AGG(DISTINCT a.orgao, ', ') FILTER (WHERE a.orgao IS NOT NULL AND a.orgao != '' AND a.orgao != 'nan') as ministerios
        FROM proponentes p
        LEFT JOIN propostas prop ON p.cnpj = prop.proponente_cnpj
        LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
        LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
        WHERE {where_clause}
        GROUP BY p.id, p.cnpj, p.nome, p.natureza_juridica, p.estado, p.municipio, p.cep, p.endereco, p.bairro, p.total_propostas, p.total_emendas, p.valor_total_emendas, p.is_osc, p.is_existing_client
        ORDER BY
            p.is_existing_client DESC,  -- Existing clients first (for reference)
            p.total_propostas ASC,      -- Then by value (fewer propostas = higher value)
            p.total_emendas DESC,       -- More emendas = better
            p.nome ASC
        LIMIT :limit
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params={"limit": limit})

    return df


@st.cache_data(ttl="10m")
def get_proponente_emendas(cnpj: str) -> pd.DataFrame:
    """Get all emendas for a specific proponente.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        DataFrame with emenda details (parlamentar, numero, valor)
    """
    engine = get_db_engine()

    query = text("""
        SELECT DISTINCT
            e.numero as numero_emenda,
            e.autor as parlamentar,
            e.valor as valor_emenda,
            e.tipo as tipo_emenda,
            a.nome as apoiador_nome,
            a.orgao as ministerio
        FROM propostas prop
        INNER JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        INNER JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
        LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
        WHERE prop.proponente_cnpj = :cnpj
        ORDER BY e.valor DESC
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params={"cnpj": cnpj})

    return df


@st.cache_data(ttl="10m")
def get_proponente_propostas(cnpj: str) -> pd.DataFrame:
    """Get all propostas for a specific proponente.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        DataFrame with proposta details
    """
    engine = get_db_engine()

    query = text("""
        SELECT
            p.transfer_gov_id,
            p.titulo,
            p.situacao,
            p.valor_global,
            p.valor_repasse,
            p.data_publicacao,
            p.data_inicio_vigencia,
            p.data_fim_vigencia,
            prog.nome as programa_nome
        FROM propostas p
        LEFT JOIN programas prog ON p.programa_id = prog.transfer_gov_id
        WHERE p.proponente_cnpj = :cnpj
        ORDER BY p.data_publicacao DESC
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params={"cnpj": cnpj})

    return df


@st.cache_data(ttl="10m")
def get_qualification_stats() -> dict:
    """Get overall qualification statistics.

    Returns:
        Dictionary with:
        - total_leads: Total qualified leads
        - existing_clients: Existing clients count
        - new_leads: New leads count
        - total_emendas: Total emendas
        - total_valor_emendas: Total emenda value
        - avg_propostas: Average propostas per lead
        - high_value_leads: Leads with <=3 propostas (high value)
    """
    engine = get_db_engine()

    query = text("""
        SELECT
            COUNT(*) as total_leads,
            COUNT(CASE WHEN is_existing_client = true THEN 1 END) as existing_clients,
            COUNT(CASE WHEN is_existing_client = false THEN 1 END) as new_leads,
            SUM(total_emendas) as total_emendas,
            SUM(valor_total_emendas) as total_valor_emendas,
            AVG(total_propostas) as avg_propostas,
            COUNT(CASE WHEN total_propostas <= 3 THEN 1 END) as high_value_leads
        FROM proponentes
        WHERE is_osc = true
    """)

    with engine.connect() as conn:
        result = conn.execute(query)
        row = result.fetchone()

    return {
        "total_leads": row[0] or 0,
        "existing_clients": row[1] or 0,
        "new_leads": row[2] or 0,
        "total_emendas": row[3] or 0,
        "total_valor_emendas": row[4] or 0.0,
        "avg_propostas": row[5] or 0.0,
        "high_value_leads": row[6] or 0,
    }


@st.cache_data(ttl="10m")
def get_estados_disponiveis() -> list[str]:
    """Get list of available estados in qualified leads.

    Returns:
        Sorted list of UF codes
    """
    engine = get_db_engine()

    query = text("""
        SELECT DISTINCT estado
        FROM proponentes
        WHERE is_osc = true
        AND estado IS NOT NULL
        ORDER BY estado
    """)

    with engine.connect() as conn:
        result = conn.execute(query)
        estados = [row[0] for row in result]

    return estados
