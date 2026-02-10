"""Glassmorphic card wrapper components for premium Sigma-branded UI."""

import streamlit as st

from src.dashboard.components._styles import get_iframe_styles


def glassmorphic_card(content: str, card_class: str = "glassmorphic-card") -> None:
    """Wrap content in a glassmorphic card with Sigma brand styling.

    Args:
        content: Raw HTML string to wrap inside the card
        card_class: CSS class name for the card (default: "glassmorphic-card")
    """
    styles = get_iframe_styles()
    html = f"""
    {styles}
    <div class="{card_class}">
        {content}
    </div>
    """
    st.html(html)


def glassmorphic_container(title: str | None = None) -> None:
    """Render a higher-level glassmorphic container with optional title.

    This is a wrapper for sections of the page. Use for wrapping groups of content
    that need glassmorphic styling.

    Args:
        title: Optional title to display at the top of the container (renders as h3)
    """
    if title:
        content = f'<h3 style="font-family: var(--font-heading); color: var(--sigma-text-primary); margin: 0 0 1rem 0;">{title}</h3>'
    else:
        content = ""

    styles = get_iframe_styles()
    html = f"""
    {styles}
    <div class="glassmorphic-card">
        {content}
    </div>
    """
    st.html(html)
