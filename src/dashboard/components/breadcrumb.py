"""Breadcrumb context indicator component.

Displays navigation trail showing the current lead selection context.
Used to provide user orientation when navigating between entity pages.
"""

import streamlit as st

from src.dashboard.components._styles import get_iframe_styles


def render_breadcrumb():
    """Render breadcrumb indicator showing current lead context.

    If a lead is selected (st.session_state.selected_lead_name exists),
    displays a breadcrumb trail: Home > Qualificacao > [Lead Name]

    Uses st.html() with embedded styles for consistent dark theme rendering.
    Highlights the active segment with neon accent color.

    If no lead is selected, renders nothing.
    """
    lead_name = st.session_state.get("selected_lead_name")

    if not lead_name:
        return  # No breadcrumb to display

    # Build breadcrumb HTML with Sigma brand styling
    breadcrumb_html = f"""
    {get_iframe_styles()}
    <div style="
        font-size: 0.875rem;
        color: var(--sigma-text-secondary);
        padding: 0.5rem 0;
        margin-bottom: 1rem;
        font-family: var(--font-body);
    ">
        <span style="color: var(--sigma-text-secondary);">Home</span>
        <span style="margin: 0 0.5rem; color: var(--sigma-text-secondary);">></span>
        <span style="color: var(--sigma-text-secondary);">Qualificacao</span>
        <span style="margin: 0 0.5rem; color: var(--sigma-text-secondary);">></span>
        <span style="color: var(--sigma-accent-neon); font-weight: 600;">{lead_name}</span>
    </div>
    """

    st.html(breadcrumb_html)
