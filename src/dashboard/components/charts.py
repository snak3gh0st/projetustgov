"""Plotly chart components with Sigma brand theming.

This module provides reusable chart wrappers that apply consistent Sigma styling:
- Dark theme with transparent backgrounds
- Neon blue accent color (#00D4FF)
- Space Grotesk and Inter fonts
- Portuguese localization for all labels and tooltips
- Minimal design aligned with glassmorphic components
"""

import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# Sigma brand colors
SIGMA_COLORS = {
    "background": "rgba(0,0,0,0)",  # Transparent
    "text": "#E8F4FD",
    "grid": "rgba(232,244,253,0.1)",
    "accent": "#00D4FF",  # Neon blue
    "success": "#10B981",
    "warning": "#F59E0B",
    "error": "#EF4444",
}

# Portuguese month names for time series charts
MESES_PT = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Marco",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
}

MESES_PT_ABREV = {
    1: "Jan",
    2: "Fev",
    3: "Mar",
    4: "Abr",
    5: "Mai",
    6: "Jun",
    7: "Jul",
    8: "Ago",
    9: "Set",
    10: "Out",
    11: "Nov",
    12: "Dez",
}


def apply_sigma_theme(fig: go.Figure, title: str | None = None) -> go.Figure:
    """Apply Sigma brand theme to a Plotly figure.

    Sets dark theme with transparent backgrounds, neon blue accents,
    Space Grotesk/Inter fonts, and subtle grid lines.

    Args:
        fig: Plotly figure to style
        title: Optional chart title

    Returns:
        Styled figure with Sigma theme applied
    """
    fig.update_layout(
        plot_bgcolor=SIGMA_COLORS["background"],
        paper_bgcolor=SIGMA_COLORS["background"],
        font=dict(
            family="Inter, sans-serif",
            size=14,
            color=SIGMA_COLORS["text"],
        ),
        title=dict(
            text=title,
            font=dict(
                family="Space Grotesk, sans-serif",
                size=20,
                color=SIGMA_COLORS["text"],
            ),
        ) if title else None,
        xaxis=dict(
            gridcolor=SIGMA_COLORS["grid"],
            color=SIGMA_COLORS["text"],
        ),
        yaxis=dict(
            gridcolor=SIGMA_COLORS["grid"],
            color=SIGMA_COLORS["text"],
        ),
        legend=dict(
            bgcolor="rgba(10,22,40,0.8)",
            bordercolor=SIGMA_COLORS["accent"],
            borderwidth=1,
            font=dict(color=SIGMA_COLORS["text"]),
        ),
        hoverlabel=dict(
            bgcolor="rgba(10,22,40,0.95)",
            bordercolor=SIGMA_COLORS["accent"],
            font=dict(family="Inter, sans-serif", color=SIGMA_COLORS["text"]),
        ),
        margin=dict(l=40, r=40, t=60, b=40),
    )
    return fig


def render_plotly_chart(fig: go.Figure, key: str | None = None) -> None:
    """Render a Plotly chart in Streamlit with standard config.

    Wraps st.plotly_chart() with consistent settings:
    - Full container width
    - Custom theme (not Streamlit default)
    - No modebar or logo (minimal design)

    Args:
        fig: Plotly figure to render
        key: Optional session state key for component identity
    """
    st.plotly_chart(
        fig,
        use_container_width=True,
        theme=None,  # Use our custom Sigma theme, not Streamlit default
        config={
            "displayModeBar": False,
            "displaylogo": False,
            "responsive": True,
        },
        key=key,
    )


@st.cache_data
def _load_geojson() -> dict:
    """Load Brazilian estados GeoJSON.

    Cached to avoid re-reading on every render.

    Returns:
        GeoJSON FeatureCollection with Brazilian state boundaries
    """
    geojson_path = Path(__file__).parent.parent / "assets" / "geo" / "br_states.json"
    with open(geojson_path, "r", encoding="utf-8") as f:
        return json.load(f)


def create_brasil_choropleth(
    df: pd.DataFrame,
    color_column: str,
    title: str,
    hover_label: str = "Total",
) -> go.Figure:
    """Create a Brazil choropleth map colored by a metric.

    Renders a real Brazil map with estados colored by the specified column.
    Uses Sigma neon blue gradient and Portuguese labels.

    Args:
        df: DataFrame with 'estado' column (UF codes: SP, RJ, etc.)
        color_column: Column name to use for coloring estados
        title: Chart title
        hover_label: Label for hover tooltip (default: "Total")

    Returns:
        Styled Plotly choropleth figure
    """
    geojson = _load_geojson()

    fig = px.choropleth(
        df,
        geojson=geojson,
        locations="estado",
        featureidkey="properties.SIGLA",
        color=color_column,
        hover_name="estado",
        hover_data={color_column: ":,", "estado": False},
    )

    # Configure map projection and bounds
    fig.update_geos(
        fitbounds="locations",
        visible=False,  # Hide default map features
    )

    # Apply Sigma theme
    fig = apply_sigma_theme(fig, title)

    # Override colorscale to neon blue gradient
    fig.update_traces(
        colorscale=[
            [0, "rgba(0,212,255,0.1)"],
            [0.5, "rgba(0,212,255,0.5)"],
            [1, "#00D4FF"],
        ],
        marker_line_color="rgba(232,244,253,0.2)",
        marker_line_width=0.5,
        hovertemplate=f"<b>%{{hovertext}}</b><br>{hover_label}: %{{z:,}}<extra></extra>",
    )

    return fig


def create_value_distribution(
    df: pd.DataFrame,
    title: str = "Distribuicao por Faixa de Valor",
) -> go.Figure:
    """Create a horizontal bar chart of value distribution.

    Shows proponent counts by value tier (based on proposal count).
    Horizontal orientation for better readability of tier labels.

    Args:
        df: DataFrame with columns 'faixa' (tier label) and 'quantidade' (count)
        title: Chart title

    Returns:
        Styled Plotly bar chart figure
    """
    fig = px.bar(
        df,
        x="quantidade",
        y="faixa",
        orientation="h",
        labels={
            "quantidade": "Quantidade de Proponentes",
            "faixa": "Faixa de Valor",
        },
    )

    # Apply Sigma theme
    fig = apply_sigma_theme(fig, title)

    # Set bar color to Sigma accent
    fig.update_traces(
        marker_color=SIGMA_COLORS["accent"],
        hovertemplate="<b>%{y}</b><br>Proponentes: %{x:,}<extra></extra>",
    )

    return fig


def create_time_trend(
    df: pd.DataFrame,
    date_column: str,
    value_column: str,
    title: str,
    granularity: str = "monthly",
) -> go.Figure:
    """Create a time series line chart with Portuguese month labels.

    Shows trend over time with markers. Aggregates by month or year.

    Args:
        df: DataFrame with date and value columns
        date_column: Name of date column
        value_column: Name of value column to plot
        title: Chart title
        granularity: 'monthly' or 'yearly' (default: monthly)

    Returns:
        Styled Plotly line chart figure
    """
    # Aggregate by period
    df_plot = df.copy()
    df_plot[date_column] = pd.to_datetime(df_plot[date_column])

    if granularity == "monthly":
        df_plot["periodo"] = df_plot[date_column].dt.to_period("M")
        x_label = "Mes"
    else:  # yearly
        df_plot["periodo"] = df_plot[date_column].dt.year
        x_label = "Ano"

    df_agg = df_plot.groupby("periodo")[value_column].sum().reset_index()
    df_agg["periodo_str"] = df_agg["periodo"].astype(str)

    fig = px.line(
        df_agg,
        x="periodo_str",
        y=value_column,
        markers=True,
        labels={
            "periodo_str": x_label,
            value_column: "Total",
        },
    )

    # Apply Sigma theme
    fig = apply_sigma_theme(fig, title)

    # Set line color and markers
    fig.update_traces(
        line_color=SIGMA_COLORS["accent"],
        marker=dict(size=8, color=SIGMA_COLORS["accent"]),
        hovertemplate="<b>%{x}</b><br>Total: %{y:,}<extra></extra>",
    )

    # Portuguese month names on x-axis if monthly
    if granularity == "monthly" and not df_agg.empty:
        # Extract month numbers for label mapping
        df_agg["mes_num"] = df_agg["periodo"].dt.month
        df_agg["ano"] = df_agg["periodo"].dt.year

        # Create abbreviated labels
        ticktext = [
            f"{MESES_PT_ABREV[row['mes_num']]} {row['ano']}"
            for _, row in df_agg.iterrows()
        ]

        fig.update_xaxes(
            ticktext=ticktext,
            tickvals=df_agg["periodo_str"].tolist(),
        )

    return fig


def create_sparkline(values: list[float], color: str = "#00D4FF") -> go.Figure:
    """Create a minimal sparkline chart for KPI cards.

    No axes, no legend, just a simple line with area fill.
    Height fixed at 40px for compact display.

    Args:
        values: List of numeric values to plot
        color: Line color (default: Sigma neon blue)

    Returns:
        Minimal Plotly figure (not rendered - caller handles rendering)
    """
    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            y=values,
            mode="lines",
            line=dict(color=color, width=2),
            fill="tozeroy",
            fillcolor=color.replace(")", ",0.2)").replace("#", "rgba(")
            if "#" in color
            else color.replace(")", ",0.2)"),
            hoverinfo="skip",
        )
    )

    fig.update_layout(
        showlegend=False,
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=0, r=0, t=0, b=0),
        height=40,
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
    )

    return fig
