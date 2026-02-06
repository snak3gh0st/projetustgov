"""Propostas entity page with interactive data table and cross-filtering.

This page displays all propostas with search, sort, filter, and CSV export.
Row selection stores the proposta ID in session_state for cross-filtering on other pages.
A drill-down section shows related programas, apoiadores, and emendas when a proposta is selected.
"""

from datetime import date, timedelta

import pandas as pd
import streamlit as st

from src.dashboard.components.export import render_csv_export
from src.dashboard.queries.entities import get_propostas, get_related_entities


def render_propostas():
    """Render the Propostas page with interactive data table and cross-filtering."""
    st.title("Propostas")
    st.markdown("Explore todas as propostas de transferência registradas no sistema.")

    # Add year filter at the top
    col_year, col_spacer = st.columns([1, 3])
    with col_year:
        year_filter = st.selectbox(
            "Ano",
            options=["Todos", 2026, 2025],
            index=0,
            key="propostas_year_filter",
            help="Filtrar propostas por ano de publicação"
        )

    # Build filters dict
    year_filters = {}
    if year_filter != "Todos":
        year_filters["year"] = year_filter

    # Fetch all propostas (cached)
    df_propostas = get_propostas(limit=10000, filters=year_filters)

    if df_propostas.empty:
        st.info("Nenhuma proposta disponível no momento.")
        return

    # Make a copy to avoid modifying cached data
    df = df_propostas.copy()

    # --- FILTER SECTION ---
    st.subheader("Filtros")

    col1, col2, col3 = st.columns(3)

    with col1:
        # Text search across titulo, proponente, municipio
        search_term = st.text_input(
            "Buscar",
            placeholder="Título, proponente ou município...",
            key="propostas_search",
            help="Busca por título, proponente ou município",
        )

    with col2:
        # Estado filter
        estados_disponiveis = sorted(df["estado"].dropna().unique().tolist())
        estados_disponiveis.insert(0, "Todos")
        estado_selected = st.selectbox(
            "Estado",
            options=estados_disponiveis,
            key="propostas_estado",
        )

    with col3:
        # Situacao filter
        situacoes_disponiveis = sorted(df["situacao"].dropna().unique().tolist())
        situacao_selected = st.multiselect(
            "Situação",
            options=situacoes_disponiveis,
            default=[],
            key="propostas_situacao",
            help="Selecione uma ou mais situações",
        )

    # Date range filter
    col4, col5 = st.columns(2)
    with col4:
        date_start = st.date_input(
            "Data inicial",
            value=None,
            key="propostas_date_start",
            help="Filtrar por data de publicação (início)",
        )
    with col5:
        date_end = st.date_input(
            "Data final",
            value=None,
            key="propostas_date_end",
            help="Filtrar por data de publicação (fim)",
        )

    # Apply filters
    if search_term:
        # Case-insensitive search across titulo, proponente, municipio
        mask = (
            df["titulo"].str.contains(search_term, case=False, na=False)
            | df["proponente"].str.contains(search_term, case=False, na=False)
            | df["municipio"].str.contains(search_term, case=False, na=False)
        )
        df = df[mask]

    if estado_selected != "Todos":
        df = df[df["estado"] == estado_selected]

    if situacao_selected:
        df = df[df["situacao"].isin(situacao_selected)]

    if date_start:
        df = df[df["data_publicacao"] >= date_start]

    if date_end:
        df = df[df["data_publicacao"] <= date_end]

    # --- DATA TABLE SECTION ---
    st.subheader(f"Propostas ({len(df)} registros)")

    if df.empty:
        st.warning("Nenhuma proposta encontrada com os filtros aplicados.")
        return

    # Prepare display columns
    display_columns = [
        "transfer_gov_id",
        "titulo",
        "valor_global",
        "situacao",
        "estado",
        "municipio",
        "proponente",
        "data_publicacao",
    ]

    # Select only display columns (and ensure they exist)
    df_display = df[
        [col for col in display_columns if col in df.columns]
    ].reset_index(drop=True)

    # Format valor_global as currency
    if "valor_global" in df_display.columns:
        df_display["valor_global"] = df_display["valor_global"].apply(
            lambda x: f"R$ {x:,.2f}" if pd.notna(x) else ""
        )

    # Format dates
    if "data_publicacao" in df_display.columns:
        df_display["data_publicacao"] = pd.to_datetime(
            df_display["data_publicacao"]
        ).dt.strftime("%d/%m/%Y")

    # Render interactive dataframe with row selection
    event = st.dataframe(
        df_display,
        use_container_width=True,
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="propostas_table",
    )

    # Handle row selection
    if event.selection and event.selection.rows:
        selected_row_index = event.selection.rows[0]
        selected_proposta_id = df.iloc[selected_row_index]["transfer_gov_id"]

        # Store in session state for cross-filtering
        st.session_state.selected_proposta_id = selected_proposta_id

        st.success(f"Proposta selecionada: {selected_proposta_id}")

        # Clear selection button
        if st.button("Limpar seleção", key="clear_selection"):
            st.session_state.selected_proposta_id = None
            st.rerun()

    # --- DRILL-DOWN SECTION (if proposta selected) ---
    if st.session_state.get("selected_proposta_id"):
        st.markdown("---")
        st.subheader("Detalhes da Proposta Selecionada")

        proposta_id = st.session_state.selected_proposta_id

        # Fetch related entities
        related = get_related_entities(proposta_id)

        # Use tabs to organize related entities
        tab1, tab2, tab3 = st.tabs(["Programas", "Apoiadores", "Emendas"])

        with tab1:
            st.markdown("**Programas relacionados**")
            df_programas = related["programas"]
            if df_programas.empty:
                st.info("Nenhum programa relacionado.")
            else:
                st.dataframe(
                    df_programas[
                        [
                            "transfer_gov_id",
                            "nome",
                            "orgao_superior",
                            "modalidade",
                        ]
                    ],
                    use_container_width=True,
                    hide_index=True,
                )

        with tab2:
            st.markdown("**Apoiadores relacionados**")
            df_apoiadores = related["apoiadores"]
            if df_apoiadores.empty:
                st.info("Nenhum apoiador relacionado.")
            else:
                st.dataframe(
                    df_apoiadores[["transfer_gov_id", "nome", "tipo", "orgao"]],
                    use_container_width=True,
                    hide_index=True,
                )

        with tab3:
            st.markdown("**Emendas relacionadas**")
            df_emendas = related["emendas"]
            if df_emendas.empty:
                st.info("Nenhuma emenda relacionada.")
            else:
                # Format valor as currency
                df_emendas_display = df_emendas[
                    ["transfer_gov_id", "numero", "autor", "valor", "tipo", "ano"]
                ].copy()
                if "valor" in df_emendas_display.columns:
                    df_emendas_display["valor"] = df_emendas_display["valor"].apply(
                        lambda x: f"R$ {x:,.2f}" if pd.notna(x) else ""
                    )
                st.dataframe(
                    df_emendas_display,
                    use_container_width=True,
                    hide_index=True,
                )

    # --- CSV EXPORT ---
    st.markdown("---")
    render_csv_export(df, "propostas_export.csv")
