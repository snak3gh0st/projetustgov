# Stack Research: Premium Streamlit Dashboard Styling

**Domain:** Dashboard UI/UX Enhancement - Dark Theme, Custom Styling, and Premium Visualizations
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

For transforming the existing Streamlit dashboard to premium Sigma-branded styling, the stack additions focus on three capabilities: native theming configuration, CSS injection for glassmorphic effects, and Plotly for premium charts. Streamlit's native config.toml theming (introduced 1.44+) provides dark theme foundation without third-party dependencies. For advanced glassmorphism and custom components, st.html (non-iframe, Streamlit 1.38+) enables direct CSS injection. Plotly 6.5+ integrates seamlessly with Streamlit for interactive, branded charts. Search functionality leverages existing pandas filtering patterns with session state—no additional dependencies needed.

## Recommended Stack Additions

### Core Visualization
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| plotly | >=6.5.2 | Interactive charts with Sigma branding | Official st.plotly_chart integration, customizable color schemes, WebGL for performance, supports theme inheritance from Streamlit config |

### CSS/Theming (No Additional Dependencies)
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Streamlit config.toml | Built-in (1.44+) | Dark theme foundation with Sigma colors/fonts | Native theming with [theme.dark] configuration, supports custom fonts (Space Grotesk/Inter), no runtime overhead |
| st.html | Built-in (1.38+) | Glassmorphic card components, custom HTML styling | Direct DOM injection without iframe isolation, safer than st.markdown unsafe_allow_html, accepts CSS files for clean organization |

### Optional Performance Enhancement
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| orjson | Latest | Faster JSON serialization for Plotly charts | Automatically detected by Plotly, improves chart rendering with large datasets (1,000+ points) |

## Existing Stack (Validated, No Changes)

| Technology | Current Version | Status | Notes |
|------------|----------------|--------|-------|
| streamlit | 1.54.0 | Keep | Already includes st.html, config.toml theming, st.plotly_chart |
| pandas | 2.3.3 | Keep | Used for search/filtering via DataFrame operations |
| sqlalchemy | 2.0.46 | Keep | Database queries unchanged |

## Installation

```bash
# New dependencies
pip install plotly>=6.5.2

# Optional performance enhancement
pip install orjson

# No changes to existing dependencies
```

## Implementation Architecture

### 1. Dark Theme Configuration (.streamlit/config.toml)

```toml
[theme.dark]
primaryColor = "#00D4FF"  # Sigma neon blue
backgroundColor = "#050B1F"  # Dark background
secondaryBackgroundColor = "#0D1729"  # Card backgrounds
textColor = "#FFFFFF"
font = "Space Grotesk:https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap"

[theme.dark.sidebar]
backgroundColor = "#020714"
```

**Rationale:** Config-based theming is the official Streamlit approach as of 1.44. Provides foundational dark theme without runtime CSS injection overhead. Supports Google Fonts via URL syntax.

**Confidence:** HIGH (official Streamlit documentation)

### 2. Glassmorphic Components (st.html + CSS)

**File structure:**
```
src/dashboard/
  assets/
    style.css          # Glassmorphism CSS
  components/
    premium_cards.py   # Reusable card components
```

**Implementation pattern:**
```python
# Load CSS once per session
def load_custom_css():
    if 'css_loaded' not in st.session_state:
        css_path = Path(__file__).parent.parent / "assets" / "style.css"
        st.html(css_path)
        st.session_state.css_loaded = True

# Glassmorphic card component
def render_glass_card(content: str):
    st.html(f"""
        <div class="glass-card">
            {content}
        </div>
    """)
```

**CSS (assets/style.css):**
```css
.glass-card {
    background: rgba(13, 23, 41, 0.6);  /* Sigma secondary with transparency */
    backdrop-filter: blur(12px);
    border-radius: 16px;
    border: 1px solid rgba(0, 212, 255, 0.2);  /* Sigma blue border */
    padding: 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```

**Rationale:** st.html is non-iframe (no isolation issues), accepts CSS files (clean separation), and DOMPurify-sanitized by default. Superior to st.markdown with unsafe_allow_html.

**Confidence:** HIGH (official Streamlit docs, verified in 1.38+)

**Known issue:** Bug report (#10384) indicates CSS not applying in 1.42.1, but issue appears resolved in 1.54.0 based on timeline.

### 3. Premium Charts (Plotly)

```python
import plotly.express as px
import plotly.graph_objects as go

# Sigma brand colors
SIGMA_COLORS = {
    'primary': '#00D4FF',
    'background': '#050B1F',
    'secondary': '#0D1729',
    'accent': ['#00D4FF', '#0099FF', '#0066FF', '#0033FF']
}

# Branded chart template
def create_branded_chart(df, chart_type='bar'):
    fig = px.bar(df, x='x', y='y', color_discrete_sequence=SIGMA_COLORS['accent'])

    fig.update_layout(
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Space Grotesk', color='#FFFFFF'),
        margin=dict(l=20, r=20, t=40, b=20)
    )

    st.plotly_chart(fig, use_container_width=True, theme=None)  # theme=None to use custom
```

**Rationale:**
- Official st.plotly_chart integration (no custom component needed)
- Supports Streamlit theme inheritance OR custom themes (theme=None for full control)
- WebGL rendering automatic for 1,000+ points (performance)
- Plotly Express for rapid development, Graph Objects for advanced customization

**Confidence:** HIGH (official Streamlit documentation, Plotly 6.5.2 verified on PyPI)

### 4. Global Search (No Additional Dependencies)

**Pattern:**
```python
# Session state for search query
if 'search_query' not in st.session_state:
    st.session_state.search_query = ''

# Search input in sidebar
search = st.sidebar.text_input('Search', value=st.session_state.search_query, key='search')

# Filter DataFrame
def filter_dataframe(df: pd.DataFrame, query: str) -> pd.DataFrame:
    if not query:
        return df

    # Search across all string columns
    mask = df.astype(str).apply(
        lambda row: row.str.contains(query, case=False, na=False).any(),
        axis=1
    )
    return df[mask]

filtered_df = filter_dataframe(propostas_df, search)
```

**Rationale:** Leverages existing pandas (already in requirements.txt). Session state maintains search across page reruns. No third-party search library needed for this use case.

**Confidence:** MEDIUM (community pattern, not official Streamlit feature)

**Note:** Native dataframe search (Cmd/Ctrl+F) exists but doesn't provide global filtering—this pattern fills that gap.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CSS Injection | st.html | st.markdown(unsafe_allow_html=True) | Deprecated pattern, explicit unsafe flag, st.html is safer and cleaner |
| CSS Injection | st.html | st.components.v1.html | Iframe isolation breaks global styling, st.html injects directly into DOM |
| Theming | config.toml | streamlit-extras | Unnecessary dependency for theming, config.toml is native and sufficient |
| Charts | Plotly | Altair | Less customization for dark themes, Plotly has better enterprise styling options |
| Charts | Plotly | Matplotlib | Static charts, no interactivity, poor dark theme support |
| Search | pandas filtering | streamlit-aggrid | Heavy dependency (13+ packages), overkill for simple search, enterprise filtering not needed here |
| Search | pandas filtering | streamlit-extras filter_dataframe | Adds dependency, custom implementation gives more control for branded UI |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| st.markdown with unsafe_allow_html | Security risk, may be removed, flagged as "unsafe" in name | st.html (sanitized, official, safe) |
| st.components.v1.html | Creates iframe, isolates CSS from main app, harder to theme | st.html (direct injection, no iframe) |
| streamlit-aggrid | 13+ dependencies, enterprise grid features unused, maintenance concerns | Native st.dataframe + pandas filtering |
| Custom component for search | Adds complexity, build tooling, maintenance burden | Session state + pandas (simpler, no build step) |
| Inline CSS in Python strings | Unmaintainable, mixes concerns, hard to update | External CSS files loaded via st.html |
| Chart.js/D3.js custom components | Requires custom component development, no Streamlit integration | Plotly with st.plotly_chart (native integration) |

## Stack Patterns by Feature

### For Dark Theme Foundation:
- Use `.streamlit/config.toml` with `[theme.dark]` configuration
- Set Sigma brand colors (background: #050B1F, primary: #00D4FF)
- Configure Google Fonts (Space Grotesk, Inter) via font URLs
- **Why:** Native, no dependencies, automatic light/dark toggle in Streamlit UI

### For Glassmorphic Cards:
- Use `st.html(css_file_path)` to load CSS on first session
- Store CSS in `src/dashboard/assets/style.css`
- Create reusable component functions that return HTML strings
- **Why:** Clean separation, reusable, DOMPurify-sanitized

### For Premium Charts:
- Use `plotly.express` for rapid chart creation
- Use `plotly.graph_objects` for advanced customization (gradient fills, custom shapes)
- Set `theme=None` in `st.plotly_chart()` to use custom Sigma colors
- Install `orjson` for performance with large datasets
- **Why:** Official integration, performance optimizations, extensive customization

### For Global Search:
- Use `st.sidebar.text_input()` with `st.session_state` for persistence
- Filter DataFrames with pandas `.str.contains()` across all columns
- Apply filtering before passing to `st.dataframe()`
- **Why:** No dependencies, simple, maintainable

### For Lead Profile Pages:
- Use standard Streamlit page routing (existing pattern)
- Query single lead from PostgreSQL via SQLAlchemy (existing pattern)
- Combine glassmorphic cards (st.html) + Plotly charts + native metrics
- **Why:** Leverages existing architecture, no new patterns needed

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| plotly | 6.5.2 | streamlit>=1.38 | Requires Python >=3.8, orjson optional for performance |
| streamlit | 1.54.0 | plotly>=4.0.0 | st.html added in 1.38, advanced theming in 1.44 |
| orjson | Latest | plotly>=4.0.0 | Auto-detected by Plotly, no code changes needed |

**Critical:** Streamlit 1.38+ required for st.html (non-iframe CSS injection). Streamlit 1.44+ required for advanced theming ([theme.dark] syntax). Current version 1.54.0 meets both requirements.

## Configuration Checklist

- [ ] Create `.streamlit/config.toml` with [theme.dark] configuration
- [ ] Add Sigma brand colors (primary: #00D4FF, background: #050B1F)
- [ ] Configure Google Fonts (Space Grotesk for headings, Inter for body)
- [ ] Create `src/dashboard/assets/style.css` for glassmorphism
- [ ] Install `plotly>=6.5.2` in requirements.txt
- [ ] Optional: Install `orjson` for chart performance
- [ ] Create reusable component functions in `src/dashboard/components/premium_cards.py`
- [ ] Define Sigma color palette constants for Plotly charts
- [ ] Implement session state search pattern in relevant pages
- [ ] Test CSS injection with `st.html()` on first session load

## Migration from Default Styling

### Step 1: Theme Foundation
Replace default Streamlit theme with Sigma dark theme via config.toml. No code changes required—purely configuration.

### Step 2: CSS Loading
Add CSS loader function to main app file (`streamlit_app.py`), called once on session start. Existing components continue working.

### Step 3: Component Wrapping
Wrap existing metrics/cards in glassmorphic HTML containers. Original functionality unchanged, purely visual enhancement.

### Step 4: Chart Migration
Replace existing chart code (if any) with Plotly equivalents. If no charts exist, add Plotly charts with Sigma branding from start.

### Step 5: Search Integration
Add search input to sidebar, apply filtering before existing dataframe rendering. Minimal changes to page logic.

**Migration risk: LOW** — All additions are non-breaking. Existing Streamlit components continue functioning. CSS applies globally without modifying component code.

## Sources

### Official Documentation (HIGH Confidence)
- [Streamlit Theming](https://docs.streamlit.io/develop/concepts/configuration/theming) — Theme configuration structure
- [Customize Fonts](https://docs.streamlit.io/develop/concepts/configuration/theming-customize-fonts) — Google Fonts integration
- [st.html Documentation](https://docs.streamlit.io/develop/api-reference/text/st.html) — CSS injection without iframe
- [st.plotly_chart Documentation](https://docs.streamlit.io/develop/api-reference/charts/st.plotly_chart) — Plotly integration
- [Plotly Python 6.5.2](https://pypi.org/project/plotly/) — Version verification

### Community Resources (MEDIUM Confidence)
- [Streamlit Custom CSS Theming](https://discuss.streamlit.io/t/customize-theme/39156) — Theme customization patterns
- [Static File Serving](https://docs.streamlit.io/develop/concepts/configuration/serving-static-files) — Asset organization
- [Session State Docs](https://docs.streamlit.io/develop/api-reference/caching-and-state/st.session_state) — Search state management

### Design Resources (MEDIUM Confidence)
- [Dark Glassmorphism 2026](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f) — Glassmorphism design patterns
- [Glassmorphism CSS Generator](https://ui.glass/generator/) — backdrop-filter reference

---
*Stack research for: Premium Streamlit Dashboard Styling*
*Researched: 2026-02-09*
*Focused on: Dark theme, glassmorphism, Plotly charts, global search*
