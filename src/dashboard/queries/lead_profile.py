"""Lead profile queries for detailed proponente views.

This module provides comprehensive queries for the lead profile page,
including overview data, emendas, propostas, ministerios, and programas.
"""

import pandas as pd
import streamlit as st

from src.dashboard.config import run_query
from src.dashboard.utils.tiers import calculate_value_tier


@st.cache_data(ttl="5m")
def get_lead_overview(cnpj: str) -> pd.DataFrame:
    """Get complete overview data for a specific proponente.

    Fetches all proponente fields and computes tier classification.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        Single-row DataFrame with all proponente fields plus tier_classification
    """
    query = """
        SELECT
            id,
            cnpj,
            nome,
            email,
            telefone,
            endereco,
            bairro,
            municipio,
            estado,
            cep,
            natureza_juridica,
            total_propostas,
            total_emendas,
            valor_total_emendas,
            total_convenios,
            valor_total_desembolsos,
            is_existing_client,
            is_osc
        FROM proponentes
        WHERE cnpj = :cnpj
    """

    df = run_query(query, params={"cnpj": cnpj})

    # Add tier classification (Python-side computation)
    if not df.empty:
        row = df.iloc[0]
        tier = calculate_value_tier(
            total_propostas=row['total_propostas'],
            valor_emendas=row['valor_total_emendas'] or 0.0,
            total_convenios=row['total_convenios']
        )
        df['tier_classification'] = tier

    return df


@st.cache_data(ttl="5m")
def get_lead_emendas(cnpj: str, limit: int = 100) -> pd.DataFrame:
    """Get emendas associated with a specific proponente.

    Reuses the query pattern from qualificacao.py with added limit.

    Args:
        cnpj: Proponente CNPJ
        limit: Maximum number of emendas to return (default: 100)

    Returns:
        DataFrame with emenda details sorted by valor DESC
    """
    query = """
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
        LIMIT :limit
    """

    df = run_query(query, params={"cnpj": cnpj, "limit": limit})
    return df


@st.cache_data(ttl="5m")
def get_lead_propostas(cnpj: str, limit: int = 100) -> pd.DataFrame:
    """Get propostas submitted by a specific proponente.

    Reuses the query pattern from qualificacao.py with added limit.

    Args:
        cnpj: Proponente CNPJ
        limit: Maximum number of propostas to return (default: 100)

    Returns:
        DataFrame with proposta details sorted by data_publicacao DESC
    """
    query = """
        SELECT
            p.transfer_gov_id,
            p.titulo,
            p.situacao,
            p.valor_global,
            p.valor_repasse,
            p.data_publicacao,
            prog.nome as programa_nome
        FROM propostas p
        LEFT JOIN programas prog ON p.programa_id = prog.transfer_gov_id
        WHERE p.proponente_cnpj = :cnpj
        ORDER BY p.data_publicacao DESC
        LIMIT :limit
    """

    df = run_query(query, params={"cnpj": cnpj, "limit": limit})
    return df


@st.cache_data(ttl="5m")
def get_lead_ministerios(cnpj: str) -> pd.DataFrame:
    """Get ministerios/orgaos associated with a proponente's propostas.

    Uses the same JOIN pattern as qualificacao.py batch query.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        DataFrame with orgao and count (number of propostas per orgao)
    """
    query = """
        SELECT
            a.orgao,
            COUNT(DISTINCT prop.transfer_gov_id) as count
        FROM propostas prop
        LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
        LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
        WHERE prop.proponente_cnpj = :cnpj
          AND a.orgao IS NOT NULL
          AND a.orgao != ''
          AND a.orgao != 'nan'
        GROUP BY a.orgao
        ORDER BY count DESC
    """

    df = run_query(query, params={"cnpj": cnpj})
    return df


@st.cache_data(ttl="5m")
def get_lead_programas(cnpj: str) -> pd.DataFrame:
    """Get programas associated with a proponente's propostas.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        DataFrame with programa_nome, programa_id, and count (number of propostas per programa)
    """
    query = """
        SELECT
            prog.nome as programa_nome,
            prog.transfer_gov_id as programa_id,
            COUNT(DISTINCT p.transfer_gov_id) as count
        FROM propostas p
        INNER JOIN programas prog ON p.programa_id = prog.transfer_gov_id
        WHERE p.proponente_cnpj = :cnpj
        GROUP BY prog.nome, prog.transfer_gov_id
        ORDER BY count DESC
    """

    df = run_query(query, params={"cnpj": cnpj})
    return df
