"""Dashboard de Qualificação - Qualified Leads com detalhes de emendas.

Este dashboard apresenta os leads qualificados (CNPJs privados 2025/2026)
ranqueados por valor de prospecção. Leads com menos propostas históricas são mais
valiosos (indicam menor concorrência e maior receptividade).
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.charts import create_value_distribution, render_plotly_chart
from src.dashboard.components.export import render_csv_export
from src.dashboard.components.kpi import kpi_row
from src.dashboard.queries.chart_data import get_value_distribution
from src.dashboard.queries.qualificacao import (
    get_estados_disponiveis,
    get_proponente_convenios,
    get_proponente_emendas,
    get_proponente_historico,
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
    st.title("🎯 Qualificação de Leads - CNPJ 2025/2026")

    # Info box
    st.info(
        "**Critério de Valor:** Leads com **menos propostas** são mais valiosos - "
        "indicam menor concorrência e maior receptividade a novas parcerias.\n\n"
        "**Dados:** CNPJs privados (OSCs, Empresas, Consórcios) com propostas em 2025/2026. "
        "Exclui Administração Pública Municipal e Estadual. "
        "Emendas parlamentares são dados de enriquecimento."
    )

    # --- KPI METRICS ROW ---
    stats = get_qualification_stats()

    # Detect which data is available
    has_client_data = stats['existing_clients'] > 0
    has_convenio_data = stats['total_convenios'] > 0

    # Row 1: Core KPIs as premium cards
    core_kpis = [
        {"label": "Total Leads", "value": stats['total_leads']},
        {"label": "Total Emendas", "value": stats['total_emendas']},
        {"label": "Valor Emendas", "value": f"R$ {stats['total_valor_emendas'] / 1_000_000:.1f}M"},
    ]
    if has_client_data:
        core_kpis.append({"label": "Clientes Existentes", "value": stats['existing_clients']})

    kpi_row(core_kpis)

    # Row 2: Convenio KPIs (only when data exists)
    if has_convenio_data:
        kpi_row([
            {"label": "Total Convênios", "value": stats['total_convenios']},
            {"label": "Valor Desembolsado", "value": f"R$ {stats['total_valor_desembolsos'] / 1_000_000:.1f}M"},
        ])

    st.markdown("")

    # --- VALUE DISTRIBUTION CHART ---
    st.markdown("### 📊 Distribuição por Faixa de Valor")
    st.caption("Quantidade de proponentes qualificados em cada faixa — menos propostas = maior valor de prospecção")

    distribution_data = get_value_distribution()
    if not distribution_data.empty:
        fig_distribution = create_value_distribution(
            distribution_data,
            title=''
        )
        render_plotly_chart(fig_distribution, key='qualificacao_distribution')
    else:
        st.info("Dados de distribuição indisponíveis")

    st.markdown("")

    # --- FILTERS SIDEBAR ---
    st.sidebar.header("Filtros")

    # Cliente status filter (only when client data exists)
    cliente_status = "Todos"
    if has_client_data:
        cliente_status = st.sidebar.radio(
            "Status do Lead",
            options=["Todos", "Apenas Novos Leads", "Apenas Clientes Existentes"],
            index=0,
            key="qualif_cliente_status",
            help="Filtrar por status de cliente",
        )

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

    if cliente_status == "Apenas Novos Leads":
        filters["is_new_lead"] = True
    elif cliente_status == "Apenas Clientes Existentes":
        filters["is_existing_client"] = True

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

    # Format valor_total_desembolsos as currency (only when data exists)
    if has_convenio_data:
        df["valor_desembolsos_fmt"] = df["valor_total_desembolsos"].apply(
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

    # Add client status badge (only when client data exists)
    if has_client_data:
        df["status_cliente"] = df["is_existing_client"].apply(
            lambda x: "✅ Cliente" if x else "🆕 Novo"
        )

    # Truncate ministerios for display
    df["ministerios_truncated"] = df["ministerios"].apply(
        lambda x: (
            x[:40] + "..." if pd.notna(x) and len(str(x)) > 40 else (x if pd.notna(x) else "N/A")
        )
    )

    # Prepare display DataFrame - columns depend on available data
    display_columns = ["rank"]
    column_names = ["#"]

    if has_client_data:
        display_columns.append("status_cliente")
        column_names.append("Status")

    display_columns += ["valor", "nome", "cnpj_formatado", "estado", "municipio",
                        "ministerios_truncated", "total_propostas", "total_emendas",
                        "valor_emendas_fmt"]
    column_names += ["Valor", "Nome", "CNPJ", "UF", "Municipio",
                     "Ministerios", "Propostas", "Emendas", "Valor Emendas"]

    if has_convenio_data:
        display_columns += ["total_convenios", "valor_desembolsos_fmt"]
        column_names += ["Convenios", "Valor Desembolsado"]

    df_display = df[display_columns].copy()
    df_display.columns = column_names

    # Highlight high-value leads (<=3 propostas)
    def highlight_high_value(row):
        """Highlight high-value leads with dark-theme-compatible styling."""
        if row["Propostas"] <= 3:
            return ["background-color: rgba(16, 185, 129, 0.15); color: #E8F4FD"] * len(row)
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

    caption_parts = [
        "**Verde destacado:** Leads de alto valor (<=3 propostas)",
        "**Legenda de Valor:** VERDE (0) | ALTO (1-3) | BOM (4-10) | REGULAR (11+)",
    ]
    if has_client_data:
        caption_parts.insert(1, "**Legenda de Status:** Novo Lead | Cliente Existente")
    st.caption("\n\n".join(caption_parts))

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

            # Show proponente details - core metrics as premium cards
            lead_data = df.iloc[selected_lead_idx]
            valor_emendas = lead_data["valor_total_emendas"]
            detail_kpis = [
                {"label": "Total Propostas", "value": lead_data["total_propostas"]},
                {"label": "Total Emendas", "value": lead_data["total_emendas"]},
                {"label": "Valor Emendas", "value": f"R$ {valor_emendas / 1_000_000:.2f}M"},
            ]
            if has_convenio_data:
                detail_kpis.append({"label": "Convênios", "value": lead_data.get("total_convenios", 0)})
                valor_desemb = lead_data.get("valor_total_desembolsos", 0) or 0
                detail_kpis.append({"label": "Valor Desembolsado", "value": f"R$ {valor_desemb / 1_000_000:.2f}M"})

            kpi_row(detail_kpis)

            # Contact info if available
            email = df.iloc[selected_lead_idx].get("email")
            telefone = df.iloc[selected_lead_idx].get("telefone")
            if email or telefone:
                contact_parts = []
                if email and pd.notna(email) and str(email).strip():
                    contact_parts.append(f"**Email:** {email}")
                if telefone and pd.notna(telefone) and str(telefone).strip():
                    contact_parts.append(f"**Telefone:** {telefone}")
                if contact_parts:
                    st.markdown(" | ".join(contact_parts))

            # Build tabs based on available data
            tab_names = ["Emendas", "Propostas"]
            if has_convenio_data:
                tab_names += ["Convenios", "Historico"]

            tabs = st.tabs(tab_names)

            with tabs[0]:
                st.markdown("#### Emendas Parlamentares")
                df_emendas = get_proponente_emendas(selected_cnpj)

                if df_emendas.empty:
                    st.info("Nenhuma emenda encontrada para este lead.")
                else:
                    df_emendas_display = df_emendas.copy()
                    df_emendas_display["valor_fmt"] = df_emendas_display[
                        "valor_emenda"
                    ].apply(lambda x: f"R$ {x:,.2f}" if pd.notna(x) else "R$ 0,00")

                    display_cols = ["numero_emenda", "parlamentar", "valor_fmt", "tipo_emenda"]
                    df_emendas_display = df_emendas_display[
                        [c for c in display_cols if c in df_emendas_display.columns]
                    ]
                    df_emendas_display.columns = ["Numero", "Parlamentar", "Valor", "Tipo"]

                    st.dataframe(df_emendas_display, use_container_width=True, hide_index=True)

            with tabs[1]:
                st.markdown("#### Historico de Propostas")
                df_propostas = get_proponente_propostas(selected_cnpj)

                if df_propostas.empty:
                    st.info("Nenhuma proposta historica encontrada.")
                else:
                    df_propostas_display = df_propostas.copy()
                    df_propostas_display["valor_global_fmt"] = df_propostas_display[
                        "valor_global"
                    ].apply(lambda x: f"R$ {x / 1_000:,.0f}K" if pd.notna(x) else "")

                    display_cols = ["titulo", "situacao", "valor_global_fmt", "data_publicacao", "programa_nome"]
                    df_propostas_display = df_propostas_display[
                        [c for c in display_cols if c in df_propostas_display.columns]
                    ]
                    df_propostas_display.columns = ["Titulo", "Situacao", "Valor", "Data", "Programa"]

                    st.dataframe(df_propostas_display, use_container_width=True, hide_index=True, height=300)

            # Convenios and Historico tabs (only when data exists)
            if has_convenio_data:
                with tabs[2]:
                    st.markdown("#### Convenios Formalizados")
                    df_convenios = get_proponente_convenios(selected_cnpj)

                    if df_convenios.empty:
                        st.info("Nenhum convenio encontrado para este lead.")
                    else:
                        df_conv_display = df_convenios.copy()
                        df_conv_display["valor_global_fmt"] = df_conv_display[
                            "valor_global"
                        ].apply(lambda x: f"R$ {x / 1_000:,.0f}K" if pd.notna(x) else "")
                        df_conv_display["valor_desemb_fmt"] = df_conv_display[
                            "valor_desembolsado"
                        ].apply(lambda x: f"R$ {x / 1_000:,.0f}K" if pd.notna(x) else "")

                        display_cols = ["nr_convenio", "situacao", "instrumento_ativo",
                                        "valor_global_fmt", "valor_desemb_fmt",
                                        "data_assinatura", "data_fim_vigencia"]
                        df_conv_display = df_conv_display[
                            [c for c in display_cols if c in df_conv_display.columns]
                        ]
                        df_conv_display.columns = ["Nr Convenio", "Situacao", "Ativo",
                                                   "Valor Global", "Valor Desembolsado",
                                                   "Data Assinatura", "Fim Vigencia"]

                        st.dataframe(df_conv_display, use_container_width=True, hide_index=True, height=300)

                with tabs[3]:
                    st.markdown("#### Historico de Situacoes")
                    df_historico = get_proponente_historico(selected_cnpj)

                    if df_historico.empty:
                        st.info("Nenhum historico de situacao encontrado.")
                    else:
                        df_hist_display = df_historico.copy()
                        display_cols = ["proposta_id", "proposta_titulo", "nr_convenio",
                                        "situacao", "data_historico", "dias_historico"]
                        df_hist_display = df_hist_display[
                            [c for c in display_cols if c in df_hist_display.columns]
                        ]
                        df_hist_display.columns = ["Proposta ID", "Titulo", "Nr Convenio",
                                                   "Situacao", "Data", "Dias"]

                        st.dataframe(df_hist_display, use_container_width=True, hide_index=True, height=300)

    # --- CSV EXPORT SECTION ---
    st.markdown("---")
    st.subheader("Exportar Dados")

    # Prepare export DataFrame - include only columns with data
    export_columns = ["rank", "nome", "cnpj"]
    export_names = ["Rank", "Nome", "CNPJ"]

    if has_client_data:
        export_columns.append("is_existing_client")
        export_names.append("Cliente Existente")

    export_columns += ["natureza_juridica", "estado", "municipio", "cep",
                       "endereco", "bairro"]
    export_names += ["Natureza Juridica", "UF", "Municipio", "CEP",
                     "Endereco", "Bairro"]

    # Include contact info only if any lead has email/telefone
    has_contact = df["email"].notna().any() or df["telefone"].notna().any()
    if has_contact:
        export_columns += ["email", "telefone"]
        export_names += ["Email", "Telefone"]

    export_columns += ["ministerios", "total_propostas", "total_emendas",
                       "valor_total_emendas"]
    export_names += ["Ministerios/Orgaos", "Total Propostas", "Total Emendas",
                     "Valor Total Emendas"]

    if has_convenio_data:
        export_columns += ["total_convenios", "valor_total_desembolsos"]
        export_names += ["Total Convenios", "Valor Total Desembolsos"]

    df_export = df[[col for col in export_columns if col in df.columns]].copy()

    if has_client_data and "is_existing_client" in df_export.columns:
        df_export["is_existing_client"] = df_export["is_existing_client"].apply(
            lambda x: "Sim" if x else "Nao"
        )

    df_export.columns = export_names[:len(df_export.columns)]

    render_csv_export(df_export, "leads_qualificados.csv")
