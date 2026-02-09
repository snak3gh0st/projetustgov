"""Programas entity page with cross-filter awareness.

This page displays all programas with search, filter, and CSV export.
When a proposta is selected on the Propostas page, this page auto-filters
to show only the programa linked to that proposta.
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.export import render_csv_export
from src.dashboard.queries.entities import get_programas


def render_programas():
    """Render the Programas page with cross-filter awareness."""
    st.title("Programas")
    st.markdown("Explore os programas de transferência disponíveis.")

    # Check if cross-filtering is active
    selected_proposta_id = st.session_state.get("selected_proposta_id")

    # Default to year 2026 for programas
    filters = {"year": 2026}

    # Fetch programas with year filter (cached)
    df_programas = get_programas(limit=10000, filters=filters)

    if df_programas.empty:
        st.info("Nenhum programa disponível no momento.")
        return

    # Make a copy to avoid modifying cached data
    df = df_programas.copy()

    # --- CROSS-FILTER BANNER ---
    if selected_proposta_id:
        col1, col2 = st.columns([3, 1])
        with col1:
            st.info(f"🔍 Filtrando por Proposta: **{selected_proposta_id}**")
        with col2:
            if st.button("Mostrar todos", key="programas_show_all"):
                st.session_state.selected_proposta_id = None
                st.rerun()

        # Apply cross-filter: show only programa linked to selected proposta
        # Need to query propostas to get the programa_id
        from src.dashboard.queries.entities import get_propostas

        df_propostas = get_propostas(limit=10000, filters=None)
        if not df_propostas.empty:
            proposta_row = df_propostas[
                df_propostas["transfer_gov_id"] == selected_proposta_id
            ]
            if not proposta_row.empty:
                programa_id = proposta_row.iloc[0]["programa_id"]
                if pd.notna(programa_id):
                    df = df[df["transfer_gov_id"] == programa_id]
                else:
                    df = pd.DataFrame()  # No programa linked
            else:
                df = pd.DataFrame()  # Proposta not found
        else:
            df = pd.DataFrame()  # No propostas data

    # --- FILTER SECTION ---
    if not selected_proposta_id:
        st.subheader("Filtros")

        col1, col2, col3 = st.columns(3)

        with col1:
            # Year filter (extracted from programa ID positions 6-9)
            ano_selected = st.selectbox(
                "Ano",
                options=[2026, 2025, 2024, 2021, 2018, 2016, 2013, 2012, 2011, 2009, 2008],
                index=0,  # Default to 2026
                key="programas_ano",
                help="Filtro por ano extraído do código do programa (posições 6-9)",
            )
            # Update filters and reload if year changed
            if ano_selected != filters.get("year"):
                filters["year"] = ano_selected
                df_programas = get_programas(limit=10000, filters=filters)
                df = df_programas.copy()

        with col2:
            # Text search across nome, orgao_superior
            search_term = st.text_input(
                "Buscar",
                placeholder="Nome ou órgão superior...",
                key="programas_search",
                help="Busca por nome ou órgão superior",
            )

        with col3:
            # Modalidade filter
            modalidades_disponiveis = sorted(df["modalidade"].dropna().unique().tolist())
            modalidades_disponiveis.insert(0, "Todos")
            modalidade_selected = st.selectbox(
                "Modalidade",
                options=modalidades_disponiveis,
                key="programas_modalidade",
            )

        # Apply filters
        if search_term:
            # Case-insensitive search across nome, orgao_superior
            mask = df["nome"].str.contains(search_term, case=False, na=False) | df[
                "orgao_superior"
            ].str.contains(search_term, case=False, na=False)
            df = df[mask]

        if modalidade_selected != "Todos":
            df = df[df["modalidade"] == modalidade_selected]

    # --- DATA TABLE SECTION ---
    st.subheader(f"Programas ({len(df)} registros)")

    if df.empty:
        st.warning("Nenhum programa encontrado com os filtros aplicados.")
        return

    # Prepare display columns
    display_columns = [
        "transfer_gov_id",
        "nome",
        "orgao_superior",
        "modalidade",
        "acao_orcamentaria",
    ]

    # Select only display columns (and ensure they exist)
    df_display = df[
        [col for col in display_columns if col in df.columns]
    ].reset_index(drop=True)

    # Render interactive dataframe
    st.dataframe(
        df_display,
        use_container_width=True,
        hide_index=True,
        key="programas_table",
    )

    # --- CSV EXPORT ---
    st.markdown("---")
    render_csv_export(df, "programas_export.csv")
