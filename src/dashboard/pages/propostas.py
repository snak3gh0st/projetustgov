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
        tab1, tab2 = st.tabs(["Proponente", "Outras Propostas"])

        with tab1:
            st.markdown("**Dados do Proponente**")
            df_proponente = related["proponente"]
            if df_proponente.empty:
                st.info("Proponente nao encontrado.")
            else:
                prop = df_proponente.iloc[0]
                col_a, col_b = st.columns(2)
                with col_a:
                    st.metric("Nome", prop.get("nome", "N/A"))
                    st.metric("CNPJ", prop.get("cnpj", "N/A"))
                    st.metric("Estado", prop.get("estado", "N/A"))
                    st.metric("Municipio", prop.get("municipio", "N/A"))
                with col_b:
                    st.metric("Total Propostas", f"{prop.get('total_propostas', 0):,}")
                    st.metric("Total Emendas", f"{prop.get('total_emendas', 0):,}")
                    valor = prop.get("valor_total_emendas", 0) or 0
                    st.metric("Valor Total Emendas", f"R$ {valor:,.2f}")
                    st.metric("Natureza Juridica", prop.get("natureza_juridica", "N/A"))

        with tab2:
            st.markdown("**Outras propostas do mesmo proponente**")
            df_outras = related["outras_propostas"]
            if df_outras.empty:
                st.info("Nenhuma outra proposta do mesmo proponente.")
            else:
                display_cols = [
                    col for col in ["transfer_gov_id", "titulo", "valor_global", "situacao", "estado"]
                    if col in df_outras.columns
                ]
                df_outras_display = df_outras[display_cols].copy()
                if "valor_global" in df_outras_display.columns:
                    df_outras_display["valor_global"] = df_outras_display["valor_global"].apply(
                        lambda x: f"R$ {x:,.2f}" if pd.notna(x) else ""
                    )
                st.dataframe(
                    df_outras_display,
                    use_container_width=True,
                    hide_index=True,
                )

    # --- CSV EXPORT ---
    st.markdown("---")
    render_csv_export(df, "propostas_export.csv")
