"""Qualificacao de Proponentes page for client discovery and prospecting.

This page ranks proponents by value (fewer proposals = higher value) and provides
comprehensive filtering capabilities for client qualification. Designed to help
users find proponents with low competition and high receptivity to new partnerships.
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.export import render_csv_export
from src.dashboard.queries.proponentes import (
    get_proponente_estados,
    get_proponente_stats,
    get_proponentes,
)


def format_cnpj(cnpj: str) -> str:
    """Format CNPJ as XX.XXX.XXX/XXXX-XX.

    Args:
        cnpj: 14-digit CNPJ string

    Returns:
        Formatted CNPJ or original if invalid format
    """
    if pd.isna(cnpj) or not cnpj:
        return ""

    # Remove any existing formatting
    cnpj_clean = str(cnpj).replace(".", "").replace("/", "").replace("-", "")

    # Ensure 14 digits
    if len(cnpj_clean) != 14:
        return cnpj

    # Format as XX.XXX.XXX/XXXX-XX
    return f"{cnpj_clean[0:2]}.{cnpj_clean[2:5]}.{cnpj_clean[5:8]}/{cnpj_clean[8:12]}-{cnpj_clean[12:14]}"


def render_qualificacao():
    """Render the Client Qualification page with ranked proponent table."""
    st.title("Qualificacao de Proponentes")

    # Info box explaining value metrics
    st.info(
        "🎯 **Criterio de Valor:** Proponentes com menos propostas ativas sao mais valiosos "
        "para prospeccao - indicam menor concorrencia e maior receptividade a novas parcerias. "
        "Proponentes novos (sem historico) sao os mais valiosos."
    )

    # --- KPI METRICS ROW ---
    stats = get_proponente_stats()

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Total Proponentes", f"{stats['total_count']:,}")

    with col2:
        st.metric("Total OSCs", f"{stats['osc_count']:,}")

    with col3:
        st.metric("Total Governo", f"{stats['government_count']:,}")

    with col4:
        st.metric("Media Propostas/Proponente", f"{stats['avg_propostas']:.1f}")

    st.markdown("---")

    # --- FILTERS SIDEBAR ---
    st.sidebar.header("Filtros")

    # Tipo de Entidade filter
    tipo_entidade = st.sidebar.radio(
        "Tipo de Entidade",
        options=["Todos", "Apenas OSCs", "Apenas Governo"],
        index=0,
        key="qualificacao_tipo_entidade",
    )

    # Estado filter
    estados_disponiveis = get_proponente_estados()
    estados_disponiveis.insert(0, "Todos")
    estado_selected = st.sidebar.selectbox(
        "Estado",
        options=estados_disponiveis,
        index=0,
        key="qualificacao_estado",
    )

    # Search filter
    search_term = st.sidebar.text_input(
        "Buscar",
        placeholder="Nome ou CNPJ...",
        key="qualificacao_search",
        help="Busca por nome do proponente ou CNPJ",
    )

    # Max propostas filter (key for finding low-competition proponents)
    max_propostas = st.sidebar.number_input(
        "Max Propostas",
        min_value=0,
        max_value=1000,
        value=None,
        step=1,
        key="qualificacao_max_propostas",
        help="Filtrar proponentes com no maximo N propostas (deixe vazio para ver todos)",
    )

    # Build filters dict
    filters = {}

    if tipo_entidade == "Apenas OSCs":
        filters["is_osc"] = True
    elif tipo_entidade == "Apenas Governo":
        filters["is_osc"] = False

    if estado_selected != "Todos":
        filters["estado"] = estado_selected

    if search_term:
        filters["search"] = search_term

    if max_propostas is not None:
        filters["max_propostas"] = max_propostas

    # --- FETCH DATA ---
    df_proponentes = get_proponentes(limit=5000, filters=filters)

    if df_proponentes.empty:
        st.warning("Nenhum proponente encontrado com os filtros aplicados.")
        return

    # Make a copy to avoid modifying cached data
    df = df_proponentes.copy()

    # --- MAIN TABLE SECTION ---
    st.subheader(f"Proponentes Ranqueados por Valor ({len(df)} registros)")

    # Add rank column (1-based)
    df["rank"] = range(1, len(df) + 1)

    # Format CNPJ for display
    df["cnpj_formatado"] = df["cnpj"].apply(format_cnpj)

    # Determine tipo (OSC/Governo)
    df["tipo"] = df["is_osc"].apply(lambda x: "OSC" if x else "Governo")

    # Format valor_total_emendas as currency
    df["valor_emendas_formatado"] = df["valor_total_emendas"].apply(
        lambda x: f"R$ {x:,.2f}" if pd.notna(x) else "R$ 0,00"
    )

    # Prepare display DataFrame
    display_columns = [
        "rank",
        "nome",
        "cnpj_formatado",
        "tipo",
        "estado",
        "municipio",
        "total_propostas",
        "total_emendas",
        "valor_emendas_formatado",
    ]

    df_display = df[display_columns].copy()

    # Rename columns for display
    df_display.columns = [
        "#",
        "Nome",
        "CNPJ",
        "Tipo",
        "Estado",
        "Municipio",
        "Propostas",
        "Emendas",
        "Valor Emendas",
    ]

    # Highlight virgin proponents (total_propostas == 0) with a badge
    # We'll use st.dataframe with custom styling
    def highlight_virgin_proponents(row):
        """Highlight rows where Propostas == 0 (virgin proponents)."""
        if row["Propostas"] == 0:
            return ["background-color: #d4edda"] * len(row)  # Light green
        return [""] * len(row)

    # Apply styling
    styled_df = df_display.style.apply(highlight_virgin_proponents, axis=1)

    st.dataframe(
        styled_df,
        use_container_width=True,
        hide_index=True,
    )

    # Legend for highlighting
    if (df["total_propostas"] == 0).any():
        st.caption("✨ Linhas destacadas indicam proponentes sem propostas (virgens - maior valor)")

    # --- CONTACT INFO SECTION ---
    st.markdown("---")
    st.subheader("Informacoes de Contato")
    st.markdown(
        "Para acessar informacoes detalhadas de contato (endereco completo, CEP, bairro), "
        "utilize a exportacao CSV abaixo."
    )

    # --- CSV EXPORT SECTION ---
    st.markdown("---")

    # Prepare export DataFrame with all columns (unformatted CNPJ for data use)
    export_columns = [
        "rank",
        "nome",
        "cnpj",
        "natureza_juridica",
        "tipo",
        "estado",
        "municipio",
        "cep",
        "endereco",
        "bairro",
        "total_propostas",
        "total_emendas",
        "valor_total_emendas",
    ]

    df_export = df[[col for col in export_columns if col in df.columns]].copy()

    # Rename for clarity in export
    df_export.columns = [
        "Rank",
        "Nome",
        "CNPJ",
        "Natureza Juridica",
        "Tipo",
        "Estado",
        "Municipio",
        "CEP",
        "Endereco",
        "Bairro",
        "Total Propostas",
        "Total Emendas",
        "Valor Total Emendas",
    ]

    render_csv_export(df_export, "proponentes_qualificacao.csv")
