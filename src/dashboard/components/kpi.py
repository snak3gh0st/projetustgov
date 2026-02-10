"""Premium KPI card components for Sigma-branded dashboard metrics."""

import streamlit as st


def premium_kpi_card(
    label: str,
    value: str | int | float,
    delta: str | None = None,
    delta_color: str = "gray",
    icon: str | None = None,
) -> None:
    """Render a premium KPI card with glassmorphic styling.

    Args:
        label: The metric label (e.g., "Total Propostas")
        value: The metric value (int/float will be formatted with commas)
        delta: Optional delta text (e.g., "+12%" or "5h ago")
        delta_color: Color variant for delta - "green", "red", or "gray" (default: "gray")
        icon: Optional icon/emoji to prepend to the label
    """
    # Format value based on type
    if isinstance(value, int):
        formatted_value = f"{value:,}"
    elif isinstance(value, float):
        formatted_value = f"{value:,.2f}"
    else:
        formatted_value = str(value)

    # Build label with optional icon
    if icon:
        full_label = f"{icon} {label}"
    else:
        full_label = label

    # Build delta HTML if provided
    delta_html = ""
    if delta:
        delta_class = f"delta-{delta_color}"
        delta_html = f'<div class="kpi-delta {delta_class}">{delta}</div>'

    html = f"""
    <div class="premium-kpi-card">
        <div class="kpi-label">{full_label}</div>
        <div class="kpi-value">{formatted_value}</div>
        {delta_html}
    </div>
    """
    st.html(html)


def kpi_row(cards: list[dict]) -> None:
    """Render multiple KPI cards in a horizontal grid row.

    This avoids multiple st.html() calls which create separate containers.
    All cards are rendered in a single st.html() call with CSS grid layout.

    Args:
        cards: List of dicts, each with keys: label, value, delta (optional),
               delta_color (optional), icon (optional)

    Example:
        kpi_row([
            {"label": "Programas", "value": 1234},
            {"label": "Propostas", "value": 5678, "delta": "+10%", "delta_color": "green"},
        ])
    """
    n = len(cards)

    # Build individual card HTML
    card_htmls = []
    for card_data in cards:
        label = card_data.get("label", "")
        value = card_data.get("value", 0)
        delta = card_data.get("delta")
        delta_color = card_data.get("delta_color", "gray")
        icon = card_data.get("icon")

        # Format value
        if isinstance(value, int):
            formatted_value = f"{value:,}"
        elif isinstance(value, float):
            formatted_value = f"{value:,.2f}"
        else:
            formatted_value = str(value)

        # Build label
        if icon:
            full_label = f"{icon} {label}"
        else:
            full_label = label

        # Build delta
        delta_html = ""
        if delta:
            delta_class = f"delta-{delta_color}"
            delta_html = f'<div class="kpi-delta {delta_class}">{delta}</div>'

        card_html = f"""
        <div class="premium-kpi-card">
            <div class="kpi-label">{full_label}</div>
            <div class="kpi-value">{formatted_value}</div>
            {delta_html}
        </div>
        """
        card_htmls.append(card_html)

    # Wrap all cards in a grid container
    grid_html = f"""
    <div style="display: grid; grid-template-columns: repeat({n}, 1fr); gap: 1rem; margin: 1rem 0;">
        {"".join(card_htmls)}
    </div>
    """
    st.html(grid_html)
