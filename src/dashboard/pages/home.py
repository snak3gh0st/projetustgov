"""Home overview page with KPI metrics, recent data, and extraction history.

Layout per user decision:
- Top section: Metric cards (entity counts + data freshness)
- Middle section: Recent propostas table (default 7-day filter)
- Bottom section: Extraction history with pipeline run status
"""

import streamlit as st

from src.dashboard.components.export import render_csv_export
from src.dashboard.components.filters import render_time_range_selector
from src.dashboard.components.metrics import render_metric_cards
from src.dashboard.queries.entities import get_recent_propostas
from src.dashboard.queries.history import get_extraction_history
from src.dashboard.queries.metrics import get_data_freshness, get_entity_counts


def format_duration(seconds: float) -> str:
    """Format duration in seconds to human-readable string.

    Args:
        seconds: Duration in seconds

    Returns:
        Formatted string like "5s" or "2m 30s"
    """
    if seconds is None:
        return "N/A"

    if seconds < 60:
        return f"{seconds:.0f}s"
    else:
        minutes = int(seconds // 60)
        remaining_seconds = int(seconds % 60)
        return f"{minutes}m {remaining_seconds}s"


def render_home() -> None:
    """Render the home overview page."""
    st.title("PROJETUS - Transfer Gov Dashboard")
    st.markdown("Visão geral dos dados extraídos do Transfer Gov")

    # Initialize session state
    if "time_range_days" not in st.session_state:
        st.session_state.time_range_days = 7

    # ===== TOP SECTION: METRIC CARDS =====
    st.subheader("Métricas Gerais")

    # Fetch data
    counts = get_entity_counts()
    freshness = get_data_freshness()

    # Render metric cards
    render_metric_cards(counts, freshness)

    st.divider()

    # ===== MIDDLE SECTION: RECENT PROPOSTAS =====
    st.subheader("Propostas Recentes")

    # Time range selector
    render_time_range_selector()

    # Fetch recent propostas based on selected time range
    recent_propostas = get_recent_propostas(days=st.session_state.time_range_days)

    if recent_propostas.empty:
        st.info(
            f"Nenhuma proposta encontrada nos últimos {st.session_state.time_range_days} dias."
        )
    else:
        # Display count
        st.caption(f"Mostrando {len(recent_propostas)} propostas")

        # Select columns to display (excluding internal IDs and timestamps)
        display_columns = [
            "transfer_gov_id",
            "titulo",
            "valor_global",
            "situacao",
            "estado",
            "municipio",
            "proponente",
            "extraction_date",
        ]
        display_df = recent_propostas[
            [col for col in display_columns if col in recent_propostas.columns]
        ].copy()

        # Format monetary values
        if "valor_global" in display_df.columns:
            display_df["valor_global"] = display_df["valor_global"].apply(
                lambda x: f"R$ {x:,.2f}" if x is not None else "N/A"
            )

        # Format dates
        if "extraction_date" in display_df.columns:
            display_df["extraction_date"] = display_df["extraction_date"].apply(
                lambda x: x.strftime("%d/%m/%Y") if x is not None else "N/A"
            )

        # Rename columns for better display
        column_config = {
            "transfer_gov_id": "ID Transfer Gov",
            "titulo": "Título",
            "valor_global": "Valor Global",
            "situacao": "Situação",
            "estado": "UF",
            "municipio": "Município",
            "proponente": "Proponente",
            "extraction_date": "Data Extração",
        }

        # Display dataframe with built-in search/sort/filter
        st.dataframe(
            display_df,
            column_config=column_config,
            use_container_width=True,
            hide_index=True,
        )

        # CSV export
        st.markdown("---")
        render_csv_export(
            recent_propostas,
            f"propostas_recentes_{st.session_state.time_range_days}dias.csv",
        )

    st.divider()

    # ===== BOTTOM SECTION: EXTRACTION HISTORY =====
    st.subheader("Histórico de Extrações")

    # Fetch extraction history (respects same time range selector)
    history_df = get_extraction_history(days=st.session_state.time_range_days)

    if history_df.empty:
        st.warning("Nenhum histórico de extração disponível.")
    else:
        # Summary metrics
        st.markdown("#### Resumo do Período")

        total_runs = len(history_df)
        success_count = len(history_df[history_df["status"] == "success"])
        partial_count = len(history_df[history_df["status"] == "partial"])
        failed_count = len(history_df[history_df["status"] == "failed"])

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.metric(label="Total de Execuções", value=total_runs)

        with col2:
            st.metric(
                label="✅ Sucesso",
                value=success_count,
                delta=f"{(success_count/total_runs*100):.0f}%" if total_runs > 0 else "0%",
                delta_color="normal",
            )

        with col3:
            st.metric(
                label="⚠️ Parcial",
                value=partial_count,
                delta=f"{(partial_count/total_runs*100):.0f}%" if total_runs > 0 else "0%",
                delta_color="off",
            )

        with col4:
            st.metric(
                label="🔴 Falha",
                value=failed_count,
                delta=f"{(failed_count/total_runs*100):.0f}%" if total_runs > 0 else "0%",
                delta_color="inverse",
            )

        st.markdown("---")

        # History table
        st.markdown("#### Detalhes das Execuções")

        # Prepare display dataframe
        display_history = history_df.copy()

        # Format run_date
        display_history["run_date"] = display_history["run_date"].apply(
            lambda x: x.strftime("%d/%m/%Y %H:%M") if x is not None else "N/A"
        )

        # Format duration
        display_history["duration_formatted"] = display_history[
            "duration_seconds"
        ].apply(format_duration)

        # Add status emoji
        status_map = {"success": "✅ Sucesso", "partial": "⚠️ Parcial", "failed": "🔴 Falha"}
        display_history["status_display"] = display_history["status"].apply(
            lambda x: status_map.get(x, x)
        )

        # Select and reorder columns
        table_columns = [
            "run_date",
            "status_display",
            "total_records",
            "records_inserted",
            "records_updated",
            "duration_formatted",
        ]

        display_table = display_history[table_columns]

        # Column configuration
        column_config = {
            "run_date": "Data/Hora",
            "status_display": "Status",
            "total_records": "Total Registros",
            "records_inserted": "Inseridos",
            "records_updated": "Atualizados",
            "duration_formatted": "Duração",
        }

        # Display table
        st.dataframe(
            display_table,
            column_config=column_config,
            use_container_width=True,
            hide_index=True,
        )

        # Show error messages if any
        errors = history_df[history_df["error_message"].notna()]
        if not errors.empty:
            st.markdown("---")
            st.markdown("#### Mensagens de Erro")

            for idx, row in errors.iterrows():
                run_date = row["run_date"].strftime("%d/%m/%Y %H:%M")
                with st.expander(f"🔴 {run_date} - {row['status']}"):
                    st.code(row["error_message"], language=None)

        # CSV export for extraction history
        st.markdown("---")
        render_csv_export(
            history_df,
            f"historico_extracoes_{st.session_state.time_range_days}dias.csv",
        )
