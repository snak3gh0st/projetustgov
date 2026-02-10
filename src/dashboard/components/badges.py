"""Value badges and status indicators for Sigma-branded dashboard."""


def value_badge(text: str, variant: str = "gray") -> str:
    """Return HTML string for a colored pill badge.

    This returns a string (not renders) so it can be embedded in other HTML.

    Args:
        text: Badge text to display
        variant: Color variant - "green", "blue", "amber", or "gray" (default: "gray")

    Returns:
        HTML string for the badge
    """
    return f'<span class="value-badge value-badge--{variant}">{text}</span>'


def status_indicator(label: str, variant: str = "gray") -> str:
    """Return HTML string for a status indicator with colored dot + label.

    This returns a string (not renders) for inline status display.

    Args:
        label: Status label text
        variant: Color variant - "green", "blue", "amber", or "gray" (default: "gray")

    Returns:
        HTML string with status dot and label
    """
    return f'''
    <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
        <span class="status-indicator status-indicator--{variant}"></span>
        <span>{label}</span>
    </span>
    '''


def freshness_badge(status: str) -> str:
    """Return HTML string for a data freshness badge.

    Convenience function that maps freshness status to appropriate badge variant.

    Args:
        status: Freshness status - "fresh", "stale", or "critical"

    Returns:
        HTML string for the freshness badge
    """
    status_map = {
        "fresh": ("Atualizado", "green"),
        "stale": ("Desatualizado", "amber"),
        "critical": ("Crítico", "red"),
    }

    text, variant = status_map.get(status, ("Desconhecido", "gray"))

    # Map "red" to "amber" since we only have green/blue/amber/gray in CSS
    # Use amber for both stale and critical with different text
    if variant == "red":
        variant = "amber"

    return value_badge(text, variant)
