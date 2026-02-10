# Architecture Patterns: Streamlit Premium UI Integration

**Domain:** Streamlit Dashboard Premium UI/UX Enhancement
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

Premium UI features (dark theme, glassmorphic cards, Plotly charts, global search, lead profiles) integrate with Streamlit's multi-page architecture through three complementary layers: **CSS injection** (theme and styling), **component enhancement** (custom HTML/CSS components), and **state management** (cross-page search and navigation). The architecture maintains Streamlit's reactive paradigm while pushing its boundaries through targeted HTML/CSS injection and custom components.

**Key Architectural Decision:** Use external CSS files (not inline) for maintainability, inject once at app entry point, and leverage st.components.v2 for complex interactive elements only when native Streamlit is insufficient.

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   streamlit_app.py (Entry)                   │
│  - st.set_page_config()                                      │
│  - Load & inject theme CSS (dark + glassmorphic)             │
│  - Initialize session state (search, navigation)             │
│  - st.navigation() with 6 pages + lead profile               │
├─────────────────────────────────────────────────────────────┤
│                    Presentation Layer                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐   │
│  │ Pages   │  │ Pages   │  │ Pages   │  │ Lead Profile │   │
│  │ (home)  │  │(propostas│  │(programas│  │   (NEW)      │   │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬───────┘   │
│       │            │            │                │           │
├───────┴────────────┴────────────┴────────────────┴───────────┤
│                   Component Layer (NEW)                      │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ UI Components│  │   Charts    │  │  Search Widget   │    │
│  │ (cards.py)   │  │(plotly.py)  │  │  (search.py)     │    │
│  └──────┬───────┘  └──────┬──────┘  └────────┬─────────┘    │
├─────────┴──────────────────┴──────────────────┴──────────────┤
│                  Theme/Style Layer (NEW)                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ assets/css/                                            │  │
│  │  - theme_dark.css (dark mode base)                     │  │
│  │  - glassmorphic_cards.css (card components)            │  │
│  │  - plotly_theme.css (chart overrides)                  │  │
│  └────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│               Existing Query/Data Layer                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ queries/ │  │components│  │ config.py│                   │
│  │ (cached) │  │ (export) │  │(db conn) │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Integration Pattern |
|-----------|----------------|---------------------|
| **streamlit_app.py** | CSS injection, theme loading, session state init, navigation | Load CSS at top, inject via st.markdown with unsafe_allow_html |
| **assets/css/theme_dark.css** | Dark theme base colors, typography, backgrounds | External CSS file, loaded once at app start |
| **assets/css/glassmorphic_cards.css** | Card component styles (backdrop-filter, borders, shadows) | Targets Streamlit containers via CSS selectors |
| **components/ui/cards.py** | Glassmorphic card wrapper component | Returns st.container with custom CSS class |
| **components/ui/search.py** | Global search widget with autocomplete | Uses st.session_state for cross-page persistence |
| **components/charts/plotly.py** | Plotly chart configuration and theming | Wraps st.plotly_chart with consistent theme |
| **pages/lead_profile.py** | Detailed lead view with charts and history | New page, uses all UI components |

## Recommended Project Structure

```
src/dashboard/
├── streamlit_app.py                # Entry point (CSS injection here)
├── config.py                       # Database config (existing)
├── assets/                         # NEW: Static assets
│   └── css/
│       ├── theme_dark.css          # Dark theme base
│       ├── glassmorphic_cards.css  # Card components
│       └── plotly_theme.css        # Chart styling
├── components/
│   ├── __init__.py
│   ├── metrics.py                  # Existing metric cards
│   ├── filters.py                  # Existing filters
│   ├── export.py                   # Existing CSV export
│   ├── ui/                         # NEW: Premium UI components
│   │   ├── __init__.py
│   │   ├── cards.py                # Glassmorphic card wrappers
│   │   ├── search.py               # Global search widget
│   │   └── theme.py                # CSS loader utility
│   └── charts/                     # NEW: Chart components
│       ├── __init__.py
│       └── plotly.py               # Plotly theme wrapper
├── pages/
│   ├── __init__.py
│   ├── home.py                     # Enhanced with charts
│   ├── propostas.py                # Enhanced with cards
│   ├── programas.py                # Enhanced with cards
│   ├── apoiadores.py               # Enhanced with cards
│   ├── emendas.py                  # Enhanced with cards
│   ├── qualificacao_new.py         # Enhanced with charts
│   └── lead_profile.py             # NEW: Detailed lead view
└── queries/
    ├── __init__.py
    ├── metrics.py                  # Existing
    ├── history.py                  # Existing
    ├── entities.py                 # Existing
    ├── qualificacao.py             # Existing
    └── proponentes.py              # Existing
```

### Structure Rationale

- **assets/css/**: External CSS files for maintainability (not inline). Loaded once at app start. Easier to edit, version control, and reuse.
- **components/ui/**: Premium UI components isolated from existing components. Clean separation enables incremental migration.
- **components/charts/**: Chart-specific logic separated from UI. Centralizes Plotly theming and configuration.
- **pages/lead_profile.py**: New page for detailed lead view. Leverages all new components without disrupting existing pages.

## Architectural Patterns

### Pattern 1: CSS Injection via External Files

**What:** Load CSS files from assets/css/ and inject into Streamlit app via st.markdown with unsafe_allow_html=True.

**When to use:** For theme-wide styling (dark mode, glassmorphic cards, chart theming). Do this once at app entry point (streamlit_app.py).

**Trade-offs:**
- **Pros:** Maintainable, version-controllable, reusable across pages, no performance hit (loaded once)
- **Cons:** Requires unsafe_allow_html=True (security consideration, but standard practice), CSS selectors may break with Streamlit updates

**Example:**
```python
# streamlit_app.py (after st.set_page_config)
from pathlib import Path

def load_css(file_path: str) -> None:
    """Load CSS file and inject into Streamlit app."""
    with open(file_path) as f:
        st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)

# Load theme CSS files
css_dir = Path(__file__).parent / "assets" / "css"
load_css(css_dir / "theme_dark.css")
load_css(css_dir / "glassmorphic_cards.css")
load_css(css_dir / "plotly_theme.css")
```

### Pattern 2: Glassmorphic Card Component

**What:** Reusable card component using st.container with custom CSS classes for glassmorphic effect.

**When to use:** For metric cards, KPI displays, section wrappers. Wraps existing Streamlit content with premium styling.

**Trade-offs:**
- **Pros:** Consistent styling, minimal code change in pages, works with existing Streamlit widgets
- **Cons:** Limited to CSS capabilities (no complex interactions), requires CSS targeting knowledge

**Example:**
```python
# components/ui/cards.py
import streamlit as st
from typing import Optional

def glassmorphic_card(
    content_func,
    key: Optional[str] = None,
    height: Optional[str] = None
):
    """Render content inside a glassmorphic card container.

    Args:
        content_func: Callable that renders content inside the card
        key: Unique key for the container
        height: CSS height value (e.g., "200px", "auto")
    """
    # Use st.container with custom HTML wrapper for CSS targeting
    container_html = f'<div class="glassmorphic-card" data-key="{key or ""}">'
    st.markdown(container_html, unsafe_allow_html=True)

    with st.container():
        content_func()

    st.markdown('</div>', unsafe_allow_html=True)

# Usage in pages:
# from components.ui.cards import glassmorphic_card
#
# def render_metrics():
#     st.metric("Total Leads", "1,234")
#     st.metric("Total Emendas", "567")
#
# glassmorphic_card(render_metrics, key="metrics_card")
```

**Corresponding CSS (assets/css/glassmorphic_cards.css):**
```css
.glassmorphic-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    padding: 1.5rem;
    margin-bottom: 1rem;
}

/* Target Streamlit metric widgets inside cards */
.glassmorphic-card [data-testid="stMetric"] {
    background: transparent;
}
```

### Pattern 3: Plotly Chart Theming

**What:** Centralized Plotly chart configuration with dark theme and consistent styling.

**When to use:** For all Plotly charts. Ensures consistent appearance and behavior.

**Trade-offs:**
- **Pros:** Consistent theming, reduces boilerplate, automatic responsiveness, integrates with Streamlit theme
- **Cons:** Less flexibility for one-off customizations (can override via params)

**Example:**
```python
# components/charts/plotly.py
import plotly.graph_objects as go
import streamlit as st
from typing import Optional

def render_themed_chart(
    fig: go.Figure,
    height: int = 400,
    key: Optional[str] = None,
    config: Optional[dict] = None
):
    """Render Plotly chart with consistent theming.

    Args:
        fig: Plotly figure object
        height: Chart height in pixels
        key: Unique key for chart widget
        config: Additional Plotly config options
    """
    # Default config (disable scroll zoom, keep modebar)
    default_config = {
        'scrollZoom': False,
        'displayModeBar': True,
        'displaylogo': False
    }

    if config:
        default_config.update(config)

    # Apply dark theme layout defaults
    fig.update_layout(
        template="plotly_dark",  # Use Plotly's dark template
        paper_bgcolor='rgba(0,0,0,0)',  # Transparent background
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(color='#FAFAFA', size=12),
        margin=dict(l=40, r=40, t=40, b=40),
        hovermode='x unified'
    )

    # Render with Streamlit
    st.plotly_chart(
        fig,
        height=height,
        width="stretch",  # Responsive width
        config=default_config,
        key=key
    )

# Usage in pages:
# from components.charts.plotly import render_themed_chart
# import plotly.express as px
#
# fig = px.line(df, x='date', y='value', title='Trend Analysis')
# render_themed_chart(fig, height=350, key="trend_chart")
```

### Pattern 4: Global Search with Session State

**What:** Global search widget in sidebar that persists across pages and filters data.

**When to use:** For cross-page search functionality. User searches once, results available on any page.

**Trade-offs:**
- **Pros:** Excellent UX, no page refreshes needed, leverages Streamlit's reactive model
- **Cons:** Requires careful session state management, can cause unnecessary reruns if not optimized

**Example:**
```python
# components/ui/search.py
import streamlit as st
from typing import Optional, Callable

def render_global_search(
    placeholder: str = "Buscar leads, propostas...",
    on_search: Optional[Callable] = None
) -> str:
    """Render global search widget in sidebar.

    Args:
        placeholder: Search input placeholder text
        on_search: Optional callback when search changes

    Returns:
        Current search term
    """
    # Initialize session state
    if "global_search" not in st.session_state:
        st.session_state.global_search = ""

    # Render search input
    search_term = st.sidebar.text_input(
        "🔍 Busca Global",
        value=st.session_state.global_search,
        placeholder=placeholder,
        key="global_search_input",
        help="Busca em todas as páginas"
    )

    # Update session state
    if search_term != st.session_state.global_search:
        st.session_state.global_search = search_term
        if on_search:
            on_search(search_term)

    return search_term

# Usage in streamlit_app.py (before navigation):
# from components.ui.search import render_global_search
# search_term = render_global_search()

# Usage in pages (access search term):
# search_term = st.session_state.get("global_search", "")
# if search_term:
#     df = df[df['nome'].str.contains(search_term, case=False, na=False)]
```

### Pattern 5: Lead Profile Page with URL State

**What:** Dedicated page for detailed lead view, accessible via navigation and direct URL.

**When to use:** For drill-down from qualification page or direct access via URL parameters.

**Trade-offs:**
- **Pros:** Clean separation of concerns, deep-linkable, better UX than modals
- **Cons:** Requires URL parameter handling, back button navigation considerations

**Example:**
```python
# pages/lead_profile.py
import streamlit as st
from components.ui.cards import glassmorphic_card
from components.charts.plotly import render_themed_chart
from queries.qualificacao import get_proponente_details
import plotly.express as px

def render_lead_profile():
    """Render detailed lead profile page."""
    st.title("Perfil do Lead")

    # Get selected CNPJ from session state or URL params
    query_params = st.query_params
    selected_cnpj = query_params.get("cnpj", st.session_state.get("selected_lead_cnpj"))

    if not selected_cnpj:
        st.warning("Selecione um lead na página de Qualificação.")
        return

    # Fetch lead details
    lead = get_proponente_details(selected_cnpj)

    if not lead:
        st.error("Lead não encontrado.")
        return

    # Header with back button
    col1, col2 = st.columns([1, 6])
    with col1:
        if st.button("← Voltar"):
            st.session_state.selected_lead_cnpj = None
            st.switch_page("pages/qualificacao_new.py")

    with col2:
        st.header(lead['nome'])

    # KPI metrics in glassmorphic cards
    def render_kpis():
        cols = st.columns(4)
        with cols[0]:
            st.metric("Propostas", lead['total_propostas'])
        with cols[1]:
            st.metric("Emendas", lead['total_emendas'])
        with cols[2]:
            st.metric("Valor Emendas", f"R$ {lead['valor_total_emendas']/1_000_000:.1f}M")
        with cols[3]:
            st.metric("Convênios", lead.get('total_convenios', 0))

    glassmorphic_card(render_kpis, key="lead_kpis")

    # Charts section
    st.subheader("Análise Temporal")

    # Example: Proposals timeline chart
    timeline_data = get_proponente_propostas_timeline(selected_cnpj)
    fig = px.bar(
        timeline_data,
        x='data_publicacao',
        y='valor_global',
        title='Histórico de Propostas por Mês'
    )
    render_themed_chart(fig, height=300, key="timeline_chart")

# In qualificacao_new.py, navigate to profile:
# if st.button("Ver Perfil Completo"):
#     st.session_state.selected_lead_cnpj = selected_cnpj
#     st.switch_page("pages/lead_profile.py")
```

## Data Flow

### CSS Loading and Application

```
App Start (streamlit_app.py)
    ↓
st.set_page_config(layout="wide")
    ↓
Load CSS files from assets/css/
    ↓
Inject via st.markdown(<style>...</style>, unsafe_allow_html=True)
    ↓
CSS rules apply to entire app (all pages)
    ↓
Pages render → Streamlit generates HTML with class names
    ↓
CSS selectors target Streamlit elements (e.g., .stMetric, .stDataFrame)
    ↓
Glassmorphic effects applied via backdrop-filter, borders, shadows
```

### Global Search Data Flow

```
User enters search term (sidebar)
    ↓
st.session_state.global_search = search_term
    ↓
Streamlit reruns current page
    ↓
Page queries data with @st.cache_data (10-30 min TTL)
    ↓
Page filters cached data using search term
    ↓
Display filtered results
    ↓
User navigates to different page
    ↓
Session state persists (search term available)
    ↓
New page uses same search term for filtering
```

### Lead Profile Navigation Flow

```
Qualification Page: User clicks "Ver Perfil" button
    ↓
Set st.session_state.selected_lead_cnpj = cnpj
    ↓
st.switch_page("pages/lead_profile.py")
    ↓
Lead Profile Page: Read session state for CNPJ
    ↓
Query lead details (cached)
    ↓
Render glassmorphic cards with metrics
    ↓
Render Plotly charts with themed wrapper
    ↓
User clicks "← Voltar"
    ↓
Clear session state, switch back to qualification page
```

### Chart Rendering Flow

```
Page imports render_themed_chart from components/charts/plotly
    ↓
Create Plotly figure (e.g., px.line(df, x='date', y='value'))
    ↓
Pass to render_themed_chart(fig, height=400, key="chart1")
    ↓
Function applies dark theme layout (plotly_dark template)
    ↓
Set transparent backgrounds (rgba(0,0,0,0))
    ↓
Configure responsiveness (width="stretch")
    ↓
Disable scroll zoom, keep modebar
    ↓
Call st.plotly_chart with config
    ↓
Streamlit renders chart with Plotly.js
    ↓
CSS overrides from plotly_theme.css apply
```

## Integration Points with Existing Architecture

### 1. CSS Injection into streamlit_app.py

**Current:**
```python
# streamlit_app.py (lines 19-23)
st.set_page_config(
    page_title="PROJETUS Dashboard",
    page_icon="📊",
    layout="wide",
)
```

**Enhanced:**
```python
st.set_page_config(
    page_title="PROJETUS Dashboard",
    page_icon="📊",
    layout="wide",
)

# Load premium theme CSS
from components.ui.theme import load_theme_css
load_theme_css()  # Loads all CSS files from assets/css/
```

### 2. Enhance Existing Metric Cards (components/metrics.py)

**Current:** Plain st.metric calls
**Enhanced:** Wrap in glassmorphic_card component

```python
# Before (components/metrics.py)
def render_metric_cards(counts: dict, freshness: dict) -> None:
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric(label="Programas", value=f"{counts.get('programas', 0):,}")
    # ... more metrics

# After (with glassmorphic wrapper)
from components.ui.cards import glassmorphic_card

def render_metric_cards(counts: dict, freshness: dict) -> None:
    def metrics_content():
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric(label="Programas", value=f"{counts.get('programas', 0):,}")
        # ... more metrics

    glassmorphic_card(metrics_content, key="home_metrics")
```

### 3. Add Global Search to Sidebar (streamlit_app.py)

**Current:** No global search
**Enhanced:** Add before navigation

```python
# After CSS loading, before st.navigation
from components.ui.search import render_global_search
search_term = render_global_search()

# Navigation continues as normal
pages = [
    st.Page(home_page, title="Home", icon="🏠"),
    # ... existing pages
    st.Page(lead_profile_page, title="Perfil Lead", icon="👤"),  # NEW
]
pg = st.navigation(pages)
pg.run()
```

### 4. Enhance Charts in Existing Pages

**Current:** Direct Plotly/native chart usage
**Enhanced:** Use themed wrapper

```python
# Example: qualificacao_new.py adding a chart
from components.charts.plotly import render_themed_chart
import plotly.express as px

# After lead selection
if selected_lead_idx is not None:
    # ... existing lead details

    # NEW: Add trend chart
    st.subheader("Tendência de Propostas")
    proposals_df = get_proponente_propostas_timeline(selected_cnpj)
    fig = px.line(
        proposals_df,
        x='mes',
        y='valor_total',
        title='Valor de Propostas por Mês'
    )
    render_themed_chart(fig, height=300, key="proposals_trend")
```

### 5. Page-Level Search Integration

**Current:** Local search via st.text_input
**Enhanced:** Combine global + local search

```python
# pages/qualificacao_new.py
# Access global search from session state
global_search = st.session_state.get("global_search", "")

# Local search in sidebar (more specific)
local_search = st.sidebar.text_input(
    "Buscar nesta página",
    placeholder="Nome ou CNPJ...",
    key="qualif_local_search",
)

# Combine searches (OR logic)
search_term = local_search or global_search

# Apply to dataframe filter
if search_term:
    filters["search"] = search_term
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 concurrent users (current) | Current architecture sufficient. CSS loaded once per session. st.cache_data (10-30 min TTL) handles query caching. No special optimizations needed. |
| 10-50 concurrent users | Monitor cache hit rates. Consider reducing TTL if data staleness becomes issue. Glassmorphic effects perform well (CSS only). Plotly charts may need sampling for large datasets (>10k points). |
| 50-100+ concurrent users | Increase cache TTL to reduce DB load. Implement server-side pagination for large tables (currently loading 5000 records). Consider CDN for CSS assets if network becomes bottleneck. Plotly WebGL traces for large datasets. |

### Scaling Priorities

1. **First bottleneck: Database query load**
   - **Symptom:** Slow page loads, high DB CPU
   - **Fix:** Increase st.cache_data TTL to 30-60 min, optimize SQL queries with indexes, implement query result pagination

2. **Second bottleneck: Large dataframe rendering**
   - **Symptom:** Browser slowdown, high memory usage
   - **Fix:** Implement server-side pagination (100-500 rows per page), use st.data_editor with on_select for interactivity, sample large datasets for charts

3. **Third bottleneck: CSS rendering performance**
   - **Symptom:** Slow initial page load, laggy animations
   - **Fix:** Minimize CSS file size, reduce backdrop-filter complexity, disable glassmorphic effects on low-end devices

## Anti-Patterns

### Anti-Pattern 1: Inline CSS in Every Page

**What people do:** Copy-paste CSS strings into every page file with st.markdown

**Why it's wrong:**
- Unmaintainable (changes require editing multiple files)
- Increases page load time (CSS injected on every page render)
- Inconsistent styling across pages
- Version control nightmare (diffs show CSS noise)

**Do this instead:** Load CSS once at app entry point (streamlit_app.py) from external files (assets/css/). CSS applies globally, pages stay clean.

### Anti-Pattern 2: Using st.components.v2 for Simple Styling

**What people do:** Create custom components with HTML/CSS/JS for simple card styling

**Why it's wrong:**
- Overkill for pure CSS effects (no JS needed for glassmorphic cards)
- Adds complexity (component registration, mounting, cleanup)
- Slower rendering (shadow DOM overhead)
- Breaks Streamlit's reactive model (requires manual state sync)

**Do this instead:** Use CSS injection for styling, st.container for layout. Only use st.components.v2 when you need custom JavaScript interactions (e.g., D3.js charts, custom animations).

### Anti-Pattern 3: Storing Large DataFrames in Session State

**What people do:** Put entire dataframes in st.session_state for cross-page access

**Why it's wrong:**
- Memory bloat (session state persists until session ends)
- Serialization overhead (Streamlit pickles session state on every rerun)
- Stale data (no automatic refresh when DB updates)
- Breaks caching (st.cache_data more efficient)

**Do this instead:** Use st.cache_data for queries (cached, auto-refreshed on TTL). Store only IDs/filters in session state (e.g., selected_lead_cnpj, not entire lead dataframe).

### Anti-Pattern 4: Global Search with Unfiltered Queries

**What people do:** Query all data, then filter in Python based on search term

**Why it's wrong:**
- Loads unnecessary data from database
- Slow filtering for large datasets (>10k rows)
- Wastes memory (entire dataset in memory)
- Poor UX (slow search response)

**Do this instead:** Pass search term to SQL query as WHERE clause. Let database handle filtering (indexed, optimized). Return only matching rows.

Example:
```python
# BAD
@st.cache_data
def get_all_leads():
    return pd.read_sql("SELECT * FROM leads", conn)

leads = get_all_leads()
if search_term:
    leads = leads[leads['nome'].str.contains(search_term)]  # Slow!

# GOOD
@st.cache_data
def get_leads(search: str = ""):
    query = "SELECT * FROM leads WHERE nome ILIKE %s"
    return pd.read_sql(query, conn, params=(f"%{search}%",))

leads = get_leads(search_term)  # Fast, database-filtered
```

### Anti-Pattern 5: Mixing Plotly Themes Inconsistently

**What people do:** Set theme="streamlit" on some charts, theme=None on others, custom colors everywhere

**Why it's wrong:**
- Inconsistent appearance (some charts dark, some light)
- Breaks visual hierarchy
- Confusing to users (looks like multiple dashboards)
- Hard to maintain (every chart needs custom config)

**Do this instead:** Centralize theme in render_themed_chart wrapper. All charts get consistent dark theme, transparent backgrounds, fonts. Override only when needed via params.

## Build Order and Dependencies

### Phase 1: Foundation (CSS + Theme Components)
**Goal:** Establish theme infrastructure without breaking existing functionality

1. **Create directory structure**
   - mkdir -p src/dashboard/assets/css
   - mkdir -p src/dashboard/components/ui
   - mkdir -p src/dashboard/components/charts

2. **Create CSS files**
   - assets/css/theme_dark.css (dark theme base)
   - assets/css/glassmorphic_cards.css (card component styles)
   - assets/css/plotly_theme.css (chart overrides)

3. **Create theme loader utility**
   - components/ui/theme.py (load_theme_css function)

4. **Integrate CSS loading**
   - Modify streamlit_app.py to load CSS after st.set_page_config

**Dependencies:** None (standalone)
**Risk:** Low (CSS is additive, doesn't break existing functionality)
**Testing:** Visual inspection, check CSS applies to all pages

### Phase 2: UI Component Wrappers
**Goal:** Create reusable components for glassmorphic cards and themed charts

1. **Create glassmorphic card component**
   - components/ui/cards.py (glassmorphic_card function)

2. **Create Plotly chart wrapper**
   - components/charts/plotly.py (render_themed_chart function)

3. **Test components in isolation**
   - Create test page with sample cards and charts
   - Verify glassmorphic effects, chart theming

**Dependencies:** Phase 1 (CSS must be loaded)
**Risk:** Low (components are wrappers, don't change data flow)
**Testing:** Visual inspection, test on multiple screen sizes

### Phase 3: Enhance Existing Pages
**Goal:** Apply premium UI to existing pages incrementally

1. **Enhance home page**
   - Wrap metric cards in glassmorphic_card
   - Add trend chart with render_themed_chart

2. **Enhance qualification page**
   - Wrap KPI metrics in glassmorphic_card
   - Add lead selection chart

3. **Enhance entity pages (propostas, programas, apoiadores, emendas)**
   - Wrap content sections in glassmorphic_card
   - Add relevant charts (distribution, trends)

**Dependencies:** Phase 2 (components must exist)
**Risk:** Medium (modifying existing pages, potential regressions)
**Testing:** Full regression testing, verify existing functionality

### Phase 4: Global Search
**Goal:** Add cross-page search functionality

1. **Create search component**
   - components/ui/search.py (render_global_search function)

2. **Integrate into streamlit_app.py**
   - Add search widget before navigation

3. **Update query functions to accept search parameter**
   - Modify queries/qualificacao.py, queries/entities.py

4. **Update pages to use global search**
   - Read search term from session state
   - Pass to query functions

**Dependencies:** Phase 1 (CSS for search styling)
**Risk:** Medium (requires session state management, query changes)
**Testing:** Test search across all pages, verify persistence

### Phase 5: Lead Profile Page
**Goal:** Create dedicated lead detail page with charts and full data

1. **Create lead profile page**
   - pages/lead_profile.py (render_lead_profile function)

2. **Add to navigation**
   - Update streamlit_app.py to include lead profile page

3. **Add navigation from qualification page**
   - Button to switch to lead profile with selected CNPJ

4. **Implement profile charts**
   - Proposals timeline, emenda distribution, value trends

**Dependencies:** Phase 2 (cards, charts), Phase 3 (qualification page integration)
**Risk:** Low (new page, doesn't affect existing pages)
**Testing:** Test navigation, chart rendering, back button

## Sources

**HIGH Confidence (Official Documentation):**
- [Streamlit Theming - Official Docs](https://docs.streamlit.io/develop/concepts/configuration/theming)
- [st.plotly_chart API Reference](https://docs.streamlit.io/develop/api-reference/charts/st.plotly_chart)
- [st.components.v2.component API Reference](https://docs.streamlit.io/develop/api-reference/custom-components/st.components.v2.component)
- [Streamlit Session State](https://docs.streamlit.io/develop/concepts/architecture/session-state)
- [Streamlit Multi-page Apps](https://docs.streamlit.io/develop/concepts/multipage-apps/page-and-navigation)

**MEDIUM Confidence (Verified Community Resources):**
- [Microsoft Streamlit UI Template - GitHub](https://github.com/microsoft/Streamlit_UI_Template)
- [How to Customize CSS in Streamlit - Medium](https://medium.com/pythoneers/how-to-customize-css-in-streamlit-a-step-by-step-guide-761375318e05)
- [Streamlit Search Filtering and Pagination Widget - Streamlit Blog](https://medium.com/streamlit/streamlit-search-filtering-and-pagination-widget-64d390180a96)
- [Best Practices for Streamlit Development - Medium](https://medium.com/@jashuamrita360/best-practices-for-streamlit-development-structuring-code-and-managing-session-state-0bdcfb91a745)
- [How to Structure and Organise a Streamlit App - Towards Data Science](https://towardsdatascience.com/how-to-structure-and-organise-a-streamlit-app-e66b65ece369/)

**MEDIUM Confidence (Glassmorphism Design Resources):**
- [Dark Glassmorphism UI Trend 2026 - Medium](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f)
- [64 CSS Glassmorphism Examples](https://freefrontend.com/css-glassmorphism/)
- [Glassmorphic Card Dashboard Grid - UISnips](https://uisnips.com/@prajwal/glassmorphic-card-dashboard-grid-with-hover-effects)

---
*Architecture research for: Streamlit Premium UI Integration*
*Researched: 2026-02-09*
*Confidence: HIGH (official docs + verified community patterns + existing codebase analysis)*
