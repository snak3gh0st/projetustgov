"""Reusable filter widget components for dashboard interactivity."""

import pandas as pd
import streamlit as st


def render_time_range_selector() -> None:
    """Render preset time range selector buttons.

    Updates st.session_state.time_range_days with selected value.
    Default is 7 days per user decision.
    """
    # Initialize if not set
    if "time_range_days" not in st.session_state:
        st.session_state.time_range_days = 7

    # Render segmented control for time range selection
    options = ["7 dias", "14 dias", "30 dias"]
    values = [7, 14, 30]

    # Find current index
    try:
        current_index = values.index(st.session_state.time_range_days)
    except ValueError:
        current_index = 0  # Default to 7 days

    selected = st.segmented_control(
        label="Período",
        options=options,
        default=options[current_index],
        help="Selecione o período para visualização de dados recentes",
    )

    # Update session state based on selection
    if selected == "7 dias":
        st.session_state.time_range_days = 7
    elif selected == "14 dias":
        st.session_state.time_range_days = 14
    elif selected == "30 dias":
        st.session_state.time_range_days = 30


def render_entity_search(key: str) -> str:
    """Render a text input for entity search filtering.

    Args:
        key: Unique widget key to prevent conflicts between pages

    Returns:
        Search term entered by user
    """
    search_term = st.text_input(
        label="Buscar",
        placeholder="Digite para filtrar...",
        key=f"search_{key}",
        help="Busca em todos os campos visíveis",
    )
    return search_term


def render_column_filters(df: pd.DataFrame, columns: list, key_prefix: str) -> dict:
    """Render filter widgets for specified DataFrame columns.

    Args:
        df: DataFrame to extract unique values from
        columns: List of column names to create filters for
        key_prefix: Prefix for widget keys to ensure uniqueness

    Returns:
        Dictionary mapping column names to selected filter values
    """
    filters = {}

    if df.empty:
        return filters

    # Create columns for filter widgets
    cols = st.columns(len(columns))

    for idx, column in enumerate(columns):
        if column not in df.columns:
            continue

        with cols[idx]:
            # Get unique values (excluding None)
            unique_values = df[column].dropna().unique().tolist()

            if unique_values:
                # Sort values for better UX
                unique_values = sorted(unique_values)

                # Add "All" option
                unique_values.insert(0, "Todos")

                selected = st.selectbox(
                    label=column.replace("_", " ").title(),
                    options=unique_values,
                    key=f"{key_prefix}_{column}",
                )

                # Only add to filters if not "All"
                if selected != "Todos":
                    filters[column] = selected

    return filters
