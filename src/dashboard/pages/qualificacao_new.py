"""Dashboard de Qualificação - Qualified Leads com detalhes de emendas.

Este dashboard apresenta os leads qualificados (OSCs 2025/2026 beneficiárias de emendas)
ranqueados por valor de prospecção. Leads com menos propostas históricas são mais
valiosos (indicam menor concorrência e maior receptividade).
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.export import render_csv_export
from src.dashboard.queries.qualificacao import (
    get_estados_disponiveis,
    get_proponente_emendas,
    get_proponente_propostas,
    get_qualification_stats,
    get_qualified_leads,
)


def format_cnpj(cnpj: str) -> str:
    """Format CNPJ as XX.XXX.XXX/XXXX-XX."""
    if pd.isna(cnpj) or not cnpj:
        return ""

    cnpj_clean = str(cnpj).replace(".", "").replace("/", "").replace("-", "")

    if len(cnpj_clean) != 14:
        return cnpj

    return f"{cnpj_clean[0:2]}.{cnpj_clean[2:5]}.{cnpj_clean[5:8]}/{cnpj_clean[8:12]}-{cnpj_clean[12:14]}"


def render_qualificacao_nova():
    """Render the enhanced qualification dashboard."""
    st.title("🎯 Qualificação de Leads - OSCs 2025/2026")

    # Info box
    st.info(
        "**Critério de Valor:** Leads com **menos propostas** são mais valiosos - "
        "indicam menor concorrência e maior receptividade a novas parcerias.\n\n"
        "**Dados:** OSCs de 2025/2026 que são beneficiárias de emendas parlamentares. "
        "Todos são leads **qualificados** com emendas aprovadas."
    )

    # --- KPI METRICS ROW ---
    stats = get_qualification_stats()

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Total Leads Qualificados", f"{stats['total_leads']:,}")

    with col2:
        st.metric("Total Emendas", f"{stats['total_emendas']:,}")

    with col3:
        st.metric(
            "Valor Total Emendas",
            f"R$ {stats['total_valor_emendas'] / 1_000_000:.1f}M",
        )

    with col4:
        st.metric(
            "Leads Alto Valor (≤3 propostas)",
            f"{stats['high_value_leads']:,}",
        )

    st.markdown("---")

    # --- FILTERS SIDEBAR ---
    st.sidebar.header("Filtros")

    # Estado filter
    estados = get_estados_disponiveis()
    estados.insert(0, "Todos")
    estado_selected = st.sidebar.selectbox(
        "Estado",
        options=estados,
        index=0,
        key="qualif_estado",
    )

    # Max propostas filter (value-based filtering)
    max_propostas = st.sidebar.number_input(
        "Máx Propostas (valor)",
        min_value=0,
        max_value=100,
        value=None,
        step=1,
        key="qualif_max_props",
        help="Filtrar leads com no máximo N propostas (menor = maior valor)",
    )

    # Min emendas filter
    min_emendas = st.sidebar.number_input(
        "Mín Emendas",
        min_value=0,
        max_value=50,
        value=None,
        step=1,
        key="qualif_min_emendas",
        help="Filtrar leads com pelo menos N emendas",
    )

    # Search filter
    search_term = st.sidebar.text_input(
        "Buscar",
        placeholder="Nome ou CNPJ...",
        key="qualif_search",
    )

    # Build filters dict
    filters = {}

    if estado_selected != "Todos":
        filters["estado"] = estado_selected

    if max_propostas is not None:
        filters["max_propostas"] = max_propostas

    if min_emendas is not None:
        filters["min_emendas"] = min_emendas

    if search_term:
        filters["search"] = search_term

    # --- FETCH DATA ---
    df_leads = get_qualified_leads(limit=5000, filters=filters)

    if df_leads.empty:
        st.warning("Nenhum lead encontrado com os filtros aplicados.")
        return

    # Make a copy to avoid modifying cached data
    df = df_leads.copy()

    # --- MAIN TABLE SECTION ---
    st.subheader(f"Leads Qualificados Ranqueados ({len(df)} registros)")

    # Add rank column
    df["rank"] = range(1, len(df) + 1)

    # Format CNPJ
    df["cnpj_formatado"] = df["cnpj"].apply(format_cnpj)

    # Format valor_total_emendas as currency
    df["valor_emendas_fmt"] = df["valor_total_emendas"].apply(
        lambda x: f"R$ {x / 1_000:,.0f}K" if pd.notna(x) and x > 0 else "R$ 0"
    )

    # Add value badge based on total_propostas
    def get_value_badge(n_propostas):
        if n_propostas == 0:
            return "🌟 VERDE"
        elif n_propostas <= 3:
            return "⭐ ALTO"
        elif n_propostas <= 10:
            return "✓ BOM"
        else:
            return "○ REGULAR"

    df["valor"] = df["total_propostas"].apply(get_value_badge)

    # Prepare display DataFrame
    display_columns = [
        "rank",
        "valor",
        "nome",
        "cnpj_formatado",
        "estado",
        "municipio",
        "total_propostas",
        "total_emendas",
        "valor_emendas_fmt",
    ]

    df_display = df[display_columns].copy()

    # Rename columns for display
    df_display.columns = [
        "#",
        "Valor",
        "Nome",
        "CNPJ",
        "UF",
        "Município",
        "Propostas",
        "Emendas",
        "Valor Emendas",
    ]

    # Highlight high-value leads (<=3 propostas)
    def highlight_high_value(row):
        """Highlight high-value leads."""
        if row["Propostas"] <= 3:
            return ["background-color: #d4edda"] * len(row)  # Light green
        return [""] * len(row)

    # Apply styling
    styled_df = df_display.style.apply(highlight_high_value, axis=1)

    # Display with click-to-expand
    st.dataframe(
        styled_df,
        use_container_width=True,
        hide_index=True,
        height=400,
    )

    st.caption(
        "✨ **Verde destacado:** Leads de alto valor (≤3 propostas)\n\n"
        "**Legenda de Valor:** 🌟 VERDE (0) | ⭐ ALTO (1-3) | ✓ BOM (4-10) | ○ REGULAR (11+)"
    )

    # --- LEAD DETAIL DRILL-DOWN ---
    st.markdown("---")
    st.subheader("Detalhes do Lead")

    # Lead selection
    lead_options = df.apply(
        lambda x: f"{x['nome'][:50]} - {format_cnpj(x['cnpj'])}", axis=1
    ).tolist()

    if not lead_options:
        st.info("Selecione um lead acima para ver os detalhes.")
    else:
        selected_lead_idx = st.selectbox(
            "Selecione um lead para ver detalhes de emendas e histórico de propostas:",
            range(len(lead_options)),
            format_func=lambda i: lead_options[i],
            key="selected_lead",
        )

        if selected_lead_idx is not None:
            selected_cnpj = df.iloc[selected_lead_idx]["cnpj"]
            selected_nome = df.iloc[selected_lead_idx]["nome"]

            st.markdown(f"### {selected_nome}")

            # Show proponente details
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Total Propostas", df.iloc[selected_lead_idx]["total_propostas"])
            with col2:
                st.metric("Total Emendas", df.iloc[selected_lead_idx]["total_emendas"])
            with col3:
                valor_emendas = df.iloc[selected_lead_idx]["valor_total_emendas"]
                st.metric("Valor Emendas", f"R$ {valor_emendas / 1_000_000:.2f}M")

            # Emendas tab and Propostas tab
            tab1, tab2 = st.tabs(["📋 Emendas", "📄 Propostas Históricas"])

            with tab1:
                st.markdown("#### Emendas Parlamentares")
                df_emendas = get_proponente_emendas(selected_cnpj)

                if df_emendas.empty:
                    st.info("Nenhuma emenda encontrada para este lead.")
                else:
                    # Format emendas table
                    df_emendas_display = df_emendas.copy()
                    df_emendas_display["valor_fmt"] = df_emendas_display[
                        "valor_emenda"
                    ].apply(lambda x: f"R$ {x:,.2f}" if pd.notna(x) else "R$ 0,00")

                    display_cols = [
                        "numero_emenda",
                        "parlamentar",
                        "valor_fmt",
                        "tipo_emenda",
                    ]
                    df_emendas_display = df_emendas_display[
                        [c for c in display_cols if c in df_emendas_display.columns]
                    ]

                    df_emendas_display.columns = ["Número", "Parlamentar", "Valor", "Tipo"]

                    st.dataframe(
                        df_emendas_display,
                        use_container_width=True,
                        hide_index=True,
                    )

            with tab2:
                st.markdown("#### Histórico de Propostas")
                df_propostas = get_proponente_propostas(selected_cnpj)

                if df_propostas.empty:
                    st.info("Nenhuma proposta histórica encontrada.")
                else:
                    # Format propostas table
                    df_propostas_display = df_propostas.copy()
                    df_propostas_display["valor_global_fmt"] = df_propostas_display[
                        "valor_global"
                    ].apply(lambda x: f"R$ {x / 1_000:,.0f}K" if pd.notna(x) else "")

                    display_cols = [
                        "titulo",
                        "situacao",
                        "valor_global_fmt",
                        "data_publicacao",
                        "programa_nome",
                    ]
                    df_propostas_display = df_propostas_display[
                        [c for c in display_cols if c in df_propostas_display.columns]
                    ]

                    df_propostas_display.columns = [
                        "Título",
                        "Situação",
                        "Valor",
                        "Data",
                        "Programa",
                    ]

                    st.dataframe(
                        df_propostas_display,
                        use_container_width=True,
                        hide_index=True,
                        height=300,
                    )

    # --- CSV EXPORT SECTION ---
    st.markdown("---")
    st.subheader("Exportar Dados")

    # Prepare export DataFrame
    export_columns = [
        "rank",
        "nome",
        "cnpj",
        "natureza_juridica",
        "estado",
        "municipio",
        "cep",
        "endereco",
        "bairro",
        "total_propostas",
        "total_emendas",
        "valor_total_emendas",
    ]

    df_export = df[[col for col in export_columns if col in df.columns]].copy()

    df_export.columns = [
        "Rank",
        "Nome",
        "CNPJ",
        "Natureza Jurídica",
        "UF",
        "Município",
        "CEP",
        "Endereço",
        "Bairro",
        "Total Propostas",
        "Total Emendas",
        "Valor Total Emendas",
    ]

    render_csv_export(df_export, "leads_qualificados.csv")
