"""Lead Profile page - Instrument financial detail view for sales workflow.

This page provides:
- Header with contact info
- KPI summary of financial totals
- Instruments (convenios) table with full financial detail
"""

import pandas as pd
import streamlit as st

from src.dashboard.components.kpi import kpi_row
from src.dashboard.queries.lead_profile import (
    get_lead_instruments,
    get_lead_instrument_summary,
    get_lead_overview,
)


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
    """Render the lead profile page with instrument detail."""
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

    # --- HEADER SECTION ---
    col_header1, col_header2 = st.columns([3, 1])

    with col_header1:
        st.title(nome)

    with col_header2:
        # Back to Leads navigation
        if st.button("← Voltar para Leads"):
            st.switch_page(st.session_state._pages["Leads"])

    # Contact info row
    col1, col2, col3 = st.columns(3)

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

    # --- INSTRUMENTS TABLE ---
    st.markdown("### 📋 Instrumentos (Convenios)")

    instruments_df = get_lead_instruments(selected_cnpj)

    if instruments_df.empty:
        st.info("Nenhum instrumento encontrado para este CNPJ.")
    else:
        # Format monetary columns
        display_df = instruments_df.copy()

        monetary_cols = [
            "valor_global", "valor_emenda", "valor_empenhado", "valor_liberado",
            "saldo_conta", "valor_repasse", "valor_contrapartida",
            "valor_global_original", "rendimento_aplicacao", "ingresso_contrapartida"
        ]

        for col in monetary_cols:
            if col in display_df.columns:
                display_df[col] = display_df[col].apply(format_currency)

        # Format dates
        date_cols = ["data_inicio_vigencia", "data_fim_vigencia"]
        for col in date_cols:
            if col in display_df.columns:
                display_df[col] = display_df[col].apply(
                    lambda x: x.strftime("%d/%m/%Y") if pd.notna(x) else "N/A"
                )

        # Column configuration for nice headers
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

        # Display dataframe
        st.dataframe(
            display_df,
            column_config=column_config,
            use_container_width=True,
            hide_index=True,
        )

        st.caption(f"Total: {len(instruments_df)} instrumentos")
