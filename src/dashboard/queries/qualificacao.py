"""Queries for qualification dashboard - qualified leads with emenda details."""

import pandas as pd
import streamlit as st
from sqlalchemy import text

from src.dashboard.config import get_db_engine


@st.cache_data(ttl="30m")  # Increased cache from 10m to 30m
def get_qualified_leads(limit: int = 5000, filters: dict = None) -> pd.DataFrame:
    """Get qualified leads (2025/2026 private CNPJs) with full details.

    Returns proponentes ranked by value (fewer propostas = higher value).
    Excludes public administration entities. Includes emenda aggregations and contact information.

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
    where_conditions = ["p.natureza_juridica NOT ILIKE '%Administra%'"]  # Exclude public administration

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

    # OPTIMIZED: Removed expensive STRING_AGG + multiple JOINs
    # Query proponentes directly, fetch ministerios separately for selected lead
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
            p.total_convenios,
            p.valor_total_desembolsos,
            p.email,
            p.telefone,
            p.is_osc,
            p.is_existing_client
        FROM proponentes p
        WHERE {where_clause}
        ORDER BY
            p.is_existing_client DESC,  -- Existing clients first (for reference)
            p.total_propostas ASC,      -- Then by value (fewer propostas = higher value)
            p.total_emendas DESC,       -- More emendas = better
            p.nome ASC
        LIMIT :limit
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params={"limit": limit})

    # Fetch ministerios separately for better performance
    # Only fetch for displayed leads
    if not df.empty:
        ministerios_dict = _get_ministerios_batch(engine, df['cnpj'].tolist())
        df['ministerios'] = df['cnpj'].map(lambda cnpj: ministerios_dict.get(cnpj, 'N/A'))
    else:
        df['ministerios'] = None

    return df


def _get_ministerios_batch(engine, cnpj_list: list[str]) -> dict[str, str]:
    """Fetch ministerios for a batch of CNPJs efficiently.

    Args:
        engine: SQLAlchemy engine
        cnpj_list: List of CNPJs to fetch ministerios for

    Returns:
        Dictionary mapping CNPJ to comma-separated ministerios
    """
    if not cnpj_list:
        return {}

    # Batch fetch with IN clause
    placeholders = ','.join([f"'{cnpj}'" for cnpj in cnpj_list[:100]])  # Limit to 100 CNPJs

    query = text(f"""
        SELECT
            prop.proponente_cnpj,
            STRING_AGG(DISTINCT a.orgao, ', ') FILTER (WHERE a.orgao IS NOT NULL AND a.orgao != '' AND a.orgao != 'nan') as ministerios
        FROM propostas prop
        LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
        LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
        WHERE prop.proponente_cnpj IN ({placeholders})
        GROUP BY prop.proponente_cnpj
    """)

    with engine.connect() as conn:
        result = conn.execute(query)
        return {row[0]: row[1] or 'N/A' for row in result}


@st.cache_data(ttl="30m")  # Increased cache
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


@st.cache_data(ttl="30m")  # Increased cache
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


@st.cache_data(ttl="30m")  # Increased cache
def get_qualification_stats() -> dict:
    """Get overall qualification statistics.

    Returns:
        Dictionary with stats including convenios and desembolsos.
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
            COUNT(CASE WHEN total_propostas <= 3 THEN 1 END) as high_value_leads,
            SUM(total_convenios) as total_convenios,
            SUM(valor_total_desembolsos) as total_valor_desembolsos
        FROM proponentes
        WHERE natureza_juridica NOT ILIKE '%Administra%'
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
        "total_convenios": row[7] or 0,
        "total_valor_desembolsos": row[8] or 0.0,
    }


@st.cache_data(ttl="30m")  # Increased cache
def get_estados_disponiveis() -> list[str]:
    """Get list of available estados in qualified leads.

    Returns:
        Sorted list of UF codes
    """
    engine = get_db_engine()

    query = text("""
        SELECT DISTINCT estado
        FROM proponentes
        WHERE natureza_juridica NOT ILIKE '%Administra%'
        AND estado IS NOT NULL
        ORDER BY estado
    """)

    with engine.connect() as conn:
        result = conn.execute(query)
        estados = [row[0] for row in result]

    return estados


@st.cache_data(ttl="30m")  # Increased cache
def get_proponente_convenios(cnpj: str) -> pd.DataFrame:
    """Get all convênios for a specific proponente.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        DataFrame with convênio details
    """
    engine = get_db_engine()

    query = text("""
        SELECT
            c.transfer_gov_id as nr_convenio,
            c.situacao,
            c.instrumento_ativo,
            c.valor_global,
            c.valor_repasse,
            c.valor_desembolsado,
            c.data_assinatura,
            c.data_inicio_vigencia,
            c.data_fim_vigencia,
            c.ano
        FROM convenios c
        INNER JOIN propostas p ON c.proposta_id = p.transfer_gov_id
        WHERE p.proponente_cnpj = :cnpj
        ORDER BY c.data_assinatura DESC NULLS LAST
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params={"cnpj": cnpj})

    return df


@st.cache_data(ttl="30m")  # Increased cache
def get_proponente_historico(cnpj: str) -> pd.DataFrame:
    """Get situation history for all proposals of a proponente.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        DataFrame with historical situation changes
    """
    engine = get_db_engine()

    query = text("""
        SELECT
            h.proposta_id,
            h.convenio_id as nr_convenio,
            h.data_historico,
            h.situacao,
            h.dias_historico,
            p.titulo as proposta_titulo
        FROM historico_situacao h
        INNER JOIN propostas p ON h.proposta_id = p.transfer_gov_id
        WHERE p.proponente_cnpj = :cnpj
        ORDER BY h.data_historico DESC
        LIMIT 100
    """)

    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params={"cnpj": cnpj})

    return df
