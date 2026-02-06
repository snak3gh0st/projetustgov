"""Reusable metric card components for displaying KPIs."""

import streamlit as st


def render_metric_cards(counts: dict, freshness: dict) -> None:
    """Render a row of metric cards for entity counts and data freshness.

    Args:
        counts: Dictionary with entity counts {"programas": N, "propostas": N, ...}
        freshness: Dictionary with data freshness info {"last_extraction": datetime, "hours_ago": float, "status": str}
    """
    # Render 4 entity count cards in columns
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric(
            label="Programas",
            value=f"{counts.get('programas', 0):,}",
            help="Total de programas no banco de dados",
        )

    with col2:
        st.metric(
            label="Propostas",
            value=f"{counts.get('propostas', 0):,}",
            help="Total de propostas no banco de dados",
        )

    with col3:
        st.metric(
            label="Apoiadores",
            value=f"{counts.get('apoiadores', 0):,}",
            help="Total de apoiadores no banco de dados",
        )

    with col4:
        st.metric(
            label="Emendas",
            value=f"{counts.get('emendas', 0):,}",
            help="Total de emendas no banco de dados",
        )

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
            delta_color = "normal"
            status_emoji = "✅"
        elif status == "stale":
            delta_color = "off"
            status_emoji = "⚠️"
        else:  # critical
            delta_color = "off"
            status_emoji = "🔴"

        col1, col2, col3 = st.columns([1, 1, 2])

        with col1:
            st.metric(
                label=f"{status_emoji} Última Extração",
                value=formatted_date,
                delta=delta_text,
                delta_color=delta_color,
                help="Data e hora da última execução do pipeline de extração",
            )

        with col2:
            status_labels = {
                "fresh": "Dados Atualizados",
                "stale": "Dados Desatualizados",
                "critical": "Dados Críticos",
            }
            st.metric(
                label="Status",
                value=status_labels.get(status, "Desconhecido"),
                help="Fresh: <25h | Stale: <48h | Critical: >48h",
            )
