"""Tier classification utilities for lead value ranking.

This module provides centralized tier classification logic used across the dashboard
to categorize proponentes by value (HIGH/MEDIUM/LOW).
"""

# Tier classification thresholds
TIER_COLORS = {
    "HIGH": "#10B981",    # Emerald green (virgin proponents, high value)
    "MEDIUM": "#00D4FF",  # Neon blue (moderate value, low competition)
    "LOW": "#6B7280",     # Gray (high competition, low value)
}


def calculate_value_tier(
    total_propostas: int,
    valor_emendas: float,
    total_convenios: int
) -> str:
    """Calculate value tier for a proponente based on proposal/emenda metrics.

    Tier logic:
    - HIGH: Virgin proponents (0 propostas) OR high-value with convênios (>1M emendas + convenios)
    - MEDIUM: Low competition (<=3 propostas) AND moderate value (100K-1M emendas)
    - LOW: Everything else (high competition or low value)

    Args:
        total_propostas: Total number of propostas submitted by proponente
        valor_emendas: Total value of emendas associated with proponente
        total_convenios: Total number of convênios (formalized agreements)

    Returns:
        Tier classification string: "HIGH", "MEDIUM", or "LOW"
    """
    # Virgin proponents (never submitted) = highest value (untapped market)
    if total_propostas == 0:
        return "HIGH"

    # High-value proponents with formalized agreements
    if valor_emendas > 1_000_000 and total_convenios > 0:
        return "HIGH"

    # Moderate value with low competition
    if total_propostas <= 3 and 100_000 <= valor_emendas <= 1_000_000:
        return "MEDIUM"

    # Everything else: high competition or low value
    return "LOW"
