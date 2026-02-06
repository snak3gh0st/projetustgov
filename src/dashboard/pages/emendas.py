"""Emendas entity page with cross-filter awareness.

This page displays all emendas with search, filter, and CSV export.
When a proposta is selected on the Propostas page, this page auto-filters
to show only emendas linked to that proposta via the junction table.
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.export import render_csv_export
from src.dashboard.config import run_query
from src.dashboard.queries.entities import get_emendas


def render_emendas():
    """Render the Emendas page with cross-filter awareness."""
    st.title("Emendas")
    st.markdown("Explore as emendas orçamentárias vinculadas a propostas.")

    # Check if cross-filtering is active
    selected_proposta_id = st.session_state.get("selected_proposta_id")

    # Fetch all emendas (cached)
    df_emendas = get_emendas(limit=10000, filters=None)

    if df_emendas.empty:
        st.info("Nenhuma emenda disponível no momento.")
        return

    # Make a copy to avoid modifying cached data
    df = df_emendas.copy()

    # --- CROSS-FILTER BANNER ---
    if selected_proposta_id:
        col1, col2 = st.columns([3, 1])
        with col1:
            st.info(f"🔍 Filtrando por Proposta: **{selected_proposta_id}**")
        with col2:
            if st.button("Mostrar todos", key="emendas_show_all"):
                st.session_state.selected_proposta_id = None
                st.rerun()

        # Apply cross-filter: show only emendas linked to selected proposta
        # Query via junction table
        query = """
            SELECT DISTINCT emenda_transfer_gov_id
            FROM proposta_emendas
            WHERE proposta_transfer_gov_id = :proposta_id
        """
        related_ids_df = run_query(query, {"proposta_id": selected_proposta_id})

        if not related_ids_df.empty:
            related_ids = related_ids_df["emenda_transfer_gov_id"].tolist()
            df = df[df["transfer_gov_id"].isin(related_ids)]
        else:
            df = pd.DataFrame()  # No emendas linked

    # --- FILTER SECTION ---
    if not selected_proposta_id:
        st.subheader("Filtros")

        col1, col2, col3 = st.columns(3)

        with col1:
            # Text search across numero, autor
            search_term = st.text_input(
                "Buscar",
                placeholder="Número ou autor...",
                key="emendas_search",
                help="Busca por número ou autor",
            )

        with col2:
            # Tipo filter
            tipos_disponiveis = sorted(df["tipo"].dropna().unique().tolist())
            tipos_disponiveis.insert(0, "Todos")
            tipo_selected = st.selectbox(
                "Tipo",
                options=tipos_disponiveis,
                key="emendas_tipo",
            )

        with col3:
            # Ano filter
            anos_disponiveis = sorted(df["ano"].dropna().unique().tolist(), reverse=True)
            anos_disponiveis.insert(0, "Todos")
            ano_selected = st.selectbox(
                "Ano",
                options=anos_disponiveis,
                key="emendas_ano",
            )

        # Apply filters
        if search_term:
            # Case-insensitive search across numero, autor
            mask = df["numero"].str.contains(search_term, case=False, na=False) | df[
                "autor"
            ].str.contains(search_term, case=False, na=False)
            df = df[mask]

        if tipo_selected != "Todos":
            df = df[df["tipo"] == tipo_selected]

        if ano_selected != "Todos":
            df = df[df["ano"] == ano_selected]

    # --- DATA TABLE SECTION ---
    st.subheader(f"Emendas ({len(df)} registros)")

    if df.empty:
        st.warning("Nenhuma emenda encontrada com os filtros aplicados.")
        return

    # Prepare display columns
    display_columns = [
        "transfer_gov_id",
        "numero",
        "autor",
        "valor",
        "tipo",
        "ano",
    ]

    # Select only display columns (and ensure they exist)
    df_display = df[
        [col for col in display_columns if col in df.columns]
    ].copy()

    # Format valor as currency
    if "valor" in df_display.columns:
        df_display["valor"] = df_display["valor"].apply(
            lambda x: f"R$ {x:,.2f}" if pd.notna(x) else ""
        )

    df_display = df_display.reset_index(drop=True)

    # Render interactive dataframe
    st.dataframe(
        df_display,
        use_container_width=True,
        hide_index=True,
        key="emendas_table",
    )

    # --- CSV EXPORT ---
    st.markdown("---")
    render_csv_export(df, "emendas_export.csv")
