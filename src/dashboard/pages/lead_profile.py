"""Lead Profile page - complete CRM view with 4 tabs.

This page provides:
- Header with tier badge + contact info + location
- KPI summary of financial totals
- 4 tabs: Instrumentos, Emendas, Propostas, Ministerios + Programas
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.kpi import kpi_row
from src.dashboard.queries.lead_profile import (
    get_lead_emendas,
    get_lead_instruments,
    get_lead_instrument_summary,
    get_lead_ministerios,
    get_lead_overview,
    get_lead_programas,
    get_lead_propostas,
)
from src.dashboard.utils.tiers import TIER_COLORS, calculate_value_tier


def format_cnpj(cnpj: str) -> str:
    """Format CNPJ as XX.XXX.XXX/XXXX-XX."""
    if pd.isna(cnpj) or not cnpj:
        return ""

    cnpj_clean = str(cnpj).replace(".", "").replace("/", "").replace("-", "")

    if len(cnpj_clean) != 14:
        return cnpj

    return f"{cnpj_clean[0:2]}.{cnpj_clean[2:5]}.{cnpj_clean[5:8]}/{cnpj_clean[8:12]}-{cnpj_clean[12:14]}"


def format_currency(value) -> str:
    """Format value as R$ X.XXX,XX."""
    if value is None or pd.isna(value):
        return "R$ 0,00"
    return f"R$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def render_lead_profile():
    """Render the lead profile page with 4 tabs."""
    # Guard clause: check if a lead is selected
    selected_cnpj = st.session_state.get("selected_lead_cnpj")

    if not selected_cnpj:
        st.warning(
            "Nenhum lead selecionado. Use a pagina de Leads "
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

    # Calculate tier
    tier = calculate_value_tier(
        total_propostas=lead["total_propostas"],
        valor_emendas=lead["valor_total_emendas"] or 0.0,
        total_convenios=lead["total_convenios"],
    )
    tier_color = TIER_COLORS.get(tier, TIER_COLORS["LOW"])

    # --- HEADER SECTION ---
    col_header1, col_header2 = st.columns([3, 1])

    with col_header1:
        # Title with tier badge
        st.markdown(
            f'<h1 style="display: inline;">{nome}</h1>'
            f' <span style="background-color: {tier_color}; color: white; '
            f'padding: 4px 12px; border-radius: 12px; font-size: 0.875rem; '
            f'font-weight: 600; vertical-align: middle;">{tier}</span>',
            unsafe_allow_html=True,
        )

    with col_header2:
        # Back navigation
        if st.button("← Voltar para Leads"):
            st.switch_page(st.session_state._pages["Leads"])

    # Contact info row (4 columns now with location)
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        cnpj_formatted = format_cnpj(selected_cnpj)
        st.markdown(f"**CNPJ:** `{cnpj_formatted}`")

    with col2:
        email = lead.get("email")
        email_display = email if (email and pd.notna(email) and str(email).strip()) else "Nao disponivel"
        st.markdown(f"**Email:** {email_display}")

    with col3:
        telefone = lead.get("telefone")
        telefone_display = telefone if (telefone and pd.notna(telefone) and str(telefone).strip()) else "Nao disponivel"
        st.markdown(f"**Telefone:** {telefone_display}")

    with col4:
        municipio = lead.get("municipio", "")
        estado = lead.get("estado", "")
        loc_parts = [p for p in [municipio, estado] if p and pd.notna(p) and str(p).strip()]
        location = " / ".join(loc_parts) if loc_parts else "Nao disponivel"
        st.markdown(f"**Local:** {location}")

    st.markdown("")

    # --- SUMMARY KPIs ROW ---
    summary = get_lead_instrument_summary(selected_cnpj)

    if summary:
        total_instrumentos = summary.get("total_instrumentos") or 0
        total_valor_global = summary.get("total_valor_global") or 0.0
        total_empenhado = summary.get("total_empenhado") or 0.0
        total_liberado = summary.get("total_liberado") or 0.0
        total_saldo_conta = summary.get("total_saldo_conta") or 0.0
        instrumentos_ativos = summary.get("instrumentos_ativos") or 0

        kpi_cards = [
            {"label": "Total Instrumentos", "value": int(total_instrumentos)},
            {"label": "Total Valor Global", "value": format_currency(total_valor_global)},
            {"label": "Total Empenhado", "value": format_currency(total_empenhado)},
            {"label": "Total Liberado", "value": format_currency(total_liberado)},
            {"label": "Saldo em Conta", "value": format_currency(total_saldo_conta)},
            {"label": "Instrumentos Ativos", "value": int(instrumentos_ativos)},
        ]
        kpi_row(kpi_cards)
    else:
        st.info("Nenhum instrumento encontrado para este lead.")

    st.markdown("")

    # --- 4 TABS ---
    tab1, tab2, tab3, tab4 = st.tabs([
        "Instrumentos",
        "Emendas",
        "Propostas",
        "Ministerios & Programas",
    ])

    # === TAB 1: INSTRUMENTOS ===
    with tab1:
        instruments_df = get_lead_instruments(selected_cnpj)

        if instruments_df.empty:
            st.info("Nenhum instrumento encontrado para este CNPJ.")
        else:
            display_df = instruments_df.copy()

            monetary_cols = [
                "valor_global", "valor_emenda", "valor_empenhado", "valor_liberado",
                "saldo_conta", "valor_repasse", "valor_contrapartida",
                "valor_global_original", "rendimento_aplicacao", "ingresso_contrapartida"
            ]

            for col in monetary_cols:
                if col in display_df.columns:
                    display_df[col] = display_df[col].apply(format_currency)

            date_cols = ["data_inicio_vigencia", "data_fim_vigencia"]
            for col in date_cols:
                if col in display_df.columns:
                    display_df[col] = display_df[col].apply(
                        lambda x: x.strftime("%d/%m/%Y") if pd.notna(x) else "N/A"
                    )

            column_config = {
                "nr_instrumento": "Nr Instrumento",
                "modalidade": "Modalidade",
                "situacao": "Situacao",
                "instrumento_ativo": "Ativo",
                "tem_emenda": "Emenda",
                "parlamentar": "Parlamentar",
                "valor_global": "Valor Global",
                "valor_emenda": "Valor Emenda",
                "valor_empenhado": "Valor Empenhado",
                "valor_liberado": "Valor Liberado",
                "saldo_conta": "Saldo em Conta",
                "valor_repasse": "Valor Repasse",
                "valor_contrapartida": "Contrapartida",
                "valor_global_original": "Valor Original",
                "rendimento_aplicacao": "Rendimento",
                "ingresso_contrapartida": "Ingresso Contrapartida",
                "data_inicio_vigencia": "Data Inicio",
                "data_fim_vigencia": "Data Fim",
            }

            st.dataframe(
                display_df,
                column_config=column_config,
                use_container_width=True,
                hide_index=True,
            )
            st.caption(f"Total: {len(instruments_df)} instrumentos")

    # === TAB 2: EMENDAS ===
    with tab2:
        emendas_df = get_lead_emendas(selected_cnpj)

        if emendas_df.empty:
            st.info("Nenhuma emenda encontrada para este CNPJ.")
        else:
            display_df = emendas_df.copy()
            if "valor_emenda" in display_df.columns:
                display_df["valor_emenda"] = display_df["valor_emenda"].apply(format_currency)

            column_config = {
                "numero_emenda": "Numero",
                "parlamentar": "Parlamentar",
                "valor_emenda": "Valor",
                "tipo_emenda": "Tipo",
                "apoiador_nome": "Apoiador",
                "ministerio": "Ministerio",
            }

            st.dataframe(
                display_df,
                column_config=column_config,
                use_container_width=True,
                hide_index=True,
            )
            st.caption(f"Total: {len(emendas_df)} emendas")

    # === TAB 3: PROPOSTAS ===
    with tab3:
        propostas_df = get_lead_propostas(selected_cnpj)

        if propostas_df.empty:
            st.info("Nenhuma proposta encontrada para este CNPJ.")
        else:
            display_df = propostas_df.copy()

            for col in ["valor_global", "valor_repasse"]:
                if col in display_df.columns:
                    display_df[col] = display_df[col].apply(format_currency)

            if "data_publicacao" in display_df.columns:
                display_df["data_publicacao"] = display_df["data_publicacao"].apply(
                    lambda x: x.strftime("%d/%m/%Y") if pd.notna(x) else "N/A"
                )

            column_config = {
                "transfer_gov_id": "ID",
                "titulo": "Titulo",
                "situacao": "Situacao",
                "valor_global": "Valor Global",
                "valor_repasse": "Valor Repasse",
                "data_publicacao": "Data Publicacao",
                "programa_nome": "Programa",
            }

            st.dataframe(
                display_df,
                column_config=column_config,
                use_container_width=True,
                hide_index=True,
            )
            st.caption(f"Total: {len(propostas_df)} propostas")

    # === TAB 4: MINISTERIOS & PROGRAMAS ===
    with tab4:
        col_min, col_prog = st.columns(2)

        with col_min:
            st.markdown("#### Ministerios")
            ministerios_df = get_lead_ministerios(selected_cnpj)

            if ministerios_df.empty:
                st.info("Nenhum ministerio encontrado.")
            else:
                st.dataframe(
                    ministerios_df,
                    column_config={
                        "orgao": "Orgao/Ministerio",
                        "count": "Propostas",
                    },
                    use_container_width=True,
                    hide_index=True,
                )

        with col_prog:
            st.markdown("#### Programas")
            programas_df = get_lead_programas(selected_cnpj)

            if programas_df.empty:
                st.info("Nenhum programa encontrado.")
            else:
                st.dataframe(
                    programas_df,
                    column_config={
                        "programa_nome": "Programa",
                        "programa_id": "ID",
                        "count": "Propostas",
                    },
                    use_container_width=True,
                    hide_index=True,
                )
