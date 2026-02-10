"""Global search bar component for cross-entity navigation.

Provides a search input that accepts CNPJ or nome and returns results
across proponentes, propostas, and programas. Clicking a result navigates
to the appropriate entity page with context stored in session state.
"""

import streamlit as st

from src.dashboard.queries.search import search_entities


def render_global_search():
    """Render global search bar with cross-entity results.

    Displays a compact search input with button trigger. When clicked,
    searches across all entities and displays results in a popover.
    Prioritizes proponente results (entity_type == "proponente") first.

    Navigation behavior:
    - Proponente results → set selected_lead_cnpj, selected_lead_name, navigate to lead profile
    - Proposta results → set selected_proposta_id, navigate to propostas page
    - Programa results → set active_entity_filter, navigate to programas page
    """
    st.markdown("### 🔍 Buscar")

    # Compact two-column layout for search bar
    col1, col2 = st.columns([4, 1])

    with col1:
        search_term = st.text_input(
            "Buscar",
            placeholder="CNPJ ou Nome do Proponente...",
            key="global_search_input",
            label_visibility="collapsed"
        )

    with col2:
        search_btn = st.button("Buscar", key="global_search_btn", type="primary")

    # Execute search when button clicked with non-empty term
    if search_btn and search_term:
        results = search_entities(search_term, limit=10)

        if not results.empty:
            # Use expander to contain results without pushing page content down
            with st.expander("Resultados", expanded=True):
                # Separate results by entity type (prioritize proponentes)
                proponente_results = results[results["entity_type"] == "proponente"]
                proposta_results = results[results["entity_type"] == "proposta"]
                programa_results = results[results["entity_type"] == "programa"]

                # Display proponente results first
                if not proponente_results.empty:
                    st.markdown("**Proponentes:**")
                    for idx, row in proponente_results.iterrows():
                        entity_icon = "🏢"
                        label = f"{entity_icon} {row['nome']} ({row['cnpj']})"
                        if st.button(label, key=f"search_result_proponente_{idx}"):
                            # Set lead context and navigate to lead profile
                            st.session_state.selected_lead_cnpj = row["cnpj"]
                            st.session_state.selected_lead_name = row["nome"]
                            st.switch_page("pages/lead_profile.py")

                # Display proposta results
                if not proposta_results.empty:
                    st.markdown("**Propostas:**")
                    for idx, row in proposta_results.iterrows():
                        entity_icon = "📄"
                        label = f"{entity_icon} {row['nome']}"
                        if st.button(label, key=f"search_result_proposta_{idx}"):
                            # Set proposta context and navigate to propostas page
                            st.session_state.selected_proposta_id = row["id"]
                            st.switch_page("pages/propostas.py")

                # Display programa results
                if not programa_results.empty:
                    st.markdown("**Programas:**")
                    for idx, row in programa_results.iterrows():
                        entity_icon = "📋"
                        label = f"{entity_icon} {row['nome']}"
                        if st.button(label, key=f"search_result_programa_{idx}"):
                            # Set programa filter and navigate to programas page
                            st.session_state.active_entity_filter = row["id"]
                            st.switch_page("pages/programas.py")
        else:
            st.warning("Nenhum resultado encontrado.")
