"""Streamlit dashboard entrypoint for PROJETUS Transfer Gov data.

This is the main entry point for the dashboard. Run with:
    streamlit run src/dashboard/streamlit_app.py
"""

import streamlit as st

# Configure page settings (must be first Streamlit command)
st.set_page_config(
    page_title="PROJETUS Dashboard",
    page_icon="📊",
    layout="wide",
)

# Initialize session state
if "selected_proposta_id" not in st.session_state:
    st.session_state.selected_proposta_id = None

if "time_range_days" not in st.session_state:
    st.session_state.time_range_days = 7

if "active_entity_filter" not in st.session_state:
    st.session_state.active_entity_filter = None


# Define page functions (placeholders for pages not yet implemented)
def home_page():
    """Home/overview page with KPI metrics and recent data."""
    from src.dashboard.pages.home import render_home

    render_home()


def propostas_page():
    """Propostas entity page with interactive data table and cross-filtering."""
    from src.dashboard.pages.propostas import render_propostas

    render_propostas()


def programas_page():
    """Programas entity page with cross-filter awareness."""
    from src.dashboard.pages.programas import render_programas

    render_programas()


def apoiadores_page():
    """Apoiadores entity page with cross-filter awareness."""
    from src.dashboard.pages.apoiadores import render_apoiadores

    render_apoiadores()


def emendas_page():
    """Emendas entity page with cross-filter awareness."""
    from src.dashboard.pages.emendas import render_emendas

    render_emendas()


# Define navigation structure with exactly 5 tabs as per locked decision
pages = [
    st.Page(home_page, title="Home", icon="🏠"),
    st.Page(propostas_page, title="Propostas", icon="📄"),
    st.Page(programas_page, title="Programas", icon="📋"),
    st.Page(apoiadores_page, title="Apoiadores", icon="👥"),
    st.Page(emendas_page, title="Emendas", icon="💰"),
]

# Create navigation
pg = st.navigation(pages)

# Run the selected page
pg.run()
