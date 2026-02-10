---
phase: 07-data-visualization-charts
plan: 01
subsystem: ui
tags: [plotly, charts, dataviz, geojson, brazil-map, sigma-theme]

# Dependency graph
requires:
  - phase: 06-visual-foundation-component-system
    provides: Sigma brand identity (colors, fonts, glassmorphic design system)
provides:
  - Plotly 6.0.0 chart library installed
  - Brazilian estados GeoJSON with SIGLA property for choropleth maps
  - Sigma-themed chart wrapper functions (apply_sigma_theme, create_brasil_choropleth, create_value_distribution, create_time_trend, create_sparkline)
  - Chart data aggregation queries (get_proponentes_por_estado, get_value_distribution, get_propostas_trend, get_extraction_sparkline_data)
  - Portuguese localization for all chart labels and tooltips
  - Neon blue gradient color schemes for Sigma brand consistency
affects: [07-02-dashboard-chart-integration, lead-profile, kpi-visualization]

# Tech tracking
tech-stack:
  added: [plotly==6.0.0]
  patterns:
    - Sigma theme application to Plotly charts (transparent backgrounds, neon blue accents, Space Grotesk/Inter fonts)
    - Cached GeoJSON loading with @st.cache_data decorator
    - Portuguese month name mapping for time series charts
    - Choropleth maps using Brazilian GeoJSON with featureidkey mapping
    - Horizontal bar charts for value distribution readability
    - Minimal sparkline charts (40px height, no axes) for KPI cards

key-files:
  created:
    - src/dashboard/components/charts.py
    - src/dashboard/queries/chart_data.py
    - src/dashboard/assets/geo/br_states.json
  modified:
    - requirements.txt

key-decisions:
  - "Uppercase SIGLA property in GeoJSON matches uppercase estado codes in database (AC, SP, RJ, etc.)"
  - "Horizontal bar charts for value distribution improve readability of Portuguese tier labels"
  - "Sparklines return figures (not rendered) so caller controls display context"
  - "30m cache TTL for aggregation queries, 10m for extraction metrics (consistency with existing patterns)"

patterns-established:
  - "Chart theme pattern: apply_sigma_theme() sets consistent dark theme with transparent backgrounds, neon blue accents (#00D4FF), Space Grotesk/Inter fonts"
  - "GeoJSON loading pattern: @st.cache_data decorator on _load_geojson() helper to avoid re-reading on every render"
  - "Portuguese localization pattern: MESES_PT/MESES_PT_ABREV dicts for month name mapping, all hovertemplate strings in Portuguese"
  - "Value tier categorization: fewer proposals = higher value (1 proposta = Alto Valor, 10+ = Muito Baixo)"

# Metrics
duration: 4min
completed: 2026-02-10
---

# Phase 7 Plan 1: Chart Foundation Summary

**Plotly chart library with Sigma-themed wrappers (neon blue gradients, Portuguese labels, glassmorphic integration) and chart-ready aggregation queries for geographic distribution, value tiers, time trends, and sparklines**

## Performance

- **Duration:** 4m 11s
- **Started:** 2026-02-10T08:50:00Z
- **Completed:** 2026-02-10T08:54:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Installed Plotly 6.0.0 and added to requirements.txt
- Downloaded Brazilian estados GeoJSON (27 features) with verified SIGLA property matching database estado codes
- Created charts.py with 6 reusable chart wrapper functions using Sigma brand theme (transparent backgrounds, neon blue accents, Space Grotesk/Inter fonts)
- Created chart_data.py with 4 aggregation query functions providing chart-ready data with proper caching
- All chart text, labels, and tooltips in Portuguese (MESES_PT, hovertemplate strings, axis labels)
- Established consistent theming patterns for future chart integrations

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Plotly, download GeoJSON, create chart wrapper module** - `8e17b0d` (feat)
   - Added plotly==6.0.0 to requirements.txt and installed via pip
   - Downloaded br_states.json GeoJSON (27 Brazilian estados with SIGLA property)
   - Created charts.py with apply_sigma_theme, render_plotly_chart, create_brasil_choropleth, create_value_distribution, create_time_trend, create_sparkline

2. **Task 2: Create chart data aggregation queries** - `abff070` (feat)
   - Created chart_data.py with get_proponentes_por_estado, get_value_distribution, get_propostas_trend, get_extraction_sparkline_data
   - All queries follow existing caching patterns (30m for aggregations, 10m for metrics)
   - Portuguese tier labels with proper value ordering (Alto Valor first)

## Files Created/Modified

### Created
- `src/dashboard/assets/geo/br_states.json` - Brazilian estados GeoJSON with 27 features, SIGLA property for UF codes (AC, SP, RJ, etc.)
- `src/dashboard/components/charts.py` - Plotly chart wrappers with Sigma theming:
  - `apply_sigma_theme()`: dark theme with transparent backgrounds, neon blue accents, Space Grotesk/Inter fonts
  - `render_plotly_chart()`: standard Streamlit wrapper with no modebar/logo
  - `create_brasil_choropleth()`: real Brazil map with neon blue gradient, Portuguese tooltips
  - `create_value_distribution()`: horizontal bar chart for value tiers
  - `create_time_trend()`: line chart with Portuguese month labels (MESES_PT_ABREV)
  - `create_sparkline()`: minimal 40px line chart for KPI cards (no axes/legend)
  - `SIGMA_COLORS`, `MESES_PT`, `MESES_PT_ABREV` constants
- `src/dashboard/queries/chart_data.py` - Chart data aggregation queries:
  - `get_proponentes_por_estado()`: aggregate proponents by estado (UF codes) for choropleth
  - `get_value_distribution()`: categorize proponents by proposal count tiers (1 = Alto Valor, 10+ = Muito Baixo)
  - `get_propostas_trend()`: time series of proposals (monthly/yearly aggregation)
  - `get_extraction_sparkline_data()`: daily extraction volumes for sparkline visualization

### Modified
- `requirements.txt` - Added plotly==6.0.0 after pandas line

## Decisions Made

1. **GeoJSON property key verification**: Confirmed SIGLA property (uppercase) matches database estado codes (AC, SP, RJ, etc.) - no transformation needed for choropleth featureidkey mapping
2. **Horizontal bar chart orientation**: Used orientation='h' for value distribution chart to improve readability of Portuguese tier labels (e.g., "2-3 propostas (Bom Valor)")
3. **Sparkline rendering pattern**: create_sparkline() returns figure without rendering - caller (KPI components in Plan 02) controls display context and embedding
4. **Cache TTL consistency**: Used 30m for aggregation queries (match qualificacao.py), 10m for extraction metrics (match metrics.py)
5. **Color fill pattern for sparklines**: Implemented rgba conversion with 0.2 alpha for area fill under sparkline to maintain minimal design

## Deviations from Plan

None - plan executed exactly as written.

All implementation followed plan specifications:
- Plotly 6.0.0 installed as specified
- GeoJSON downloaded from correct URL with verified SIGLA property
- Chart functions match exact specifications (colors, fonts, Portuguese labels, parameters)
- Query functions follow existing patterns with proper caching and filters

## Issues Encountered

None. All tasks completed without issues:
- Plotly installation succeeded
- GeoJSON download successful with correct property keys
- Chart function imports verified
- Query function imports verified
- No syntax errors or import failures

## User Setup Required

None - no external service configuration required.

All dependencies installed via pip. GeoJSON asset downloaded and committed to repository. No environment variables or external APIs needed.

## Next Phase Readiness

**Fully ready for Plan 02 (Dashboard Chart Integration).**

Plan 02 can now:
- Import all 6 chart wrapper functions from components/charts.py
- Import all 4 aggregation queries from queries/chart_data.py
- Create Brazil choropleth maps with geographic proponent distribution
- Display value tier bar charts for lead qualification insights
- Show proposal time trends for market analysis
- Embed sparklines in KPI cards for extraction monitoring

**Available for integration:**
- Sigma-themed chart components (transparent backgrounds, neon blue accents)
- Portuguese-localized labels and tooltips
- Chart-ready aggregated data (proponents by estado, value distribution, time trends)
- Glassmorphic container wrappers from Phase 6 for chart embedding

**Watch out for:**
- Choropleth map may need height adjustment for optimal display in dashboard layout (test in Plan 02)
- Sparkline embedding pattern needs testing with KPI card st.html() iframes (may need get_iframe_styles() integration)

## Self-Check: PASSED

All files created and all commits exist as documented:

**Files verified:**
- ✓ src/dashboard/assets/geo/br_states.json
- ✓ src/dashboard/components/charts.py
- ✓ src/dashboard/queries/chart_data.py

**Commits verified:**
- ✓ 8e17b0d (Task 1: Plotly, GeoJSON, chart wrappers)
- ✓ abff070 (Task 2: chart data queries)

---
*Phase: 07-data-visualization-charts*
*Completed: 2026-02-10*
