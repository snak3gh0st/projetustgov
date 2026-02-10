# Phase 7: Data Visualization & Charts - Context

**Gathered:** 2026-02-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate interactive Plotly charts with Sigma brand theming into the existing dashboard. Charts cover geographic distribution, value analysis, and trend visualization. Establishes a themed chart wrapper reused across pages. Does NOT add new pages or navigation changes (Phase 8) or mobile polish (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Geographic heatmap
- Real Brazil choropleth map (not bar chart or treemap) — user explicitly chose map visualization
- Needs GeoJSON for Brazilian estados — researcher should investigate source/library
- Color metric, geo level (estado vs regiao), and click behavior at Claude's discretion

### Chart language
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

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User gave broad discretion on nearly all visual decisions, trusting Claude to optimize for the sales rep workflow.

Two locked decisions:
1. Real Brazil choropleth map (not simplified bar chart)
2. Portuguese language throughout all chart elements

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-data-visualization-charts*
*Context gathered: 2026-02-10*
