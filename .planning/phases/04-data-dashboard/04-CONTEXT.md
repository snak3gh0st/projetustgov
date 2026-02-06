# Phase 4: Data Dashboard - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a Streamlit dashboard that visualizes all extracted Transfer Gov data — propostas, programas, apoiadores, and emendas — with row counts, extraction history, data freshness, and drill-down views. Provides operational visibility without writing SQL queries. Deployable on Railway alongside the existing API service.

</domain>

<decisions>
## Implementation Decisions

### Dashboard layout
- Split view on home page: top section with key metric cards, bottom section with main data table — both visible without scrolling
- Sidebar navigation with one tab per entity type (propostas, programas, apoiadores, emendas) plus a home/overview tab
- Default time range: last 7 days for operational data

### Data exploration
- Cross-filtering: selecting a proposta auto-filters other sidebar tabs to show only related programas, apoiadores, emendas
- CSV export button on each data table for the current filtered view
- Data tables are browsable with search, sort, and filter

### Operational visibility
- Extraction history covering last 30 days of pipeline runs (per success criteria) with default view of last 7 days
- Data freshness indicators showing last extraction date and time
- Pipeline run status (success/partial/failed) with row counts

### Claude's Discretion
- Information density per entity page (which columns visible by default vs expandable)
- Metrics style on overview (numbers only vs sparklines — based on available extraction history data)
- Search/filter approach per entity (basic text search vs column-specific — based on data structure)
- Sorting strategy (which columns are sortable — based on data types)
- Extraction history visualization format (table vs calendar heatmap)
- Pipeline health presentation (dedicated section vs integrated into overview cards)
- Time range control widget (date picker vs preset buttons)
- Visual style, color scheme, and chart types

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User wants practical, functional data access with cross-filtering between related entities.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-data-dashboard*
*Context gathered: 2026-02-05*
