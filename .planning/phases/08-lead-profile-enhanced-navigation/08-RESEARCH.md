# Phase 8: Lead Profile & Enhanced Navigation - Research

**Researched:** 2026-02-10
**Domain:** Streamlit multi-page navigation, tabbed layouts, search patterns, PostgreSQL cross-entity queries, CRM value tiering
**Confidence:** HIGH

## Summary

Phase 8 implements dedicated lead profile pages for deep-dive proponent research and global cross-entity search navigation for the existing Sigma-branded Streamlit dashboard (Phases 6-7). Research confirms Streamlit provides robust multipage navigation via st.navigation + st.switch_page, tabbed content organization via st.tabs, and session state persistence for context tracking. Global search requires PostgreSQL UNION ALL queries with ILIKE pattern matching across proponentes, propostas, programas tables. Value tier classification follows industry CRM patterns (high/medium/low tiers based on engagement and value metrics). Primary challenges are avoiding query parameter resets during navigation (use session state instead), maintaining glassmorphic design budget (max 3-5 backdrop-filter elements), and optimizing ILIKE search performance with pg_trgm GIN indexes.

**Key findings:**
- Streamlit's st.switch_page() enables programmatic navigation from search results to lead profile without breaking session state (avoids URL-based navigation that resets state)
- st.tabs() creates multi-section layouts within a single page (all tab content is pre-rendered, no lazy loading)
- st.query_params gets cleared on page switches in multipage apps — use st.session_state for context tracking instead
- PostgreSQL UNION ALL enables cross-entity search (proponentes + propostas + programas) with entity_type discriminator column for result routing
- ILIKE pattern matching is slow without indexes — pg_trgm GIN indexes improve ILIKE performance from 4.7s to 75ms on large text fields
- CRM lead scoring tiers typically use 3-tier classification (hot/warm/cold or high/medium/low) based on engagement, value, and fit criteria
- st.logo() (Streamlit 2026) adds branded logo to sidebar and links to homepage automatically
- Copy-to-clipboard for CNPJ/contact data requires third-party component (st-copy) or custom JavaScript — built-in st.code copy button has reliability issues

**Primary recommendation:** Create new lead_profile.py page with st.tabs for data sections (Overview, Emendas, Propostas, Convênios, Histórico). Add global search widget to streamlit_app.py entrypoint with st.text_input + search button that stores selected CNPJ in st.session_state and calls st.switch_page("lead_profile"). Implement value tier calculation as proponente aggregate field (tier_classification: HIGH/MEDIUM/LOW) computed during pipeline enrichment. Add pg_trgm index on proponentes.nome and proponentes.cnpj for fast ILIKE search. Use minimal dark containers for search results (not glassmorphic cards) to respect Phase 6's 3-5 backdrop-filter limit. Enhance sidebar with st.logo() for Sigma branding and styled st.page_link() navigation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Streamlit | 1.54.0 | Multipage navigation + tabs | Already in project, st.navigation + st.tabs built-in |
| st.switch_page() | Built-in | Programmatic page navigation | Preserves session state unlike URL navigation |
| st.tabs() | Built-in | Multi-section tabbed layout | Native Streamlit component for organizing content |
| st.session_state | Built-in | Cross-page context tracking | Session-scoped state persistence across reruns |
| PostgreSQL | 16.x | Cross-entity search queries | Already in project, UNION ALL for multi-table search |
| pg_trgm extension | Built-in | ILIKE performance optimization | Standard Postgres module, GIN indexes for text search |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| st.logo() | Streamlit 1.54.0 | Sidebar branding | Added in 2026 release, auto-links to homepage |
| st.download_button() | Built-in | Lead data export (CSV) | Native CSV export with UTF-8 encoding |
| st.query_params | Built-in | URL parameter reading | Only for external links (not reliable for internal nav) |
| st-copy component | Optional | Copy-to-clipboard for CNPJ | Third-party component if clipboard is critical |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| st.switch_page() | URL navigation (query params) | Query params reset on page switch, breaks context tracking |
| st.tabs() | Separate pages per section | Too many pages clutters sidebar, worse UX for related content |
| Session state | Query parameters | Query params not persistent across navigation, session state more reliable |
| UNION ALL search | Separate queries + merge | More code, harder to rank/sort unified results |
| pg_trgm GIN index | Full-text search (tsvector) | Overkill for simple CNPJ/nome ILIKE, adds complexity |
| Precomputed tiers | Real-time scoring | Real-time scoring requires ML pipeline, precomputed is simpler |
| st-copy component | Manual clipboard JS | Custom JS harder to maintain, st-copy is packaged solution |

**Installation:**
```bash
# All core features built into Streamlit 1.54.0 and PostgreSQL 16
# Optional clipboard component:
pip install streamlit-copy-to-clipboard  # If copy-to-clipboard is critical UX requirement
```

**PostgreSQL Extension Setup:**
```sql
-- Enable trigram extension for ILIKE performance optimization
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN indexes for fast ILIKE search on proponentes table
CREATE INDEX IF NOT EXISTS idx_proponentes_nome_trgm ON proponentes USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_proponentes_cnpj_trgm ON proponentes USING GIN (cnpj gin_trgm_ops);
```

## Architecture Patterns

### Recommended Project Structure
```
src/dashboard/
├── streamlit_app.py                # Entry point - add global search widget here
├── pages/
│   ├── home.py                     # Existing: overview page
│   ├── qualificacao.py             # Existing: enhanced with visual ranking cards (NAV-01)
│   ├── lead_profile.py             # NEW: dedicated lead profile page (LEAD-01 to LEAD-06)
│   ├── propostas.py                # Existing: enhance styling (NAV-04)
│   ├── programas.py                # Existing: enhance styling (NAV-04)
│   ├── apoiadores.py               # Existing: enhance styling (NAV-04)
│   └── emendas.py                  # Existing: enhance styling (NAV-04)
├── components/
│   ├── search.py                   # NEW: global search bar component
│   ├── breadcrumb.py               # NEW: context indicator component (NAV-03)
│   ├── ranking_cards.py            # NEW: visual ranking card component (NAV-01)
│   ├── kpi.py                      # Existing: reuse for lead profile metrics
│   └── cards.py                    # Existing: glassmorphic wrappers
├── queries/
│   ├── search.py                   # NEW: cross-entity search query functions
│   ├── lead_profile.py             # NEW: lead-specific data aggregations
│   ├── proponentes.py              # Existing: enhance with tier calculation
│   └── entities.py                 # Existing: reuse for related entities
└── assets/
    └── styles/
        ├── theme.css               # Existing: add sidebar logo styles (NAV-02)
        └── components.css          # Existing: add ranking card styles
```

### Pattern 1: Global Search Widget at Entry Point
**What:** Search input widget rendered in streamlit_app.py (before page routing) that triggers navigation to lead profile
**When to use:** Every page in the app — search bar is global navigation element
**Example:**
```python
# src/dashboard/streamlit_app.py
import streamlit as st
from src.dashboard.components.search import render_global_search

st.set_page_config(page_title="PROJETUS Dashboard", page_icon="📊", layout="wide")
load_css()  # Existing Phase 6 CSS loading

# Global search bar (visible on all pages)
render_global_search()

# Navigation and page routing
pg = st.navigation(pages)
pg.run()
```

```python
# src/dashboard/components/search.py
import streamlit as st
from src.dashboard.queries.search import search_entities

def render_global_search():
    """Render global search bar for CNPJ/nome lookup."""
    # Use columns to create a compact search bar
    col1, col2, col3 = st.columns([3, 1, 8])

    with col1:
        search_term = st.text_input(
            "Buscar Proponente",
            placeholder="CNPJ ou Nome...",
            key="global_search_input",
            label_visibility="collapsed"
        )

    with col2:
        search_clicked = st.button("🔍 Buscar", key="global_search_button")

    if search_clicked and search_term:
        # Execute search query
        results = search_entities(search_term)

        if results:
            # Store first match in session state and navigate to lead profile
            st.session_state.selected_lead_cnpj = results[0]["cnpj"]
            st.session_state.selected_lead_name = results[0]["nome"]
            st.switch_page("pages/lead_profile.py")
        else:
            st.warning("Nenhum proponente encontrado.")
```

### Pattern 2: Tabbed Lead Profile Layout
**What:** Use st.tabs() to organize lead data into logical sections without creating separate pages
**When to use:** Lead profile page where related data (emendas, propostas, convênios) should be accessible without navigation
**Example:**
```python
# src/dashboard/pages/lead_profile.py
import streamlit as st
from src.dashboard.queries.lead_profile import (
    get_lead_overview,
    get_lead_emendas,
    get_lead_propostas,
    get_lead_convenios,
    get_lead_historico
)

def render_lead_profile():
    """Render dedicated lead profile page with tabbed content."""
    # Get selected lead from session state
    lead_cnpj = st.session_state.get("selected_lead_cnpj")

    if not lead_cnpj:
        st.warning("Nenhum lead selecionado. Use a busca global para selecionar um proponente.")
        return

    # Fetch lead overview data
    lead_data = get_lead_overview(lead_cnpj)

    if lead_data.empty:
        st.error("Lead não encontrado.")
        return

    # Header: Lead name + contact info + quick actions
    st.title(lead_data["nome"].iloc[0])

    col1, col2, col3 = st.columns([2, 2, 1])

    with col1:
        st.caption("📧 Email")
        st.write(lead_data["email"].iloc[0] or "Não disponível")

    with col2:
        st.caption("📞 Telefone")
        st.write(lead_data["telefone"].iloc[0] or "Não disponível")

    with col3:
        # Quick actions: export, copy CNPJ
        if st.button("📥 Exportar"):
            # Trigger lead data export
            pass
        if st.button("📋 Copiar CNPJ"):
            # Copy CNPJ to clipboard (requires st-copy or custom JS)
            pass

    # Value assessment summary (KPI cards)
    render_lead_kpis(lead_data)

    # Tabbed content sections
    tabs = st.tabs([
        "📊 Overview",
        "💰 Emendas",
        "📄 Propostas",
        "📋 Convênios",
        "📈 Histórico"
    ])

    with tabs[0]:  # Overview tab
        render_overview_tab(lead_cnpj)

    with tabs[1]:  # Emendas tab
        df_emendas = get_lead_emendas(lead_cnpj)
        st.dataframe(df_emendas, use_container_width=True)

    with tabs[2]:  # Propostas tab
        df_propostas = get_lead_propostas(lead_cnpj)
        st.dataframe(df_propostas, use_container_width=True)

    with tabs[3]:  # Convênios tab
        df_convenios = get_lead_convenios(lead_cnpj)
        st.dataframe(df_convenios, use_container_width=True)

    with tabs[4]:  # Histórico tab
        df_historico = get_lead_historico(lead_cnpj)
        st.line_chart(df_historico)  # Time series visualization
```

### Pattern 3: Cross-Entity Search with UNION ALL
**What:** Single query that searches proponentes, propostas, programas tables and returns unified results with entity type discriminator
**When to use:** Global search that needs to find matches across multiple entity types
**Example:**
```python
# src/dashboard/queries/search.py
import pandas as pd
import streamlit as st
from src.dashboard.config import run_query

@st.cache_data(ttl="5m")
def search_entities(search_term: str, limit: int = 20) -> pd.DataFrame:
    """Search across proponentes, propostas, programas for CNPJ or nome matches.

    Args:
        search_term: CNPJ or nome search string
        limit: Maximum results to return (default: 20)

    Returns:
        DataFrame with columns: entity_type, id, nome, cnpj (if applicable), relevance_score
    """
    # Clean search term for ILIKE (add % wildcards)
    search_pattern = f"%{search_term}%"

    # UNION ALL query across entity tables
    # Note: proponentes has highest priority (relevance_score=3), then propostas (2), then programas (1)
    query = """
    SELECT
        'proponente' AS entity_type,
        cnpj AS id,
        nome,
        cnpj,
        3 AS relevance_score
    FROM proponentes
    WHERE
        (nome ILIKE :search_pattern OR cnpj ILIKE :search_pattern)
        AND is_osc = TRUE

    UNION ALL

    SELECT
        'proposta' AS entity_type,
        transfer_gov_id AS id,
        titulo AS nome,
        proponente_cnpj AS cnpj,
        2 AS relevance_score
    FROM propostas
    WHERE titulo ILIKE :search_pattern

    UNION ALL

    SELECT
        'programa' AS entity_type,
        transfer_gov_id AS id,
        nome,
        NULL AS cnpj,
        1 AS relevance_score
    FROM programas
    WHERE nome ILIKE :search_pattern

    ORDER BY relevance_score DESC, nome ASC
    LIMIT :limit
    """

    df = run_query(query, {"search_pattern": search_pattern, "limit": limit})
    return df
```

### Pattern 4: Session State Context Tracking
**What:** Use st.session_state to track selected lead/entity context across page navigation
**When to use:** Whenever a page needs to know "which lead is currently being viewed" or "what was the last filter applied"
**Example:**
```python
# src/dashboard/streamlit_app.py (initialization)
# Initialize session state keys at app startup

if "selected_lead_cnpj" not in st.session_state:
    st.session_state.selected_lead_cnpj = None

if "selected_lead_name" not in st.session_state:
    st.session_state.selected_lead_name = None

if "breadcrumb_trail" not in st.session_state:
    st.session_state.breadcrumb_trail = []


# src/dashboard/components/breadcrumb.py
import streamlit as st

def render_breadcrumb():
    """Render breadcrumb navigation showing current context."""
    if st.session_state.selected_lead_name:
        st.caption(f"🏠 Home > 🎯 Qualificacao > 👤 {st.session_state.selected_lead_name}")
    elif st.session_state.get("active_page"):
        st.caption(f"🏠 Home > {st.session_state.active_page}")
```

### Pattern 5: Value Tier Classification
**What:** Categorize proponentes into HIGH/MEDIUM/LOW tiers based on value metrics (propostas count, emendas value, convênios status)
**When to use:** Client qualification workflow — helps sales reps prioritize leads
**Example:**
```python
# src/loader/enrichment/tier_classification.py (pipeline enrichment step)

def calculate_value_tier(proponente_row: dict) -> str:
    """Calculate value tier classification for a proponente.

    Tier logic:
    - HIGH: Virgin proponents (0 propostas) OR high emendas value (> R$ 1M) + active convênios
    - MEDIUM: Low competition (1-3 propostas) + moderate emendas value (R$ 100K - R$ 1M)
    - LOW: High competition (4+ propostas) OR low emendas value (< R$ 100K)

    Args:
        proponente_row: Dict with keys: total_propostas, valor_total_emendas, total_convenios

    Returns:
        Tier string: "HIGH", "MEDIUM", or "LOW"
    """
    total_propostas = proponente_row.get("total_propostas", 0)
    valor_emendas = proponente_row.get("valor_total_emendas", 0.0) or 0.0
    total_convenios = proponente_row.get("total_convenios", 0)

    # HIGH tier: virgin proponents (highest value - no competition)
    if total_propostas == 0:
        return "HIGH"

    # HIGH tier: high emendas value + active convênios (established, high-value)
    if valor_emendas > 1_000_000 and total_convenios > 0:
        return "HIGH"

    # MEDIUM tier: low competition + moderate value
    if total_propostas <= 3 and 100_000 <= valor_emendas <= 1_000_000:
        return "MEDIUM"

    # LOW tier: everything else (high competition or low value)
    return "LOW"


# src/dashboard/queries/proponentes.py (display tier in qualificacao page)

@st.cache_data(ttl="10m")
def get_proponentes_with_tiers(limit: int = 5000, filters: dict = None) -> pd.DataFrame:
    """Query proponentes with tier classification for ranking display."""
    # ... existing query logic ...

    # Add tier badge styling helper
    df["tier_badge_class"] = df["tier_classification"].map({
        "HIGH": "value-badge--green",
        "MEDIUM": "value-badge--blue",
        "LOW": "value-badge--gray"
    })

    return df
```

### Pattern 6: Visual Ranking Cards (Qualificação Page Enhancement)
**What:** Replace raw dataframe table with visually styled ranking cards showing tier badges and key metrics
**When to use:** NAV-01 requirement — make qualificação page more visual and intuitive for sales reps
**Example:**
```python
# src/dashboard/components/ranking_cards.py
import streamlit as st
from src.dashboard.components._styles import get_iframe_styles

def render_ranking_card(rank: int, proponente: dict) -> None:
    """Render a single proponente ranking card with tier badge.

    Args:
        rank: Ranking position (1-based)
        proponente: Dict with keys: nome, cnpj, tier_classification, total_propostas, valor_total_emendas
    """
    # Tier badge color
    tier_colors = {
        "HIGH": ("value-badge--green", "#10B981"),
        "MEDIUM": ("value-badge--blue", "#00D4FF"),
        "LOW": ("value-badge--gray", "#6B7280")
    }

    badge_class, border_color = tier_colors.get(proponente["tier_classification"], ("value-badge--gray", "#6B7280"))

    # Format values
    valor_fmt = f"R$ {proponente['valor_total_emendas']:,.2f}" if proponente['valor_total_emendas'] else "R$ 0,00"

    styles = get_iframe_styles()
    html = f"""
    {styles}
    <div class="glassmorphic-card" style="border-left: 4px solid {border_color}; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 2rem; font-weight: bold; color: var(--sigma-text-secondary);">#{rank}</div>
                <div style="font-size: 1.25rem; font-weight: 600; margin-top: 0.5rem;">{proponente['nome']}</div>
                <div style="font-size: 0.875rem; color: var(--sigma-text-secondary); margin-top: 0.25rem;">{proponente['cnpj']}</div>
            </div>
            <div style="text-align: right;">
                <div class="{badge_class}" style="margin-bottom: 0.5rem;">{proponente['tier_classification']}</div>
                <div style="font-size: 0.875rem; color: var(--sigma-text-secondary);">
                    {proponente['total_propostas']} propostas
                </div>
                <div style="font-size: 1rem; font-weight: 600; color: var(--color-success);">
                    {valor_fmt}
                </div>
            </div>
        </div>
    </div>
    """
    st.html(html)
```

### Pattern 7: Sidebar Logo and Navigation Styling
**What:** Use st.logo() for Sigma branding and CSS overrides for styled navigation items
**When to use:** NAV-02 requirement — enhance sidebar with brand identity
**Example:**
```python
# src/dashboard/streamlit_app.py (add after set_page_config)
import streamlit as st
from pathlib import Path

# Add Sigma logo to sidebar
logo_path = Path(__file__).parent / "assets" / "images" / "sigma_logo.png"
if logo_path.exists():
    st.logo(str(logo_path))  # Streamlit 2026 feature - auto-links to homepage
```

```css
/* src/dashboard/assets/styles/theme.css (add sidebar nav styling) */

/* Sidebar logo area */
[data-testid="stSidebar"] [data-testid="stImage"] {
    padding: 1rem;
    border-bottom: 1px solid var(--sigma-glass-border);
}

/* Sidebar navigation items */
[data-testid="stSidebarNav"] a {
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid transparent;
    transition: all 0.3s ease;
}

[data-testid="stSidebarNav"] a:hover {
    background: rgba(0, 212, 255, 0.1);
    border-left-color: var(--sigma-accent-neon);
}

/* Active navigation item */
[data-testid="stSidebarNav"] a[aria-current="page"] {
    background: rgba(0, 212, 255, 0.15);
    border-left-color: var(--sigma-accent-neon);
    font-weight: 600;
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search engine | Custom search index, relevance ranking, fuzzy matching | PostgreSQL pg_trgm + ILIKE with GIN indexes | ILIKE + pg_trgm handles 95% of use cases (CNPJ/nome lookup), full-text search (tsvector) adds unnecessary complexity for simple pattern matching |
| Autocomplete search | WebSocket live search, debounced queries, suggestion dropdown | Simple search input + button (no autocomplete) | Streamlit's rerun model makes real-time autocomplete expensive (re-queries on every keystroke), button-based search is simpler and more reliable |
| Lead scoring ML pipeline | Real-time AI lead scoring, behavioral tracking, predictive models | Precomputed tier classification (HIGH/MEDIUM/LOW) | ML scoring requires training data, feature engineering, model deployment — overkill for simple rule-based tiers based on propostas count + emendas value |
| Custom clipboard API | JavaScript clipboard.writeText(), browser permissions, fallback handling | st-copy component (third-party) | Clipboard API has browser compatibility issues, permission prompts, fallback complexity — st-copy abstracts this |
| Session persistence layer | Database-backed sessions, Redis cache, JWT tokens | st.session_state (Streamlit built-in) | Session state persists across page navigation within a browser session, sufficient for temporary context tracking (selected lead, breadcrumb trail) |
| Custom breadcrumb navigation | Hierarchical route tracking, URL path parsing, dynamic trail building | Simple st.caption() with session state | Streamlit's navigation is flat (no nested routes), complex breadcrumb is overkill — simple "Home > Page > Lead" caption is sufficient |

**Key insight:** Streamlit's stateful rerun model and single-user session architecture make simple solutions (session state, button-based search, precomputed tiers) more reliable than complex client-side patterns (autocomplete, real-time scoring). Optimize for Streamlit's strengths (Python-first, server-side state) rather than fighting its constraints.

## Common Pitfalls

### Pitfall 1: Using Query Parameters for Internal Navigation
**What goes wrong:** st.query_params gets cleared when navigating between pages in a multipage app, breaking context tracking for selected lead or active filters.
**Why it happens:** Streamlit's st.navigation and st.switch_page don't preserve query parameters across page switches — they're designed for external deep-linking, not internal state management.
**How to avoid:** Use st.session_state for all internal context tracking (selected_lead_cnpj, breadcrumb_trail, active_filters). Only use query_params for external links that deep-link into the app from outside (e.g., email campaigns linking to specific lead profiles).
**Warning signs:** "Selected lead disappears when navigating back to home page", "filters reset after viewing lead profile", "breadcrumb trail doesn't persist".

### Pitfall 2: Overusing Glassmorphic Cards on Lead Profile
**What goes wrong:** Lead profile page has 10+ glassmorphic cards (overview section, 5 tabs, KPI cards, quick actions), exceeding Phase 6's 3-5 backdrop-filter limit for mobile performance.
**Why it happens:** Each glassmorphic card uses backdrop-filter: blur(10px), which is GPU-intensive — too many on one page causes janky scrolling on mobile devices.
**How to avoid:** Use glassmorphic cards sparingly (max 3-5 per page) for high-priority elements (KPI summary cards, top-level containers). Use minimal dark containers (simple border + background, no blur) for tab content, search results, and data tables.
**Warning signs:** Slow page rendering on mobile, choppy scroll performance, high GPU usage in browser DevTools.

### Pitfall 3: ILIKE Search Without Indexes
**What goes wrong:** Global search query takes 4-5 seconds on 50K+ proponentes records, making search unusable.
**Why it happens:** ILIKE pattern matching requires full table scan without trigram indexes — PostgreSQL can't optimize LIKE/ILIKE queries without pg_trgm GIN indexes.
**How to avoid:** Create pg_trgm GIN indexes on searchable text columns (proponentes.nome, proponentes.cnpj, propostas.titulo, programas.nome) before implementing search feature. Verify index usage with EXPLAIN ANALYZE.
**Warning signs:** Search queries taking >1 second, high database CPU during search, EXPLAIN plan showing "Seq Scan" instead of "Bitmap Index Scan".

### Pitfall 4: All Tabs Pre-Rendering Large Datasets
**What goes wrong:** Lead profile page loads all 5 tabs' data (emendas, propostas, convênios, histórico) on page load, causing 10-second initial load time even though user only views Overview tab.
**Why it happens:** st.tabs() pre-renders all tab content on page load — there's no lazy loading or on-demand rendering for inactive tabs.
**How to avoid:** Add LIMIT clauses to all tab queries (e.g., LIMIT 100 recent records) and provide "Load More" button for full dataset. Use st.cache_data with short TTL (5m) to avoid re-querying on every rerun. Display row counts ("Showing 100 of 1,234 emendas") so users know data is truncated.
**Warning signs:** Slow lead profile page load, multiple heavy database queries on every page visit, users complaining about performance.

### Pitfall 5: Hardcoding Tier Thresholds in UI Code
**What goes wrong:** Tier classification logic (0 propostas = HIGH, 1-3 = MEDIUM, 4+ = LOW) is duplicated in multiple files (queries/proponentes.py, components/ranking_cards.py, pages/qualificacao.py), causing inconsistent tier badges when thresholds change.
**Why it happens:** Tier calculation logic is embedded in display code rather than computed as a database field or centralized utility function.
**How to avoid:** Compute tier_classification during pipeline enrichment (add column to proponentes table) or centralize calculation in a single utility function (src/dashboard/utils/tiers.py). UI code should only read tier value, not calculate it.
**Warning signs:** Tier badges showing different values in different pages, confusion when adjusting tier thresholds, duplicated if/else logic across files.

### Pitfall 6: Copying CNPJ Without User Feedback
**What goes wrong:** User clicks "Copy CNPJ" button but nothing happens — no visual feedback that CNPJ was copied to clipboard, leading to uncertainty and repeated clicks.
**Why it happens:** Clipboard write is asynchronous and invisible — Streamlit doesn't provide built-in feedback for clipboard operations.
**How to avoid:** Show st.success() toast message after successful clipboard copy. If using st-copy component, configure success_message parameter. For custom JavaScript, use st.toast() or temporary success badge that disappears after 2 seconds.
**Warning signs:** Users clicking copy button multiple times, support requests asking "did the copy work?", unclear UX around quick actions.

### Pitfall 7: Search Results Without Entity Type Context
**What goes wrong:** Global search returns "Programa Nacional de Saúde" and user clicks it expecting a lead profile, but it's a programa (not a proponente), causing navigation to wrong page or error.
**Why it happens:** UNION ALL search returns mixed entity types (proponentes, propostas, programas) without clear visual distinction in results.
**How to avoid:** Add entity_type badge to each search result (🏢 Proponente, 📄 Proposta, 📋 Programa). Route to correct page based on entity_type (proponente → lead_profile.py, proposta → propostas.py with selected ID, programa → programas.py with selected ID). Don't assume all search results are proponentes.
**Warning signs:** Users clicking search results and landing on unexpected pages, confusion about what they're viewing, need for back button.

## Code Examples

Verified patterns from Streamlit official docs and PostgreSQL documentation:

### Global Search with Session State Navigation
```python
# src/dashboard/components/search.py
import streamlit as st
from src.dashboard.queries.search import search_entities

def render_global_search():
    """Global search bar for CNPJ/nome lookup with session state routing."""
    col1, col2 = st.columns([4, 1])

    with col1:
        search_term = st.text_input(
            "Buscar",
            placeholder="CNPJ ou Nome do Proponente...",
            key="global_search_input",
            label_visibility="collapsed"
        )

    with col2:
        search_clicked = st.button("🔍", key="global_search_btn")

    if search_clicked and search_term:
        results = search_entities(search_term, limit=10)

        if not results.empty:
            # Display search results with entity type badges
            st.write("**Resultados:**")
            for idx, row in results.iterrows():
                entity_icon = {"proponente": "🏢", "proposta": "📄", "programa": "📋"}.get(row["entity_type"], "📌")

                if st.button(f"{entity_icon} {row['nome']}", key=f"result_{idx}"):
                    # Store selected entity in session state
                    st.session_state.selected_lead_cnpj = row["cnpj"]
                    st.session_state.selected_lead_name = row["nome"]

                    # Navigate to lead profile
                    st.switch_page("pages/lead_profile.py")
        else:
            st.warning("Nenhum resultado encontrado.")
```

### Lead Profile Tabs with LIMIT Queries
```python
# src/dashboard/pages/lead_profile.py
import streamlit as st
from src.dashboard.queries.lead_profile import (
    get_lead_overview,
    get_lead_emendas,
    get_lead_propostas
)

def render_lead_profile():
    """Lead profile page with tabbed data sections."""
    lead_cnpj = st.session_state.get("selected_lead_cnpj")

    if not lead_cnpj:
        st.warning("Use a busca global para selecionar um proponente.")
        return

    # Overview data
    lead = get_lead_overview(lead_cnpj)

    # Header section
    st.title(lead["nome"])

    # Contact info + quick actions
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("📧 Email", lead["email"] or "N/A")
    with col2:
        st.metric("📞 Telefone", lead["telefone"] or "N/A")
    with col3:
        st.metric("🏆 Tier", lead["tier_classification"])

    # Tabbed content (all tabs pre-render, so use LIMIT)
    tabs = st.tabs(["📊 Overview", "💰 Emendas", "📄 Propostas"])

    with tabs[0]:  # Overview
        st.subheader("Resumo de Valor")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Emendas", f"R$ {lead['valor_total_emendas']:,.2f}")
        with col2:
            st.metric("Total Propostas", lead["total_propostas"])
        with col3:
            st.metric("Convênios Ativos", lead["total_convenios"])

    with tabs[1]:  # Emendas (limited to 100 most recent)
        df_emendas = get_lead_emendas(lead_cnpj, limit=100)
        st.caption(f"Mostrando {len(df_emendas)} emendas mais recentes")
        st.dataframe(df_emendas, use_container_width=True)

    with tabs[2]:  # Propostas (limited to 100 most recent)
        df_propostas = get_lead_propostas(lead_cnpj, limit=100)
        st.caption(f"Mostrando {len(df_propostas)} propostas mais recentes")
        st.dataframe(df_propostas, use_container_width=True)
```

### PostgreSQL UNION ALL Cross-Entity Search
```sql
-- Source: PostgreSQL official documentation - UNION ALL combines multiple SELECT results
-- https://www.postgresql.org/docs/current/queries-union.html

-- Cross-entity search query for proponentes, propostas, programas
SELECT
    'proponente' AS entity_type,
    cnpj AS id,
    nome,
    cnpj,
    3 AS relevance_score  -- Highest priority for direct proponente matches
FROM proponentes
WHERE
    (nome ILIKE :search_pattern OR cnpj ILIKE :search_pattern)
    AND is_osc = TRUE

UNION ALL

SELECT
    'proposta' AS entity_type,
    transfer_gov_id AS id,
    titulo AS nome,
    proponente_cnpj AS cnpj,
    2 AS relevance_score  -- Medium priority for proposta title matches
FROM propostas
WHERE titulo ILIKE :search_pattern

UNION ALL

SELECT
    'programa' AS entity_type,
    transfer_gov_id AS id,
    nome,
    NULL AS cnpj,
    1 AS relevance_score  -- Lowest priority for programa matches
FROM programas
WHERE nome ILIKE :search_pattern

ORDER BY relevance_score DESC, nome ASC
LIMIT 20;
```

### Tier Classification Logic
```python
# src/dashboard/utils/tiers.py
# Source: Industry CRM lead scoring patterns (monday.com, Breakcold, Insightly)
# https://monday.com/blog/crm-and-sales/lead-scoring-rules/

def calculate_value_tier(total_propostas: int, valor_emendas: float, total_convenios: int) -> str:
    """Calculate value tier for proponente qualification.

    Tier logic based on CRM best practices:
    - HIGH: Virgin proponents (0 propostas) OR high value with active business
    - MEDIUM: Low competition with moderate value
    - LOW: High competition or low value

    Args:
        total_propostas: Count of propostas submitted
        valor_emendas: Total emendas value in BRL
        total_convenios: Count of active convênios

    Returns:
        Tier string: "HIGH", "MEDIUM", or "LOW"
    """
    # Virgin proponents = highest value (no competition)
    if total_propostas == 0:
        return "HIGH"

    # High-value active clients (established + high emendas value)
    if valor_emendas > 1_000_000 and total_convenios > 0:
        return "HIGH"

    # Low competition + moderate value
    if total_propostas <= 3 and 100_000 <= valor_emendas <= 1_000_000:
        return "MEDIUM"

    # High competition or low value
    return "LOW"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| st.experimental_get_query_params | st.query_params (dict-like API) | Streamlit 1.32+ (2024) | Cleaner API but still resets on page nav — use session state instead |
| Sidebar logo via st.sidebar.image() | st.logo() with auto-homepage link | Streamlit 1.54.0 (2026) | Simpler API, auto-links to home, responsive sizing |
| Manual clipboard JS injection | st-copy component (third-party) | Component released 2025 | Easier implementation, cross-browser compatibility |
| Full-text search (tsvector + tsquery) | pg_trgm GIN indexes + ILIKE | pg_trgm mature since 2015 | Simpler for exact/prefix matching (CNPJ, nome), avoids tsvector complexity |
| Real-time autocomplete search | Button-based search (no autocomplete) | Streamlit design pattern | Avoids expensive re-queries on every keystroke, simpler state management |
| AI lead scoring (ML pipeline) | Rule-based tier classification | Industry shift to transparency | Easier to explain to sales teams, no training data required, instant results |

**Deprecated/outdated:**
- **st.experimental_get_query_params / st.experimental_set_query_params**: Replaced by st.query_params in Streamlit 1.32+ (October 2024). Old API still works but marked for deprecation.
- **st.markdown unsafe_allow_html for custom components**: Replaced by st.html() for raw HTML/CSS injection (Phase 6 pattern). st.html() is preferred for security and performance.
- **Nested URL routing for multipage apps**: Streamlit's navigation is flat — attempting to implement nested routes (e.g., /leads/123/emendas) via query params breaks on page switch. Use session state instead.

## Open Questions

1. **Copy-to-clipboard UX requirement**
   - What we know: Built-in st.code copy button has reliability issues (GitHub issues #6490, #12958). Third-party st-copy component is available but adds dependency.
   - What's unclear: Is copy-to-clipboard a must-have for CNPJ/contact data, or is manual selection acceptable?
   - Recommendation: Start without clipboard feature (manual copy via text selection). Add st-copy component only if user testing shows strong demand.

2. **Tier threshold tuning**
   - What we know: Tier classification thresholds (0 propostas = HIGH, 1-3 = MEDIUM, 4+ = LOW) are placeholder values based on industry patterns.
   - What's unclear: Actual distribution of propostas counts in the dataset — thresholds may need adjustment to achieve balanced tier distribution.
   - Recommendation: Compute tier distribution during Phase 8 implementation (e.g., 20% HIGH, 50% MEDIUM, 30% LOW). Adjust thresholds if distribution is skewed (e.g., 90% HIGH is not useful).

3. **Search result ranking relevance**
   - What we know: UNION ALL query uses simple relevance_score (proponentes=3, propostas=2, programas=1) for ranking search results.
   - What's unclear: Should relevance consider partial matches (prefix vs infix), recency (extraction_date), or value metrics (valor_emendas)?
   - Recommendation: Start with simple entity_type priority ranking. Enhance with value-based boosting (e.g., HIGH-tier proponents ranked above MEDIUM) only if users report relevance issues.

4. **Lead profile export scope**
   - What we know: LEAD-06 requires "export lead data" quick action from profile page.
   - What's unclear: What data should be exported? Just overview (contact + metrics) or full dataset including all emendas/propostas/convênios tabs?
   - Recommendation: Start with overview-only export (single-row CSV with all proponente fields). Add multi-sheet Excel export (overview + emendas + propostas) if users request full dataset export.

5. **Sidebar logo asset availability**
   - What we know: st.logo() requires image file (PNG/SVG) at src/dashboard/assets/images/sigma_logo.png.
   - What's unclear: Does Sigma branding logo asset exist in project repository?
   - Recommendation: Check with user for logo file. Use placeholder text "SIGMA" in styled div if logo not available.

## Sources

### Primary (HIGH confidence)
- [Streamlit st.navigation Official Docs](https://docs.streamlit.io/develop/api-reference/navigation/st.navigation) - Multipage navigation API
- [Streamlit st.tabs Official Docs](https://docs.streamlit.io/develop/api-reference/layout/st.tabs) - Tabbed layout component
- [Streamlit st.switch_page Official Docs](https://docs.streamlit.io/develop/api-reference/navigation/st.switch_page) - Programmatic page switching
- [Streamlit st.query_params Official Docs](https://docs.streamlit.io/develop/api-reference/caching-and-state/st.query_params) - Query parameter handling (not recommended for internal nav)
- [Streamlit st.logo Official Docs](https://docs.streamlit.io/develop/api-reference/media/st.logo) - Sidebar logo with homepage link (2026 feature)
- [Streamlit st.download_button Official Docs](https://docs.streamlit.io/develop/api-reference/widgets/st.download_button) - CSV export functionality
- [PostgreSQL UNION Documentation](https://www.postgresql.org/docs/current/queries-union.html) - UNION ALL for cross-entity queries
- [PostgreSQL pg_trgm Documentation](https://www.postgresql.org/docs/current/pgtrgm.html) - Trigram indexes for ILIKE performance
- [Cybertec PostgreSQL ILIKE Performance](https://www.cybertec-postgresql.com/en/postgresql-more-performance-for-like-and-ilike-statements/) - GIN index optimization for ILIKE

### Secondary (MEDIUM confidence)
- [Monday.com Lead Scoring Rules 2026](https://monday.com/blog/crm-and-sales/lead-scoring-rules/) - Industry CRM tier classification patterns
- [Breakcold CRM Lead Scoring Guide](https://www.breakcool.com/blog/crm-lead-scoring) - Tier threshold examples (HIGH/MEDIUM/LOW)
- [Streamlit Community: Query Parameters with Multi Page Navigation](https://discuss.streamlit.io/t/query-parameters-with-multi-page-and-navigation/82692) - Query param limitations in multipage apps
- [GitHub: pg_trgm Full-Text Search Examples](https://github.com/jorzel/postgres-full-text-search) - Trigram vs tsvector comparison
- [Streamlit Community: New Component st-copy](https://discuss.streamlit.io/t/new-component-st-copy-a-new-way-to-copy-anything/111713) - Third-party clipboard component

### Tertiary (LOW confidence)
- [Streamlit Community: Breadcrumb with awesome streamlit](https://discuss.streamlit.io/t/breadcrumb-with-awesome-streamlit/8804) - Community breadcrumb implementation (outdated 2021)
- [GitHub Issue: Copy to clipboard button st.code](https://github.com/streamlit/streamlit/issues/12958) - Known issue with built-in copy button reliability

## Metadata

**Confidence breakdown:**
- Streamlit navigation & tabs: HIGH - Official Streamlit 1.54.0 documentation, verified with existing codebase patterns
- PostgreSQL cross-entity search: HIGH - Standard UNION ALL pattern, pg_trgm GIN indexes well-documented
- Value tier classification: MEDIUM - Based on industry CRM patterns but thresholds are placeholders, need tuning with real data
- UI styling patterns: HIGH - Builds on Phase 6 (glassmorphic) and Phase 7 (charts) established patterns
- Copy-to-clipboard: MEDIUM - st-copy component exists but reliability unknown, may need custom implementation

**Research date:** 2026-02-10
**Valid until:** 30 days (stable Streamlit features, PostgreSQL patterns unlikely to change)
