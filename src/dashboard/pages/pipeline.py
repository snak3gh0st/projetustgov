"""Pipeline de Leads page - overview do pipeline para vendedores.

Layout:
- KPI row: Total leads, Leads novos (sem contato), Valor total emendas, Instrumentos ativos
- 2 columns: Mapa leads por UF | Distribuicao por faixa de valor
- Top 10 Leads (ranking cards clicaveis -> Lead Profile)
"""

import streamlit as st

from src.dashboard.components.charts import (
    create_brasil_choropleth,
    create_value_distribution,
    render_plotly_chart,
)
from src.dashboard.components.kpi import kpi_row
from src.dashboard.components.ranking_cards import render_ranking_card_with_action
from src.dashboard.queries.chart_data import (
    get_proponentes_por_estado,
    get_value_distribution,
)
from src.dashboard.queries.qualificacao import (
    get_qualification_stats,
    get_qualified_leads,
)
from src.dashboard.utils.tiers import calculate_value_tier


def _format_currency_short(value: float) -> str:
    """Format value as R$ XM or R$ XK."""
    if value >= 1_000_000_000:
        return f"R$ {value / 1_000_000_000:.1f}B"
    if value >= 1_000_000:
        return f"R$ {value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"R$ {value / 1_000:.0f}K"
    return f"R$ {value:.0f}"


def render_pipeline() -> None:
    """Render the pipeline overview page."""
    st.title("Pipeline de Leads")
    st.markdown("Panorama geral do pipeline de vendas TransfereGov")

    # ===== KPI ROW =====
    stats = get_qualification_stats()

    kpi_cards = [
        {
            "label": "Total Leads",
            "value": stats.get("total_leads", 0),
            "icon": "🎯",
        },
        {
            "label": "Leads Novos",
            "value": stats.get("new_leads", 0),
            "icon": "🆕",
            "delta": f"{stats.get('new_leads', 0)} sem contato",
            "delta_color": "green",
        },
        {
            "label": "Valor Total Emendas",
            "value": _format_currency_short(stats.get("total_valor_emendas", 0)),
            "icon": "💰",
        },
        {
            "label": "Total Convenios",
            "value": stats.get("total_convenios", 0),
            "icon": "📋",
        },
    ]
    kpi_row(kpi_cards)

    st.markdown("")

    # ===== 2 COLUMNS: MAP + VALUE DISTRIBUTION =====
    col_map, col_dist = st.columns(2)

    with col_map:
        st.markdown("### Leads por Estado")
        estado_df = get_proponentes_por_estado()
        if not estado_df.empty:
            fig_map = create_brasil_choropleth(
                estado_df,
                color_column="total_proponentes",
                title="",
                hover_label="Leads",
            )
            render_plotly_chart(fig_map, key="pipeline_map")
        else:
            st.info("Sem dados de distribuicao por estado.")

    with col_dist:
        st.markdown("### Distribuicao por Faixa de Valor")
        dist_df = get_value_distribution()
        if not dist_df.empty:
            fig_dist = create_value_distribution(dist_df, title="")
            render_plotly_chart(fig_dist, key="pipeline_dist")
        else:
            st.info("Sem dados de distribuicao por valor.")

    st.markdown("")

    # ===== TOP 10 LEADS =====
    st.markdown("### Top 10 Leads (Novos)")

    top_leads_df = get_qualified_leads(limit=10, filters={"is_new_lead": True})

    if top_leads_df.empty:
        st.info("Nenhum lead novo encontrado.")
    else:
        # Add tier classification
        top_leads_df["tier"] = top_leads_df.apply(
            lambda row: calculate_value_tier(
                total_propostas=row["total_propostas"],
                valor_emendas=row["valor_total_emendas"] or 0.0,
                total_convenios=row["total_convenios"],
            ),
            axis=1,
        )

        for idx, row in top_leads_df.iterrows():
            rank = idx + 1 if isinstance(idx, int) else 1
            clicked = render_ranking_card_with_action(
                rank=rank,
                proponente_dict=row.to_dict(),
            )
            if clicked:
                st.session_state.selected_lead_cnpj = row["cnpj"]
                st.session_state.selected_lead_name = row["nome"]
                st.switch_page(st.session_state._pages["Lead Profile"])
