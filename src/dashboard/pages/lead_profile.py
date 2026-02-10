"""Lead Profile page - Dedicated proponente deep-dive for sales workflow.

This page provides comprehensive proponente analysis including:
- Contact information and tier classification
- KPI value summary (tier, emendas value, propostas count, convenios)
- Related data in tabs (emendas, propostas, ministerios, programas)
- Quick actions (CSV export, CNPJ copy, navigation)
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.kpi import kpi_row
from src.dashboard.queries.lead_profile import (
    get_lead_emendas,
    get_lead_ministerios,
    get_lead_overview,
    get_lead_programas,
    get_lead_propostas,
)
from src.dashboard.utils.tiers import TIER_COLORS


def format_cnpj(cnpj: str) -> str:
    """Format CNPJ as XX.XXX.XXX/XXXX-XX."""
    if pd.isna(cnpj) or not cnpj:
        return ""

    cnpj_clean = str(cnpj).replace(".", "").replace("/", "").replace("-", "")

    if len(cnpj_clean) != 14:
        return cnpj

    return f"{cnpj_clean[0:2]}.{cnpj_clean[2:5]}.{cnpj_clean[5:8]}/{cnpj_clean[8:12]}-{cnpj_clean[12:14]}"


def render_lead_profile():
    """Render the dedicated lead profile page."""
    # Guard clause: check if a lead is selected
    selected_cnpj = st.session_state.get("selected_lead_cnpj")

    if not selected_cnpj:
        st.warning(
            "Nenhum lead selecionado. Use a busca global ou a pagina de Qualificacao "
            "para selecionar um proponente."
        )
        return

    # Fetch lead overview data
    lead_data = get_lead_overview(selected_cnpj)

    if lead_data.empty:
        st.error(f"Nenhum dado encontrado para o CNPJ: {selected_cnpj}")
        return

    # Extract lead info
    lead = lead_data.iloc[0]
    nome = lead["nome"]
    tier = lead["tier_classification"]
    tier_color = TIER_COLORS.get(tier, "#6B7280")

    # --- HEADER SECTION ---
    # Title with tier badge
    st.markdown(
        f"# {nome} "
        f'<span style="background-color: {tier_color}; color: white; padding: 0.25rem 0.75rem; '
        f'border-radius: 0.5rem; font-size: 0.75rem; font-weight: bold; margin-left: 1rem;">'
        f'{tier}</span>',
        unsafe_allow_html=True
    )

    st.markdown("")

    # --- KPI VALUE SUMMARY ---
    total_emendas_value = lead.get("valor_total_emendas") or 0.0
    total_propostas = lead.get("total_propostas") or 0
    total_convenios = lead.get("total_convenios") or 0

    kpi_cards = [
        {"label": "Tier", "value": tier},
        {"label": "Total Emendas", "value": f"R$ {total_emendas_value / 1_000_000:.2f}M"},
        {"label": "Total Propostas", "value": total_propostas},
        {"label": "Convenios", "value": total_convenios},
    ]
    kpi_row(kpi_cards)

    st.markdown("")

    # --- CONTACT INFO SECTION ---
    st.markdown("### 📞 Informacoes de Contato")

    col1, col2, col3 = st.columns(3)

    with col1:
        email = lead.get("email")
        email_display = email if (email and pd.notna(email) and str(email).strip()) else "Nao disponivel"
        st.markdown(f"**Email:** {email_display}")

    with col2:
        telefone = lead.get("telefone")
        telefone_display = telefone if (telefone and pd.notna(telefone) and str(telefone).strip()) else "Nao disponivel"
        st.markdown(f"**Telefone:** {telefone_display}")

    with col3:
        # Build address string
        endereco = lead.get("endereco")
        municipio = lead.get("municipio")
        estado = lead.get("estado")

        address_parts = []
        if endereco and pd.notna(endereco) and str(endereco).strip():
            address_parts.append(str(endereco))
        if municipio and pd.notna(municipio) and str(municipio).strip():
            address_parts.append(str(municipio))
        if estado and pd.notna(estado) and str(estado).strip():
            address_parts.append(str(estado))

        address_display = ", ".join(address_parts) if address_parts else "Nao disponivel"
        st.markdown(f"**Endereco:** {address_display}")

    st.markdown("")

    # --- QUICK ACTIONS ROW ---
    st.markdown("### ⚡ Acoes Rapidas")

    action_col1, action_col2, action_col3 = st.columns(3)

    with action_col1:
        # CSV Export
        csv_data = lead_data.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="Exportar Lead (CSV)",
            data=csv_data,
            file_name=f"lead_{selected_cnpj}.csv",
            mime="text/csv",
        )

    with action_col2:
        # CNPJ display with copy functionality
        cnpj_formatted = format_cnpj(selected_cnpj)
        st.markdown("**CNPJ:**")
        st.code(cnpj_formatted, language=None)

    with action_col3:
        # Back to Qualificacao navigation
        if st.button("Voltar para Qualificacao"):
            st.switch_page(st.session_state._pages["Qualificacao"])

    st.markdown("")

    # --- TABBED CONTENT SECTION ---
    st.markdown("### 📊 Dados Relacionados")

    tab1, tab2, tab3, tab4 = st.tabs(["Emendas", "Propostas", "Ministerios/Orgaos", "Programas"])

    with tab1:
        st.markdown("#### 💰 Emendas Parlamentares")
        df_emendas = get_lead_emendas(selected_cnpj, limit=100)

        if df_emendas.empty:
            st.info("Nenhuma emenda encontrada para este proponente.")
        else:
            # Format valor_emenda as currency
            df_emendas_display = df_emendas.copy()
            df_emendas_display["valor_emenda_fmt"] = df_emendas_display["valor_emenda"].apply(
                lambda x: f"R$ {x:,.2f}" if pd.notna(x) else "R$ 0,00"
            )

            # Select display columns
            display_cols = ["numero_emenda", "parlamentar", "valor_emenda_fmt", "tipo_emenda", "ministerio"]
            available_cols = [c for c in display_cols if c in df_emendas_display.columns]
            df_emendas_display = df_emendas_display[available_cols]

            # Rename columns
            col_names = {
                "numero_emenda": "Numero",
                "parlamentar": "Parlamentar",
                "valor_emenda_fmt": "Valor",
                "tipo_emenda": "Tipo",
                "ministerio": "Ministerio"
            }
            df_emendas_display.rename(columns={k: v for k, v in col_names.items() if k in df_emendas_display.columns}, inplace=True)

            st.caption(f"Mostrando {len(df_emendas_display)} emendas")
            st.dataframe(df_emendas_display, use_container_width=True, hide_index=True)

    with tab2:
        st.markdown("#### 📄 Propostas Submetidas")
        df_propostas = get_lead_propostas(selected_cnpj, limit=100)

        if df_propostas.empty:
            st.info("Nenhuma proposta encontrada para este proponente.")
        else:
            # Format valor_global as currency
            df_propostas_display = df_propostas.copy()
            df_propostas_display["valor_global_fmt"] = df_propostas_display["valor_global"].apply(
                lambda x: f"R$ {x / 1_000:,.0f}K" if pd.notna(x) else "R$ 0"
            )

            # Select display columns
            display_cols = ["transfer_gov_id", "titulo", "situacao", "valor_global_fmt", "data_publicacao", "programa_nome"]
            available_cols = [c for c in display_cols if c in df_propostas_display.columns]
            df_propostas_display = df_propostas_display[available_cols]

            # Rename columns
            col_names = {
                "transfer_gov_id": "ID",
                "titulo": "Titulo",
                "situacao": "Situacao",
                "valor_global_fmt": "Valor",
                "data_publicacao": "Data",
                "programa_nome": "Programa"
            }
            df_propostas_display.rename(columns={k: v for k, v in col_names.items() if k in df_propostas_display.columns}, inplace=True)

            st.caption(f"Mostrando {len(df_propostas_display)} propostas")
            st.dataframe(df_propostas_display, use_container_width=True, hide_index=True)

    with tab3:
        st.markdown("#### 🏛️ Ministerios/Orgaos Associados")
        df_ministerios = get_lead_ministerios(selected_cnpj)

        if df_ministerios.empty:
            st.info("Nenhum ministerio/orgao encontrado para este proponente.")
        else:
            df_ministerios_display = df_ministerios.copy()

            # Rename columns
            df_ministerios_display.rename(columns={"orgao": "Orgao", "count": "Propostas"}, inplace=True)

            st.dataframe(df_ministerios_display, use_container_width=True, hide_index=True)

    with tab4:
        st.markdown("#### 📋 Programas Associados")
        df_programas = get_lead_programas(selected_cnpj)

        if df_programas.empty:
            st.info("Nenhum programa encontrado para este proponente.")
        else:
            df_programas_display = df_programas.copy()

            # Rename columns
            df_programas_display.rename(
                columns={"programa_nome": "Programa", "programa_id": "ID", "count": "Propostas"},
                inplace=True
            )

            st.dataframe(df_programas_display, use_container_width=True, hide_index=True)
