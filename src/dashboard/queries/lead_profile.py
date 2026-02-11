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
    # Compute all aggregations live from source tables
    query = """
        SELECT
            p.id,
            p.cnpj,
            p.nome,
            p.email,
            p.telefone,
            p.endereco,
            p.bairro,
            p.municipio,
            p.estado,
            p.cep,
            p.natureza_juridica,
            COALESCE(agg.total_propostas, 0) as total_propostas,
            COALESCE(agg.total_emendas, 0) as total_emendas,
            COALESCE(agg.valor_total_emendas, 0) as valor_total_emendas,
            COALESCE(agg.total_convenios, 0) as total_convenios,
            COALESCE(agg.valor_total_desembolsos, 0) as valor_total_desembolsos,
            p.is_existing_client,
            p.is_osc
        FROM proponentes p
        LEFT JOIN (
            SELECT
                prop.proponente_cnpj,
                COUNT(DISTINCT prop.id) as total_propostas,
                COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
                COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas,
                COUNT(DISTINCT c.transfer_gov_id) as total_convenios,
                COALESCE(SUM(c.valor_desembolsado), 0) as valor_total_desembolsos
            FROM propostas prop
            LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
            LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
            LEFT JOIN convenios c ON prop.transfer_gov_id = c.proposta_id
            GROUP BY prop.proponente_cnpj
        ) agg ON p.cnpj = agg.proponente_cnpj
        WHERE p.cnpj = :cnpj
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


@st.cache_data(ttl="5m")
def get_lead_instruments(cnpj: str) -> pd.DataFrame:
    """Get all instruments (convenios) for a proponente with financial detail.

    Joins convenios -> propostas (via proposta_id) -> propostas.proponente_cnpj
    Also joins to proposta_emendas + emendas to get emenda info per instrument.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        DataFrame with all instrument fields including financial data
    """
    query = """
        SELECT
            c.transfer_gov_id as nr_instrumento,
            prop.modalidade,
            c.situacao,
            c.instrumento_ativo,
            CASE WHEN pe.emenda_transfer_gov_id IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_emenda,
            e.autor as parlamentar,
            c.valor_global,
            e.valor as valor_emenda,
            c.valor_empenhado,
            c.valor_desembolsado as valor_liberado,
            c.saldo_conta,
            c.valor_repasse,
            c.valor_contrapartida,
            c.valor_global_original,
            c.rendimento_aplicacao,
            c.ingresso_contrapartida,
            c.data_inicio_vigencia,
            c.data_fim_vigencia
        FROM convenios c
        INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
        LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        WHERE prop.proponente_cnpj = :cnpj
        ORDER BY c.valor_global DESC NULLS LAST
    """
    return run_query(query, params={"cnpj": cnpj})


@st.cache_data(ttl="5m")
def get_lead_instrument_summary(cnpj: str) -> dict:
    """Get aggregated financial summary across all instruments for a CNPJ.

    Args:
        cnpj: Proponente CNPJ

    Returns:
        Dictionary with total_instrumentos, total_valor_global, total_empenhado, etc.
    """
    query = """
        SELECT
            COUNT(DISTINCT c.transfer_gov_id) as total_instrumentos,
            SUM(c.valor_global) as total_valor_global,
            SUM(c.valor_empenhado) as total_empenhado,
            SUM(c.valor_desembolsado) as total_liberado,
            SUM(c.saldo_conta) as total_saldo_conta,
            COUNT(DISTINCT CASE WHEN c.instrumento_ativo = 'SIM' THEN c.transfer_gov_id END) as instrumentos_ativos
        FROM convenios c
        INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
        WHERE prop.proponente_cnpj = :cnpj
    """
    df = run_query(query, params={"cnpj": cnpj})
    if df.empty:
        return {}
    return df.iloc[0].to_dict()
