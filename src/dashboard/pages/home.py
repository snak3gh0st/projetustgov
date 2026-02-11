"""Lead list page - shows CNPJ table ranked by opportunity with filters.

Layout:
- Title + description
- Sidebar filters (UF, Com/Sem Emenda, Faixa de Valor)
- Main area: Lead table (CNPJ, Nome, UF, Qtd Instrumentos, Valor Emendas, Tem Contato)
- Row selection navigates to Lead Profile
"""

import streamlit as st

from src.dashboard.queries.entities import get_lead_list, get_uf_options


def render_home() -> None:
    """Render the lead list page."""
    st.title("PROJETUS - Leads TransfereGov")
    st.markdown("Lista de leads qualificados com instrumentos ativos, ranqueados por oportunidade")

    # ===== SIDEBAR FILTERS =====
    with st.sidebar:
        st.markdown("### Filtros")

        # UF multiselect
        uf_options = get_uf_options()
        selected_uf = st.selectbox(
            "Estado (UF)",
            options=["Todos"] + uf_options,
            index=0,
        )
        uf_filter = None if selected_uf == "Todos" else selected_uf

        # Sem contato filter (leads novos para o vendedor)
        sem_contato = st.checkbox("Somente leads SEM contato", value=False)

        # Com/Sem Emenda radio
        emenda_filter_option = st.radio(
            "Emendas",
            options=["Todos", "Com Emenda", "Sem Emenda"],
            index=0,
        )
        if emenda_filter_option == "Com Emenda":
            com_emenda = True
        elif emenda_filter_option == "Sem Emenda":
            com_emenda = False
        else:
            com_emenda = None

        # Faixa de valor slider
        st.markdown("**Faixa de Valor Emendas (R$)**")
        valor_range = st.slider(
            "Valor",
            min_value=0,
            max_value=10000000,
            value=(0, 10000000),
            step=100000,
            format="R$ %d",
            label_visibility="collapsed",
        )
        valor_min = valor_range[0] if valor_range[0] > 0 else None
        valor_max = valor_range[1] if valor_range[1] < 10000000 else None

    # ===== MAIN AREA: LEAD TABLE =====
    leads_df = get_lead_list(
        uf_filter=uf_filter,
        com_emenda=com_emenda,
        valor_min=valor_min,
        valor_max=valor_max,
        sem_contato=sem_contato,
        limit=500,
    )

    if leads_df.empty:
        st.info("Nenhum lead encontrado com os filtros aplicados.")
    else:
        # Display count
        st.caption(f"Mostrando {len(leads_df)} leads")

        # Format monetary columns
        display_df = leads_df.copy()
        if "valor_total_emendas" in display_df.columns:
            display_df["valor_total_emendas_fmt"] = display_df["valor_total_emendas"].apply(
                lambda x: f"R$ {x:,.0f}" if x is not None and x > 0 else "R$ 0"
            )
        else:
            display_df["valor_total_emendas_fmt"] = "R$ 0"

        # Select display columns
        table_df = display_df[[
            "cnpj",
            "nome",
            "uf",
            "qtd_instrumentos_ativos",
            "valor_total_emendas_fmt",
            "tem_contato",
        ]].copy()

        # Column configuration
        column_config = {
            "cnpj": "CNPJ",
            "nome": "Nome",
            "uf": "UF",
            "qtd_instrumentos_ativos": "Qtd Instrumentos",
            "valor_total_emendas_fmt": "Valor Emendas",
            "tem_contato": "Contato",
        }

        # Display dataframe with row selection
        event = st.dataframe(
            table_df,
            column_config=column_config,
            use_container_width=True,
            hide_index=True,
            on_select="rerun",
            selection_mode="single-row",
        )

        # Handle row selection
        if event.selection and event.selection.rows:
            selected_idx = event.selection.rows[0]
            selected_lead = leads_df.iloc[selected_idx]
            st.session_state.selected_lead_cnpj = selected_lead["cnpj"]
            st.session_state.selected_lead_name = selected_lead["nome"]
            # Navigate to Lead Profile
            st.switch_page(st.session_state._pages["Lead Profile"])
