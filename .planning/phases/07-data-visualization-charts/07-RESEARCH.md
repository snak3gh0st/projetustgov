# Phase 7: Data Visualization & Charts - Research

**Researched:** 2026-02-10
**Domain:** Plotly integration with Streamlit, Brazilian GeoJSON choropleth maps, Portuguese localization
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Geographic heatmap:**
- Real Brazil choropleth map (not bar chart or treemap) — user explicitly chose map visualization
- Needs GeoJSON for Brazilian estados — researcher should investigate source/library
- Color metric, geo level (estado vs regiao), and click behavior at Claude's discretion

**Chart language:**
- All chart labels, axis labels, tooltips, and month names in Portuguese (PT-BR)
- "Janeiro", "Fevereiro", etc. — not English month names
- Axis labels and legend text in Portuguese

### Claude's Discretion

- **Chart placement & page layout:** Where charts live (Home, Qualificacao, or both), chart density per page, full-width vs side-by-side arrangement
- **Chart containers:** Glassmorphic cards vs minimal dark containers (respect Phase 6 guideline of max 3-5 backdrop-filter elements per page)
- **Chart headers:** Title only vs title+description per chart
- **Geographic heatmap color metric:** Proponent count, value tier, or emendas value — pick what's most useful for sales reps
- **Geographic heatmap click behavior:** Cross-filter vs tooltip-only
- **Time trend granularity:** Monthly, yearly, or toggle — pick based on data volume
- **Value distribution chart type:** Bar, donut, or other — pick most readable format
- **KPI sparklines:** Add or skip based on data availability and visual balance
- **Tooltip richness:** Basic vs detailed per chart type
- **Cross-filtering between charts:** Independent vs connected — pick based on Streamlit/Plotly feasibility
- **Load animations:** Subtle Plotly animations vs instant render
- **Plotly toolbar visibility:** Show or hide based on sales rep workflow needs

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

## Summary

Phase 7 integrates interactive Plotly charts into the existing Sigma-branded dark theme dashboard established in Phase 6. Research confirms Plotly works seamlessly with Streamlit through `st.plotly_chart()`, supports dark themes via templates and layout customization, and offers extensive configuration for Brazilian Portuguese localization. Brazilian state GeoJSON data is readily available from multiple sources (geodata-br-states, IBGE-derived datasets). The primary technical challenges are Portuguese month name localization (requires manual override via update_xaxes), maintaining visual consistency with Phase 6's glassmorphic design, and managing cross-filtering with Streamlit's session state.

**Key findings:**
- Streamlit 1.54.0 (current project version) fully supports Plotly integration with native dark theme via `theme="streamlit"` parameter
- Plotly's `plotly_dark` template provides excellent dark theme foundation, customizable via `update_layout()` for Sigma brand colors
- Brazilian estados GeoJSON available from geodata-br-states (GitHub), Kaggle (brazil-geojson), and IBGE-derived sources
- Portuguese localization requires manual configuration: month names via custom `ticktext`, axis labels via `xaxis.title.text`, tooltips via `hovertemplate`
- Plotly Python lacks native pt-BR locale support (JavaScript-only feature); workaround is manual translation of all text elements
- Cross-filtering between charts achievable via `on_select="rerun"` and `st.session_state` (Streamlit 1.16+)
- Chart transparency achieved via `plot_bgcolor='rgba(0,0,0,0)'` and `paper_bgcolor='rgba(0,0,0,0)'` for glassmorphic integration

**Primary recommendation:** Create a reusable `plotly_sigma_theme()` wrapper function that applies Sigma brand colors (neon blue #00D4FF, transparent backgrounds) and Portuguese language defaults to all chart types. Use `plotly.express` for rapid chart creation (choropleth, histogram, line charts). Embed charts in minimal dark containers (not glassmorphic cards) to respect Phase 6's 3-5 backdrop-filter limit. Hide Plotly modebar for cleaner sales rep experience. Store GeoJSON locally in `src/dashboard/assets/geo/` for fast loading.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| plotly | 6.x | Interactive charts | Industry standard for web-based interactive visualizations, excellent Streamlit integration |
| Streamlit | 1.54.0 | Chart rendering via st.plotly_chart | Already in project, native Plotly support since 1.16 |
| plotly.express | Built-in | High-level chart API | Rapid chart creation with minimal code, part of plotly package |
| plotly.graph_objects | Built-in | Low-level chart customization | For fine-grained control over layout, axes, and theming |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| geodata-br-states | Latest (GitHub) | Brazilian estados GeoJSON | For choropleth map boundary data |
| pandas | 2.3.3 | Data aggregation for charts | Already in project, required for time series grouping and value distributions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plotly | Altair | Less mature interactive features, smaller community, no built-in choropleth support |
| Plotly | Matplotlib | Not interactive, no native Streamlit theming, requires manual dark theme styling |
| geodata-br-states | IBGE API direct | Slower (API calls), requires internet, less reliable in production |
| Manual pt-BR translations | plotly.js-locales (JS only) | Not available in Python, would require custom React component |

**Installation:**
```bash
# Plotly not yet in requirements.txt - needs to be added
pip install plotly==6.0.0
# pandas, streamlit already installed
```

**GeoJSON Acquisition:**
```bash
# Option 1: Download from geodata-br-states (recommended - lightweight, actively maintained)
# https://github.com/giuliano-macedo/geodata-br-states/blob/master/geojson/br_states.json

# Option 2: Kaggle brazil-geojson dataset (backup)
# https://www.kaggle.com/datasets/thiagobodruk/brazil-geojson

# Store in: src/dashboard/assets/geo/br_states.json
```

## Architecture Patterns

### Recommended Project Structure
```
src/dashboard/
├── assets/
│   ├── geo/
│   │   └── br_states.json          # Brazilian estados GeoJSON (27 states)
│   └── styles/
│       └── components.css          # Existing Phase 6 styles
├── components/
│   ├── charts.py                   # NEW: Plotly chart wrappers with Sigma theming
│   ├── kpi.py                      # Existing: KPI cards - add sparkline support
│   └── cards.py                    # Existing: Glassmorphic cards
├── queries/
│   ├── chart_data.py               # NEW: Chart-specific data aggregations
│   ├── proponentes.py              # Existing: has estado field for choropleth
│   └── history.py                  # Existing: for time trend charts
├── pages/
│   ├── home.py                     # Integrate overview charts here
│   └── qualificacao.py             # Integrate qualification charts here
└── streamlit_app.py                # Entry point - no changes needed
```

### Pattern 1: Reusable Plotly Theme Wrapper
**What:** Centralized function that applies Sigma brand theming to any Plotly figure
**When to use:** Every chart in the dashboard - ensures visual consistency
**Example:**
```python
# src/dashboard/components/charts.py
import plotly.graph_objects as go
from typing import Optional

def apply_sigma_theme(fig: go.Figure, title: Optional[str] = None) -> go.Figure:
    """Apply Sigma brand dark theme and Portuguese defaults to Plotly figure.

    Args:
        fig: Plotly figure to style
        title: Optional chart title in Portuguese

    Returns:
        Styled figure ready for st.plotly_chart()
    """
    # Sigma brand colors from Phase 6
    SIGMA_COLORS = {
        'background': 'rgba(0,0,0,0)',  # Transparent for dark theme
        'text': '#E8F4FD',  # sigma-text-primary
        'grid': 'rgba(232, 244, 253, 0.1)',  # subtle grid
        'accent': '#00D4FF',  # sigma-accent-neon
        'success': '#10B981',
        'warning': '#F59E0B',
        'error': '#EF4444',
    }

    fig.update_layout(
        # Transparent backgrounds (inherit dark theme from Streamlit)
        plot_bgcolor=SIGMA_COLORS['background'],
        paper_bgcolor=SIGMA_COLORS['background'],

        # Typography (matches Phase 6 Space Grotesk + Inter)
        font=dict(
            family='Inter, sans-serif',
            size=14,
            color=SIGMA_COLORS['text'],
        ),
        title=dict(
            text=title,
            font=dict(
                family='Space Grotesk, sans-serif',
                size=20,
                color=SIGMA_COLORS['text'],
            ),
        ),

        # Axes styling
        xaxis=dict(
            gridcolor=SIGMA_COLORS['grid'],
            zerolinecolor=SIGMA_COLORS['grid'],
            color=SIGMA_COLORS['text'],
        ),
        yaxis=dict(
            gridcolor=SIGMA_COLORS['grid'],
            zerolinecolor=SIGMA_COLORS['grid'],
            color=SIGMA_COLORS['text'],
        ),

        # Legend styling
        legend=dict(
            bgcolor='rgba(10, 22, 40, 0.8)',  # sigma-bg-secondary with opacity
            bordercolor=SIGMA_COLORS['accent'],
            borderwidth=1,
            font=dict(color=SIGMA_COLORS['text']),
        ),

        # Margins for compact layout
        margin=dict(l=40, r=40, t=60, b=40),

        # Hover styling
        hoverlabel=dict(
            bgcolor='rgba(10, 22, 40, 0.95)',
            font_size=12,
            font_family='Inter, sans-serif',
            font_color=SIGMA_COLORS['text'],
            bordercolor=SIGMA_COLORS['accent'],
        ),
    )

    return fig
```

### Pattern 2: Brazilian Choropleth Map with Estado Aggregation
**What:** Geographic heatmap showing proponent distribution across Brazilian estados
**When to use:** Home or Qualificacao page for geographic insights
**Example:**
```python
# src/dashboard/components/charts.py
import plotly.express as px
import pandas as pd
from pathlib import Path
import json

def create_brasil_choropleth(df: pd.DataFrame, color_column: str, title: str) -> go.Figure:
    """Create choropleth map of Brazil by estado.

    Args:
        df: DataFrame with 'estado' column (2-letter UF codes) and metric column
        color_column: Column name to use for color scale (e.g., 'total_proponentes')
        title: Chart title in Portuguese

    Returns:
        Styled Plotly choropleth figure
    """
    # Load GeoJSON (cached via Streamlit)
    geo_path = Path(__file__).parent.parent / "assets" / "geo" / "br_states.json"
    with open(geo_path, 'r', encoding='utf-8') as f:
        geojson = json.load(f)

    # Aggregate data by estado
    estado_data = df.groupby('estado')[color_column].sum().reset_index()

    # Create choropleth
    fig = px.choropleth(
        estado_data,
        geojson=geojson,
        locations='estado',  # UF codes (SP, RJ, MG, etc.)
        featureidkey='properties.sigla',  # GeoJSON property matching UF codes
        color=color_column,
        color_continuous_scale='Blues',  # Will be overridden by Sigma theme
        labels={color_column: 'Total'},  # Portuguese label
        hover_name='estado',
        hover_data={color_column: ':,'},  # Thousand separator
    )

    # Focus on Brazil
    fig.update_geos(
        fitbounds='locations',
        visible=False,  # Hide default geo features
    )

    # Apply Sigma theme
    fig = apply_sigma_theme(fig, title)

    # Override color scale with Sigma accent colors
    fig.update_traces(
        colorscale=[
            [0, 'rgba(0, 212, 255, 0.1)'],  # Light neon blue
            [0.5, 'rgba(0, 212, 255, 0.5)'],
            [1, '#00D4FF'],  # Full sigma-accent-neon
        ],
        marker_line_color='rgba(232, 244, 253, 0.2)',  # State borders
        marker_line_width=0.5,
    )

    # Portuguese tooltip
    fig.update_traces(
        hovertemplate='<b>%{hovertext}</b><br>Total: %{z:,}<extra></extra>',
    )

    return fig
```

### Pattern 3: Portuguese Month Names for Time Series
**What:** Manual override of month names to Portuguese for time-based charts
**When to use:** Any chart with date/time x-axis (trend charts, sparklines)
**Example:**
```python
# src/dashboard/components/charts.py
import plotly.express as px
from datetime import datetime

# Portuguese month names mapping
MESES_PT = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

def create_time_trend(df: pd.DataFrame, date_column: str, value_column: str,
                     granularity: str = 'monthly') -> go.Figure:
    """Create time series trend chart with Portuguese month names.

    Args:
        df: DataFrame with date and value columns
        date_column: Column name containing dates
        value_column: Column name for y-axis metric
        granularity: 'monthly' or 'yearly'

    Returns:
        Styled line chart with Portuguese labels
    """
    # Ensure date column is datetime
    df[date_column] = pd.to_datetime(df[date_column])

    # Aggregate by granularity
    if granularity == 'monthly':
        df['periodo'] = df[date_column].dt.to_period('M')
        aggregated = df.groupby('periodo')[value_column].sum().reset_index()
        aggregated['periodo'] = aggregated['periodo'].dt.to_timestamp()
    else:  # yearly
        df['periodo'] = df[date_column].dt.year
        aggregated = df.groupby('periodo')[value_column].sum().reset_index()

    # Create line chart
    fig = px.line(
        aggregated,
        x='periodo',
        y=value_column,
        markers=True,
    )

    # Apply Sigma theme
    fig = apply_sigma_theme(fig, title='Tendência ao Longo do Tempo')

    # Override line color to Sigma accent
    fig.update_traces(
        line_color='#00D4FF',
        marker=dict(size=8, color='#00D4FF'),
    )

    # Portuguese month names on x-axis
    if granularity == 'monthly':
        fig.update_xaxes(
            title_text='Mês',
            tickformat='%b %Y',  # Will show abbreviated month + year
            # Override tick labels with Portuguese
            ticktext=[f"{MESES_PT[d.month]} {d.year}" for d in aggregated['periodo']],
            tickvals=aggregated['periodo'],
        )
    else:
        fig.update_xaxes(title_text='Ano')

    # Portuguese y-axis
    fig.update_yaxes(title_text='Total')

    # Portuguese tooltip
    fig.update_traces(
        hovertemplate='<b>%{x}</b><br>Total: %{y:,}<extra></extra>',
    )

    return fig
```

### Pattern 4: Streamlit Plotly Chart Rendering with Config
**What:** Standard approach for rendering Plotly charts in Streamlit with Sigma brand config
**When to use:** Every chart display in pages
**Example:**
```python
# src/dashboard/pages/home.py
import streamlit as st
from src.dashboard.components.charts import create_brasil_choropleth, apply_sigma_theme
from src.dashboard.queries.proponentes import get_proponentes

# Fetch data
df_proponentes = get_proponentes(limit=10000)

# Create chart
fig = create_brasil_choropleth(
    df_proponentes,
    color_column='total_propostas',
    title='Proponentes por Estado',
)

# Render with Streamlit-specific config
st.plotly_chart(
    fig,
    use_container_width=True,  # Responsive to page width
    theme=None,  # Use our custom Sigma theme (not Streamlit's default)
    config={
        'displayModeBar': False,  # Hide toolbar for cleaner UI
        'displaylogo': False,
        'responsive': True,
    },
    key='choropleth_estados',  # For session state if using on_select
)
```

### Pattern 5: KPI Sparklines (Mini Trend Charts)
**What:** Small line charts embedded in KPI cards showing recent trend (7-30 days)
**When to use:** Optional enhancement for Home page KPI cards
**Example:**
```python
# src/dashboard/components/kpi.py (extend existing)
import plotly.graph_objects as go

def create_sparkline(values: list[float], color: str = '#00D4FF') -> go.Figure:
    """Create minimal sparkline chart for KPI card.

    Args:
        values: List of metric values (time series, most recent last)
        color: Line color (default: Sigma accent neon)

    Returns:
        Minimal Plotly figure (no axes, margins, or labels)
    """
    fig = go.Figure()

    fig.add_trace(go.Scatter(
        y=values,
        mode='lines',
        line=dict(color=color, width=2),
        fill='tozeroy',
        fillcolor=f'rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.1)',
        hoverinfo='skip',  # No hover for sparklines
    ))

    # Remove all chrome (axes, grid, margins)
    fig.update_layout(
        showlegend=False,
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        margin=dict(l=0, r=0, t=0, b=0),
        height=40,  # Tiny height for KPI card
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
    )

    return fig

# Usage in KPI card with st.html() for compact layout
def kpi_card_with_sparkline(label: str, value: int, sparkline_data: list[float]):
    """KPI card with embedded sparkline."""
    fig = create_sparkline(sparkline_data)

    # Render sparkline as inline HTML
    sparkline_html = fig.to_html(include_plotlyjs='cdn', config={'displayModeBar': False})

    # Combine with existing KPI card HTML
    # (Integrate with Phase 6 premium_kpi_card component)
```

### Anti-Patterns to Avoid

- **Don't use multiple backdrop-filter elements for chart containers:** Phase 6 guideline limits to 3-5 per page. Use minimal dark divs instead.
- **Don't rely on Plotly's default English labels:** Always override with Portuguese via `update_xaxes()`, `update_yaxes()`, `hovertemplate`.
- **Don't load GeoJSON on every chart render:** Cache with `@st.cache_data` decorator or load once at module level.
- **Don't use `theme="streamlit"` with custom Sigma theme:** Set `theme=None` and apply custom styling via `update_layout()`.
- **Don't show Plotly modebar for sales reps:** Set `displayModeBar: False` in config - adds clutter without value for business users.
- **Don't create separate chart functions per chart type:** Use single `apply_sigma_theme()` wrapper for all chart types.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive choropleth maps | Custom D3.js/Leaflet integration | plotly.express.choropleth | Built-in GeoJSON support, hover tooltips, zoom/pan, color scales, Streamlit integration |
| Chart theming system | Manual layout.update() in every chart | Reusable theme wrapper function | DRY principle, consistent branding, single source of truth for colors/fonts |
| Portuguese date formatting | String manipulation of timestamps | Custom month name mapping + ticktext | Plotly lacks native pt-BR locale in Python, manual override is standard workaround |
| Cross-filtering between charts | Custom JavaScript callbacks | Streamlit on_select + session_state | Native Streamlit feature (1.16+), no custom components needed |
| Data aggregation for charts | SQL queries per chart | Pandas groupby in Python | More flexible, easier to test, leverages cached queries from existing query modules |
| Responsive chart sizing | Fixed width/height pixels | use_container_width=True | Adapts to browser width, mobile-friendly, leverages Streamlit's responsive grid |

**Key insight:** Plotly + Streamlit ecosystem is mature enough to handle all Phase 7 requirements without custom components. The main "hand-rolling" risk is recreating theming/localization logic in multiple places instead of centralizing in a wrapper function.

## Common Pitfalls

### Pitfall 1: Portuguese Locale Not Working in Plotly Python
**What goes wrong:** Setting Python locale or expecting `locale='pt-BR'` config to translate month names and number formats automatically.
**Why it happens:** Plotly.js supports locales (including pt-BR), but Plotly Python does not expose this feature. The Python API requires manual translation.
**How to avoid:** Create a `MESES_PT` dictionary mapping month numbers to Portuguese names. Use `update_xaxes(ticktext=...)` to override tick labels. Use `hovertemplate` with Portuguese text for tooltips.
**Warning signs:** Chart displays "January" instead of "Janeiro" despite locale configuration attempts.

### Pitfall 2: GeoJSON Feature ID Mismatch
**What goes wrong:** Choropleth map renders blank (no colored states) despite valid data and GeoJSON.
**Why it happens:** `locations` parameter in DataFrame doesn't match `featureidkey` in GeoJSON properties. Brazilian GeoJSON files use different property names (`sigla`, `UF`, `GEOCODIGO`, etc.).
**How to avoid:** Inspect GeoJSON file first to identify the property containing 2-letter UF codes. Common keys: `properties.sigla` (geodata-br-states), `properties.UF` (IBGE datasets). Set `featureidkey='properties.sigla'` to match.
**Warning signs:** Plotly shows no error but choropleth is all one color or blank. Browser console may show "locations not found in geojson" warnings.

### Pitfall 3: Transparent Background Not Showing Streamlit Dark Theme
**What goes wrong:** Chart has white background despite setting `plot_bgcolor='rgba(0,0,0,0)'`.
**Why it happens:** Both `plot_bgcolor` AND `paper_bgcolor` must be transparent. Also, using `theme="streamlit"` overrides custom background settings.
**How to avoid:** Set both `plot_bgcolor` and `paper_bgcolor` to `'rgba(0,0,0,0)'`. Use `theme=None` in `st.plotly_chart()` to prevent Streamlit theme override.
**Warning signs:** Chart looks good in isolation but has white box when embedded in dark-themed page.

### Pitfall 4: Cross-Filtering Causes Infinite Rerun Loop
**What goes wrong:** Clicking a chart element triggers `on_select="rerun"`, which modifies session state, which triggers another rerun, creating a loop.
**Why it happens:** Chart selection callback updates session state, and chart re-renders with same data, but Streamlit detects state change and reruns again.
**How to avoid:** Check if `st.session_state.selection` has actually changed before triggering rerun logic. Use `key` parameter for stable identity. Wrap chart in conditional: `if selection != previous_selection: st.rerun()`.
**Warning signs:** Page continuously refreshes after clicking a chart element. Browser becomes unresponsive.

### Pitfall 5: Sparklines Overflow KPI Card Layout
**What goes wrong:** Sparkline chart breaks out of KPI card container or has excessive whitespace.
**Why it happens:** Plotly's default margins and axis padding are designed for full-size charts, not mini visualizations.
**How to avoid:** Set `margin=dict(l=0, r=0, t=0, b=0)` and `height=40` (or smaller) for sparklines. Hide axes with `xaxis=dict(visible=False)`. Use `fill='tozeroy'` for area effect without baseline.
**Warning signs:** KPI card height suddenly doubles when adding sparkline. Scrollbars appear in card.

### Pitfall 6: Chart Performance Degrades with Large Datasets
**What goes wrong:** Dashboard becomes slow when rendering choropleth or time series with 10,000+ points.
**Why it happens:** Plotly renders all data points in browser DOM. GeoJSON choropleth with detailed boundaries (municipios instead of estados) can have 5,000+ polygons.
**How to avoid:** Aggregate data before charting (monthly instead of daily, estados instead of municipios). Use `limit` in query functions. For sparklines, only show last 30 data points. Cache aggregated DataFrames with `@st.cache_data`.
**Warning signs:** Chart takes >3 seconds to render. Browser tab shows "Page Unresponsive" warning.

## Code Examples

Verified patterns from official sources:

### Streamlit Plotly Chart with Custom Config
```python
# Source: https://docs.streamlit.io/develop/api-reference/charts/st.plotly_chart
import streamlit as st
import plotly.graph_objects as go

fig = go.Figure(data=[go.Scatter(x=[1, 2, 3], y=[4, 5, 6])])

st.plotly_chart(
    fig,
    use_container_width=True,
    theme=None,  # Disable Streamlit's auto-theming
    config={
        'displayModeBar': False,
        'displaylogo': False,
        'responsive': True,
    },
)
```

### Plotly Dark Theme with Transparent Background
```python
# Source: https://community.plotly.com/t/transparent-background/69213
import plotly.graph_objects as go

fig = go.Figure(data=[go.Bar(x=[1, 2, 3], y=[4, 5, 6])])

fig.update_layout(
    plot_bgcolor='rgba(0,0,0,0)',
    paper_bgcolor='rgba(0,0,0,0)',
    font=dict(color='#E8F4FD'),
    xaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
    yaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
)
```

### Choropleth Map with GeoJSON
```python
# Source: https://plotly.com/python/choropleth-maps/
import plotly.express as px
import json

# Load GeoJSON
with open('br_states.json', 'r') as f:
    geojson = json.load(f)

# Sample data
df = pd.DataFrame({
    'estado': ['SP', 'RJ', 'MG'],
    'value': [100, 80, 60],
})

fig = px.choropleth(
    df,
    geojson=geojson,
    locations='estado',
    featureidkey='properties.sigla',
    color='value',
    color_continuous_scale='Blues',
)

fig.update_geos(fitbounds='locations', visible=False)
```

### Portuguese Tooltip with Hovertemplate
```python
# Source: https://plotly.com/python/hover-text-and-formatting/
import plotly.express as px

fig = px.bar(df, x='month', y='sales')

fig.update_traces(
    hovertemplate='<b>Mês: %{x}</b><br>Vendas: R$ %{y:,.2f}<extra></extra>',
)
```

### Time Series with Custom Tick Labels
```python
# Source: https://plotly.com/python/time-series/
import plotly.graph_objects as go

MESES_PT = {1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
            7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'}

fig = go.Figure(data=[go.Scatter(x=dates, y=values)])

fig.update_xaxes(
    ticktext=[f"{MESES_PT[d.month]}/{d.year}" for d in dates],
    tickvals=dates,
)
```

### On-Select Cross-Filtering with Streamlit
```python
# Source: https://docs.streamlit.io/develop/api-reference/charts/st.plotly_chart
import streamlit as st
import plotly.express as px

fig = px.scatter(df, x='x', y='y', color='category')

event = st.plotly_chart(
    fig,
    on_select='rerun',
    selection_mode='lasso',
    key='scatter_chart',
)

if event.selection:
    selected_points = event.selection['points']
    st.write(f"Selecionados: {len(selected_points)} pontos")
    # Update session state for cross-filtering other charts
    st.session_state.selected_category = selected_points[0]['category']
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| st.markdown unsafe_allow_html for charts | st.plotly_chart native integration | Streamlit 1.0 (2021) | Much cleaner API, better performance, native theming support |
| Plotly **kwargs for config | Explicit config parameter | Streamlit 1.40+ (2025) | Prevents config collisions, more explicit, better type hints |
| plotly.py locale support | Manual translation | Never implemented | Python users must manually translate all text (JS has locales since 2018) |
| Manual responsive sizing | use_container_width=True | Streamlit 1.16 (2022) | Automatic responsive behavior, mobile-friendly |
| theme="streamlit" default | theme=None for custom themes | Streamlit 1.16 (2022) | Allows full custom theming while using st.plotly_chart |

**Deprecated/outdated:**
- **st.markdown(unsafe_allow_html=True)** for embedding Plotly divs: Replaced by st.plotly_chart() which handles rendering natively
- **fig.show() in Streamlit:** Doesn't work in Streamlit context, always use st.plotly_chart()
- **plotly.offline.plot():** Deprecated in favor of Plotly.py unified API (plotly.graph_objects)
- **use_container_width parameter:** Still works but width="stretch" is preferred in Streamlit 1.40+ (though use_container_width remains more common)

## Open Questions

1. **GeoJSON Property Key for Estado Matching**
   - What we know: geodata-br-states uses `properties.sigla` for UF codes, IBGE datasets may use different keys
   - What's unclear: Exact property structure without downloading and inspecting the file first
   - Recommendation: Download geodata-br-states/geojson/br_states.json during planning, inspect JSON structure, document exact featureidkey in PLAN.md

2. **Time Trend Data Availability**
   - What we know: extraction_logs table has run_date for pipeline history, propostas/convenios have data_publicacao
   - What's unclear: Whether data volume justifies monthly vs yearly granularity (need to query actual date ranges)
   - Recommendation: During implementation, query `SELECT MIN(data_publicacao), MAX(data_publicacao), COUNT(*) FROM propostas` to determine granularity

3. **Cross-Filtering UX Pattern**
   - What we know: Streamlit on_select works for point selection, can store in session_state
   - What's unclear: Whether clicking a estado in choropleth should filter ALL charts on page or just update a detail view
   - Recommendation: Start with tooltip-only (simpler), add cross-filtering in later iteration if sales reps request it

4. **Sparkline Data Source for KPI Cards**
   - What we know: extraction_logs has historical counts, can show "propostas over last 30 days"
   - What's unclear: Whether business metrics (propostas, emendas) have enough daily variation to make sparklines meaningful
   - Recommendation: Implement sparkline component but make it optional (skip if data is too sparse)

## Sources

### Primary (HIGH confidence)
- [Streamlit st.plotly_chart API Reference](https://docs.streamlit.io/develop/api-reference/charts/st.plotly_chart) - Official Streamlit documentation for Plotly integration
- [Plotly Python Configuration Options](https://plotly.com/python/configuration-options/) - Official Plotly config reference
- [Plotly Choropleth Maps](https://plotly.com/python/choropleth-maps/) - Official guide for GeoJSON-based choropleth
- [Plotly Time Series Documentation](https://plotly.com/python/time-series/) - Time series charts and date axis formatting
- [Plotly Theming and Templates](https://plotly.com/python/templates/) - Dark themes and custom styling
- [geodata-br-states GitHub Repository](https://github.com/giuliano-macedo/geodata-br-states) - Brazilian estados GeoJSON source

### Secondary (MEDIUM confidence)
- [Streamlit Blog: New Theme for Altair and Plotly](https://blog.streamlit.io/a-new-streamlit-theme-for-altair-and-plotly/) - Streamlit theming integration (2022)
- [Plotly Community: Transparent Background](https://community.plotly.com/t/transparent-background/69213) - Community solution for dark theme transparency
- [Plotly Community: Brazilian Choropleth Tutorial (PT)](https://filipegmedeiros.medium.com/choropleth-map-dos-estados-brasileiros-usando-plotly-express-9c7ccbc17c4) - Portuguese tutorial for Brazil maps
- [Plotly Community: pt-BR Locale Discussion](https://community.plotly.com/t/how-to-get-plotly-to-use-the-set-locale/43499) - Confirms manual translation needed in Python

### Tertiary (LOW confidence - needs validation)
- [Dash Sparklines Documentation](https://dash.plotly.com/dash-ag-grid/enterprise-sparklines) - Enterprise feature, may not apply to Plotly Express
- [Kaggle Brazil GeoJSON Dataset](https://www.kaggle.com/datasets/thiagobodruk/brazil-geojson) - Alternative GeoJSON source (backup)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Plotly + Streamlit integration is mature and well-documented
- Architecture: HIGH - Patterns verified via official docs and community examples
- Portuguese localization: MEDIUM - Requires manual workaround (not native feature), but approach is well-established
- GeoJSON integration: MEDIUM - Multiple sources available, exact property keys need verification
- Cross-filtering: MEDIUM - Streamlit on_select feature exists but UX pattern needs design decision
- Pitfalls: HIGH - Based on common community issues and official warnings

**Research date:** 2026-02-10
**Valid until:** 2026-03-15 (30 days - Plotly/Streamlit ecosystem is stable)
