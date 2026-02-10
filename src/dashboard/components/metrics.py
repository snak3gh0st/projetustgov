"""Reusable metric card components for displaying KPIs."""

import streamlit as st

from src.dashboard.components.badges import freshness_badge
from src.dashboard.components.kpi import kpi_row, premium_kpi_card


def render_metric_cards(counts: dict, freshness: dict) -> None:
    """Render a row of metric cards for entity counts and data freshness.

    Args:
        counts: Dictionary with entity counts {"programas": N, "propostas": N, ...}
        freshness: Dictionary with data freshness info {"last_extraction": datetime, "hours_ago": float, "status": str}
    """
    # Render 4 entity count cards in a single row using premium KPI cards
    kpi_row([
        {"label": "Programas", "value": counts.get("programas", 0)},
        {"label": "Propostas", "value": counts.get("propostas", 0)},
        {"label": "Apoiadores", "value": counts.get("apoiadores", 0)},
        {"label": "Emendas", "value": counts.get("emendas", 0)},
    ])

    # Render data freshness indicator
    st.divider()

    if freshness["status"] == "no_data":
        st.warning("Nenhuma extração registrada ainda.")
    else:
        last_extraction = freshness["last_extraction"]
        hours_ago = freshness["hours_ago"]
        status = freshness["status"]

        # Format datetime for display
        if last_extraction:
            formatted_date = last_extraction.strftime("%d/%m/%Y %H:%M")
            delta_text = f"{hours_ago:.1f}h atrás"
        else:
            formatted_date = "N/A"
            delta_text = None

        # Determine delta color based on status
        if status == "fresh":
            delta_color = "green"
            status_emoji = "✅"
        elif status == "stale":
            delta_color = "gray"
            status_emoji = "⚠️"
        else:  # critical
            delta_color = "red"
            status_emoji = "🔴"

        # Render premium KPI card for last extraction
        premium_kpi_card(
            label=f"{status_emoji} Última Extração",
            value=formatted_date,
            delta=delta_text,
            delta_color=delta_color,
        )

        # Render freshness badge
        badge_html = freshness_badge(status)
        st.html(f'<div style="margin-top: 1rem;">{badge_html}</div>')
