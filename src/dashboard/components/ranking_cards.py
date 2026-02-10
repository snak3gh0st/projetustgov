"""Visual ranking card components for lead display with tier badges."""

import pandas as pd
import streamlit as st

from src.dashboard.components._styles import get_iframe_styles
from src.dashboard.utils.tiers import TIER_COLORS


def format_valor(valor: float) -> str:
    """Format valor as R$ XK or R$ XM."""
    if pd.isna(valor) or valor == 0:
        return "R$ 0"

    if valor >= 1_000_000:
        return f"R$ {valor / 1_000_000:.1f}M"
    else:
        return f"R$ {valor / 1_000:.0f}K"


def format_cnpj(cnpj: str) -> str:
    """Format CNPJ as XX.XXX.XXX/XXXX-XX."""
    if pd.isna(cnpj) or not cnpj:
        return ""

    cnpj_clean = str(cnpj).replace(".", "").replace("/", "").replace("-", "")

    if len(cnpj_clean) != 14:
        return cnpj

    return f"{cnpj_clean[0:2]}.{cnpj_clean[2:5]}.{cnpj_clean[5:8]}/{cnpj_clean[8:12]}-{cnpj_clean[12:14]}"


def render_ranking_cards(leads_df: pd.DataFrame, top_n: int = 10) -> None:
    """Render the top N leads as visual ranking cards.

    Each card shows: rank, lead name, CNPJ, tier badge, total propostas, valor emendas.
    All cards are rendered in a single st.html() call to avoid iframe proliferation.

    Args:
        leads_df: DataFrame with columns: nome, cnpj, tier, total_propostas, valor_total_emendas
        top_n: Number of top leads to display (default: 10)
    """
    if leads_df.empty:
        st.info("Nenhum lead disponível para exibir")
        return

    # Limit to top N
    df = leads_df.head(top_n).copy()

    # Build card HTML for each lead
    card_htmls = []
    for idx, row in df.iterrows():
        rank = idx + 1 if isinstance(idx, int) else idx
        nome = row.get("nome", "Nome não disponível")
        cnpj = row.get("cnpj", "")
        tier = row.get("tier", "LOW")
        total_propostas = row.get("total_propostas", 0)
        valor_emendas = row.get("valor_total_emendas", 0) or 0

        # Format values
        cnpj_fmt = format_cnpj(cnpj)
        valor_fmt = format_valor(valor_emendas)
        tier_color = TIER_COLORS.get(tier, TIER_COLORS["LOW"])

        # Truncate nome if too long
        nome_display = nome[:50] + "..." if len(str(nome)) > 50 else nome

        card_html = f"""
        <div class="ranking-card" style="background: rgba(255, 255, 255, 0.03); border-left: 4px solid {tier_color}; border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 1rem;">
            <div style="font-size: 2rem; font-weight: bold; color: var(--sigma-text-secondary); min-width: 40px; text-align: center;">
                {rank}
            </div>
            <div style="flex: 1;">
                <div style="font-size: 1rem; font-weight: 600; color: var(--sigma-text-primary); margin-bottom: 0.25rem;">
                    {nome_display}
                </div>
                <div style="font-size: 0.875rem; color: var(--sigma-text-secondary); margin-bottom: 0.25rem;">
                    {cnpj_fmt}
                </div>
                <div style="display: flex; gap: 1rem; font-size: 0.75rem;">
                    <span style="color: {tier_color}; font-weight: 600;">■ {tier}</span>
                    <span style="color: var(--sigma-text-secondary);">{total_propostas} propostas</span>
                    <span style="color: var(--sigma-text-secondary);">{valor_fmt}</span>
                </div>
            </div>
        </div>
        """
        card_htmls.append(card_html)

    # Combine all cards with embedded styles
    styles = get_iframe_styles()
    html = f"""
    {styles}
    <div style="margin: 1rem 0;">
        {"".join(card_htmls)}
    </div>
    """
    st.html(html)


def render_ranking_card_with_action(rank: int, proponente_dict: dict) -> bool:
    """Render a single ranking card as an interactive element with a button.

    Returns True if "Ver Perfil" button was clicked for this card.

    Args:
        rank: The rank number (1-based)
        proponente_dict: Dict with keys: nome, cnpj, tier, total_propostas, valor_total_emendas

    Returns:
        True if button clicked, False otherwise
    """
    nome = proponente_dict.get("nome", "Nome não disponível")
    cnpj = proponente_dict.get("cnpj", "")
    tier = proponente_dict.get("tier", "LOW")
    total_propostas = proponente_dict.get("total_propostas", 0)
    valor_emendas = proponente_dict.get("valor_total_emendas", 0) or 0

    # Format values
    cnpj_fmt = format_cnpj(cnpj)
    valor_fmt = format_valor(valor_emendas)
    tier_color = TIER_COLORS.get(tier, TIER_COLORS["LOW"])

    # Truncate nome if too long
    nome_display = nome[:50] + "..." if len(str(nome)) > 50 else nome

    # Card HTML
    styles = get_iframe_styles()
    card_html = f"""
    {styles}
    <div class="ranking-card" style="background: rgba(255, 255, 255, 0.03); border-left: 4px solid {tier_color}; border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 2rem; font-weight: bold; color: var(--sigma-text-secondary); min-width: 40px; text-align: center;">
            {rank}
        </div>
        <div style="flex: 1;">
            <div style="font-size: 1rem; font-weight: 600; color: var(--sigma-text-primary); margin-bottom: 0.25rem;">
                {nome_display}
            </div>
            <div style="font-size: 0.875rem; color: var(--sigma-text-secondary); margin-bottom: 0.25rem;">
                {cnpj_fmt}
            </div>
            <div style="display: flex; gap: 1rem; font-size: 0.75rem;">
                <span style="color: {tier_color}; font-weight: 600;">■ {tier}</span>
                <span style="color: var(--sigma-text-secondary);">{total_propostas} propostas</span>
                <span style="color: var(--sigma-text-secondary);">{valor_fmt}</span>
            </div>
        </div>
    </div>
    """

    col1, col2 = st.columns([5, 1])
    with col1:
        st.html(card_html)
    with col2:
        clicked = st.button(f"Ver Perfil", key=f"lead_profile_{rank}")

    return clicked
