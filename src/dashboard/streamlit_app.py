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
    page_title="PROJETUS - Leads TransfereGov",
    page_icon="🎯",
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

# Initialize session state
if "selected_lead_cnpj" not in st.session_state:
    st.session_state.selected_lead_cnpj = None

if "selected_lead_name" not in st.session_state:
    st.session_state.selected_lead_name = None


# Define page functions
def leads_page():
    """Lead list page showing CNPJs ranked by opportunity."""
    from src.dashboard.pages.home import render_home
    render_home()


def lead_profile_page():
    """Detailed lead profile page with instrument financial data."""
    from src.dashboard.pages.lead_profile import render_lead_profile
    render_lead_profile()


# Sidebar branding
with st.sidebar:
    st.markdown("### PROJETUS")
    st.markdown("Pipeline de Leads TransfereGov")

# Define navigation structure with 2 pages
_page_leads = st.Page(leads_page, title="Leads", icon="🎯")
_page_lead_profile = st.Page(lead_profile_page, title="Lead Profile", icon="👤")

pages = [_page_leads, _page_lead_profile]

# Store page objects in session_state for st.switch_page() from other modules
st.session_state._pages = {
    "Lead Profile": _page_lead_profile,
    "Leads": _page_leads,
}

# Create navigation
pg = st.navigation(pages)

# Run the selected page
pg.run()
