"""Streamlit dashboard entrypoint for PROJETUS Transfer Gov data.

This is the main entry point for the dashboard. Run with:
    streamlit run src/dashboard/streamlit_app.py
"""

import sys
from pathlib import Path

# Add project root to sys.path so 'from src.*' imports work when Streamlit
# runs this file as a script (not as a module).
_project_root = str(Path(__file__).resolve().parent.parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

import streamlit as st

# Configure page settings (must be first Streamlit command)
st.set_page_config(
    page_title="PROJETUS Dashboard",
    page_icon="📊",
    layout="wide",
)


# Load custom CSS files
def load_css():
    """Load external CSS files for Sigma brand theming."""
    css_dir = Path(__file__).parent / "assets" / "styles"
    css_files = ["fonts.css", "theme.css", "components.css"]

    for css_file in css_files:
        css_path = css_dir / css_file
        if css_path.exists():
            css_content = css_path.read_text()
            st.markdown(f"<style>{css_content}</style>", unsafe_allow_html=True)


# Apply CSS immediately after set_page_config
load_css()

# Import navigation components (lazy import pattern)
from src.dashboard.components.search import render_global_search
from src.dashboard.components.breadcrumb import render_breadcrumb

# Initialize session state
if "selected_proposta_id" not in st.session_state:
    st.session_state.selected_proposta_id = None

if "time_range_days" not in st.session_state:
    st.session_state.time_range_days = 7

if "active_entity_filter" not in st.session_state:
    st.session_state.active_entity_filter = None

if "breadcrumb_trail" not in st.session_state:
    st.session_state.breadcrumb_trail = []

if "selected_lead_cnpj" not in st.session_state:
    st.session_state.selected_lead_cnpj = None

if "selected_lead_name" not in st.session_state:
    st.session_state.selected_lead_name = None


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


def qualificacao_page():
    """Qualificacao de Proponentes page for client discovery and prospecting."""
    from src.dashboard.pages.qualificacao_new import render_qualificacao_nova

    render_qualificacao_nova()


def lead_profile_page():
    """Dedicated lead profile page for deep-dive proponent research."""
    from src.dashboard.pages.lead_profile import render_lead_profile

    render_lead_profile()


# Sidebar branding and global search
with st.sidebar:
    st.markdown("### PROJETUS")
    render_global_search()

# Define navigation structure with 7 tabs (5 entity pages + Qualificacao + Lead Profile)
pages = [
    st.Page(home_page, title="Home", icon="🏠"),
    st.Page(propostas_page, title="Propostas", icon="📄"),
    st.Page(programas_page, title="Programas", icon="📋"),
    st.Page(apoiadores_page, title="Apoiadores", icon="👥"),
    st.Page(emendas_page, title="Emendas", icon="💰"),
    st.Page(qualificacao_page, title="Qualificacao", icon="🎯"),
    st.Page(lead_profile_page, title="Lead Profile", icon="👤"),
]

# Create navigation
pg = st.navigation(pages)

# Render breadcrumb context indicator
render_breadcrumb()

# Run the selected page
pg.run()
