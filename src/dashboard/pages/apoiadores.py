"""Apoiadores entity page with cross-filter awareness.

This page displays all apoiadores with search, filter, and CSV export.
When a proposta is selected on the Propostas page, this page auto-filters
to show only apoiadores linked to that proposta via the junction table.
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.export import render_csv_export
from src.dashboard.config import run_query
from src.dashboard.queries.entities import get_apoiadores


def render_apoiadores():
    """Render the Apoiadores page with cross-filter awareness."""
    st.title("Apoiadores")
    st.markdown("Explore os apoiadores de propostas de transferência.")

    # Check if cross-filtering is active
    selected_proposta_id = st.session_state.get("selected_proposta_id")

    # Fetch all apoiadores (cached)
    df_apoiadores = get_apoiadores(limit=10000, filters=None)

    if df_apoiadores.empty:
        st.info("Nenhum apoiador disponível no momento.")
        return

    # Make a copy to avoid modifying cached data
    df = df_apoiadores.copy()

    # --- CROSS-FILTER BANNER ---
    if selected_proposta_id:
        col1, col2 = st.columns([3, 1])
        with col1:
            st.info(f"🔍 Filtrando por Proposta: **{selected_proposta_id}**")
        with col2:
            if st.button("Mostrar todos", key="apoiadores_show_all"):
                st.session_state.selected_proposta_id = None
                st.rerun()

        # Apply cross-filter: show only apoiadores linked to selected proposta
        # Query via junction table
        query = """
            SELECT DISTINCT apoiador_transfer_gov_id
            FROM proposta_apoiadores
            WHERE proposta_transfer_gov_id = :proposta_id
        """
        related_ids_df = run_query(query, {"proposta_id": selected_proposta_id})

        if not related_ids_df.empty:
            related_ids = related_ids_df["apoiador_transfer_gov_id"].tolist()
            df = df[df["transfer_gov_id"].isin(related_ids)]
        else:
            df = pd.DataFrame()  # No apoiadores linked

    # --- FILTER SECTION ---
    if not selected_proposta_id:
        st.subheader("Filtros")

        col1, col2 = st.columns(2)

        with col1:
            # Text search across nome, orgao
            search_term = st.text_input(
                "Buscar",
                placeholder="Nome ou órgão...",
                key="apoiadores_search",
                help="Busca por nome ou órgão",
            )

        with col2:
            # Tipo filter
            tipos_disponiveis = sorted(df["tipo"].dropna().unique().tolist())
            tipos_disponiveis.insert(0, "Todos")
            tipo_selected = st.selectbox(
                "Tipo",
                options=tipos_disponiveis,
                key="apoiadores_tipo",
            )

        # Apply filters
        if search_term:
            # Case-insensitive search across nome, orgao
            mask = df["nome"].str.contains(search_term, case=False, na=False) | df[
                "orgao"
            ].str.contains(search_term, case=False, na=False)
            df = df[mask]

        if tipo_selected != "Todos":
            df = df[df["tipo"] == tipo_selected]

    # --- DATA TABLE SECTION ---
    st.subheader(f"Apoiadores ({len(df)} registros)")

    if df.empty:
        st.warning("Nenhum apoiador encontrado com os filtros aplicados.")
        return

    # Prepare display columns
    display_columns = [
        "transfer_gov_id",
        "nome",
        "tipo",
        "orgao",
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
        key="apoiadores_table",
    )

    # --- CSV EXPORT ---
    st.markdown("---")
    render_csv_export(df, "apoiadores_export.csv")
