"""Lista de Leads page - browse e filtragem completa de leads.

Layout:
- Search bar no topo (CNPJ/Nome)
- Sidebar: UF, Emendas, Faixa valor, Sem contato, Natureza juridica
- Tabela: CNPJ, Nome, UF, Tier, Instrumentos, Valor Emendas, Contato
- Footer: contagem + export CSV
"""

import streamlit as st

from src.dashboard.queries.qualificacao import (
    get_estados_disponiveis,
    get_natureza_juridica_options,
    get_qualified_leads,
)
from src.dashboard.utils.tiers import TIER_COLORS, calculate_value_tier


def render_home() -> None:
    """Render the lead list page with rich filters."""
    st.title("Lista de Leads")
    st.markdown("Browse e filtragem de leads qualificados TransfereGov")

    # ===== SEARCH BAR (TOP) =====
    search_query = st.text_input(
        "Buscar por CNPJ ou Nome",
        placeholder="Digite CNPJ ou nome do proponente...",
        key="lead_search",
    )

    # ===== SIDEBAR FILTERS =====
    with st.sidebar:
        st.markdown("### Filtros")

        # UF selectbox
        uf_options = get_estados_disponiveis()
        selected_uf = st.selectbox(
            "Estado (UF)",
            options=["Todos"] + uf_options,
            index=0,
        )
        uf_filter = None if selected_uf == "Todos" else selected_uf

        # Sem contato filter
        sem_contato = st.checkbox("Somente leads SEM contato", value=False)

        # Com/Sem Emenda radio
        emenda_filter_option = st.radio(
            "Emendas",
            options=["Todos", "Com Emenda", "Sem Emenda"],
            index=0,
        )

        # Faixa de valor slider
        st.markdown("**Faixa de Valor Emendas (R$)**")
        valor_range = st.slider(
            "Valor",
            min_value=0,
            max_value=10_000_000,
            value=(0, 10_000_000),
            step=100_000,
            format="R$ %d",
            label_visibility="collapsed",
        )
        valor_min = valor_range[0] if valor_range[0] > 0 else None
        valor_max = valor_range[1] if valor_range[1] < 10_000_000 else None

        # Natureza juridica selectbox
        nj_options = get_natureza_juridica_options()
        selected_nj = st.selectbox(
            "Natureza Juridica",
            options=["Todas"] + nj_options,
            index=0,
        )
        nj_filter = None if selected_nj == "Todas" else selected_nj

    # ===== BUILD FILTERS DICT =====
    filters = {}

    if uf_filter:
        filters["estado"] = uf_filter
    if search_query and search_query.strip():
        filters["search"] = search_query.strip()
    if sem_contato:
        filters["sem_contato"] = True
    if nj_filter:
        filters["natureza_juridica"] = nj_filter

    if emenda_filter_option == "Com Emenda":
        filters["min_emendas"] = 1
    elif emenda_filter_option == "Sem Emenda":
        filters["max_propostas"] = None  # Won't add filter; handle emenda=0 below

    # Handle valor range via post-filter (qualificacao query doesn't have valor range)
    # We'll filter the DataFrame after fetching

    # ===== FETCH DATA =====
    leads_df = get_qualified_leads(limit=500, filters=filters if filters else None)

    # Post-filter: emenda = 0
    if emenda_filter_option == "Sem Emenda" and not leads_df.empty:
        leads_df = leads_df[leads_df["total_emendas"] == 0]
    elif emenda_filter_option == "Com Emenda" and not leads_df.empty:
        leads_df = leads_df[leads_df["total_emendas"] > 0]

    # Post-filter: valor range
    if not leads_df.empty:
        if valor_min is not None:
            leads_df = leads_df[leads_df["valor_total_emendas"].fillna(0) >= valor_min]
        if valor_max is not None:
            leads_df = leads_df[leads_df["valor_total_emendas"].fillna(0) <= valor_max]

    # ===== MAIN TABLE =====
    if leads_df.empty:
        st.info("Nenhum lead encontrado com os filtros aplicados.")
    else:
        # Add tier column
        leads_df = leads_df.copy()
        leads_df["tier"] = leads_df.apply(
            lambda row: calculate_value_tier(
                total_propostas=row["total_propostas"],
                valor_emendas=row["valor_total_emendas"] or 0.0,
                total_convenios=row["total_convenios"],
            ),
            axis=1,
        )

        # Format display columns
        display_df = leads_df.copy()
        display_df["valor_fmt"] = display_df["valor_total_emendas"].apply(
            lambda x: f"R$ {x:,.0f}" if x is not None and x > 0 else "R$ 0"
        )
        display_df["tem_contato"] = display_df.apply(
            lambda row: "Sim"
            if (row.get("email") and str(row["email"]).strip())
            or (row.get("telefone") and str(row["telefone"]).strip())
            else "Nao",
            axis=1,
        )

        # Select display columns
        table_df = display_df[
            [
                "cnpj",
                "nome",
                "estado",
                "tier",
                "total_convenios",
                "valor_fmt",
                "tem_contato",
            ]
        ].copy()

        # Column configuration
        column_config = {
            "cnpj": "CNPJ",
            "nome": "Nome",
            "estado": "UF",
            "tier": "Tier",
            "total_convenios": "Instrumentos",
            "valor_fmt": "Valor Emendas",
            "tem_contato": "Contato",
        }

        # Display count
        st.caption(f"Mostrando {len(table_df)} leads")

        # Display dataframe with row selection
        event = st.dataframe(
            table_df,
            column_config=column_config,
            use_container_width=True,
            hide_index=True,
            on_select="rerun",
            selection_mode="single-row",
        )

        # Handle row selection -> navigate to Lead Profile
        if event.selection and event.selection.rows:
            selected_idx = event.selection.rows[0]
            selected_lead = leads_df.iloc[selected_idx]
            st.session_state.selected_lead_cnpj = selected_lead["cnpj"]
            st.session_state.selected_lead_name = selected_lead["nome"]
            st.switch_page(st.session_state._pages["Lead Profile"])

        # ===== FOOTER: COUNT + EXPORT =====
        col_count, col_export = st.columns([3, 1])

        with col_count:
            st.caption(f"Total: {len(leads_df)} leads encontrados")

        with col_export:
            csv_data = leads_df[
                ["cnpj", "nome", "estado", "tier", "total_convenios",
                 "valor_total_emendas", "email", "telefone"]
            ].to_csv(index=False)
            st.download_button(
                label="Exportar CSV",
                data=csv_data,
                file_name="leads_projetus.csv",
                mime="text/csv",
            )
