# Project Research Summary

**Project:** PROJETUS Premium Dashboard UI/UX Redesign
**Domain:** Streamlit Dashboard Enhancement - Sales Analytics
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

The PROJETUS dashboard redesign transforms an existing functional Streamlit application into a premium, Sigma-branded sales tool using native Streamlit capabilities enhanced with strategic CSS injection and Plotly visualizations. Research confirms that premium sales dashboards in 2026 require dark themes with glassmorphic aesthetics, interactive data visualizations, and mobile-responsive layouts - all achievable within Streamlit's architectural constraints without custom components or heavy dependencies.

The recommended approach leverages Streamlit's mature theming infrastructure (config.toml for foundation, st.html for CSS injection) combined with Plotly for interactive charts. This avoids fighting Streamlit's re-run architecture while achieving visual premium feel. The critical insight: success means embracing what Streamlit does well (data visualization, filtering, drill-down) while using CSS for visual polish, rather than attempting SPA-like features (real-time collaboration, complex animations) that conflict with the framework's reactive model.

Key risks center on maintaining CSS stability across Streamlit updates and avoiding performance degradation from heavy glassmorphic effects. Mitigation: use external CSS files (not inline), target stable Streamlit CSS classes, test visual regression on updates, and keep backdrop-filter complexity minimal for low-end devices. The existing codebase already handles data quality well (schema validation, graceful degradation), so the enhancement layer is purely additive with low technical risk.

## Key Findings

### Recommended Stack

For premium UI enhancement, the stack additions are minimal and strategic. **Plotly 6.5+** provides interactive charts with native Streamlit integration (st.plotly_chart), customizable color schemes for Sigma branding, and automatic WebGL rendering for performance. **Streamlit 1.54** (already in use) includes all needed capabilities: st.html for non-iframe CSS injection (added 1.38), config.toml theming (enhanced 1.44), and st.plotly_chart integration. **No additional UI frameworks needed** - native Streamlit + CSS accomplishes glassmorphic cards, dark theme, and visual hierarchy without external dependencies.

**Core technologies:**
- **Plotly 6.5+**: Interactive charts with Sigma brand colors - native st.plotly_chart integration, WebGL for performance, theme inheritance from Streamlit config
- **st.html (built-in)**: Glassmorphic CSS injection - direct DOM injection without iframe, DOMPurify-sanitized, accepts CSS files for clean separation
- **config.toml (built-in)**: Dark theme foundation - native Streamlit theming, Sigma brand colors (navy #050B1F, neon blue #00D4FF), Google Fonts support

**Optional enhancement:**
- **orjson**: Faster Plotly chart serialization for large datasets (1,000+ points) - auto-detected by Plotly, no code changes needed

### Expected Features

Research identified three feature tiers based on 2026 sales dashboard expectations and Streamlit capabilities.

**Must have (table stakes):**
- **Dark cyberpunk theme** - users expect dark mode in 2026 data dashboards; light themes feel dated
- **Glassmorphic card design** - creates premium Sigma brand aesthetic with backdrop-filter effects on dark backgrounds
- **Interactive charts** - visual analytics reduce cognitive load; users understand patterns faster than tables (lead distribution, trends)
- **Mobile responsive layout** - 60%+ dashboard traffic is mobile in 2026; sales reps check leads on phones
- **Lead profile dedicated page** - deep-dive into single lead with charts, emendas, propostas, convenios; core sales workflow
- **Visual ranking indicators** - color-coded badges and progress bars for lead quality; faster qualification decisions

**Should have (competitive):**
- **Global search** - search across entities from single sidebar input; reduces navigation friction
- **Comparison view** - side-by-side lead comparison; faster qualification for power users
- **Subtle animations** - fade-ins for cards create polished feel (CSS only, avoid flicker)
- **Data freshness visual indicator** - prominent "Updated 2h ago" builds trust

**Defer (v2+):**
- **Real-time collaboration** - conflicts with Streamlit's stateless architecture; requires custom WebSocket components
- **Complex animations** - Streamlit re-runs cause flicker/jank; embrace framework's re-run model instead
- **Drag-and-drop customization** - high maintenance burden; offer predefined layout variants instead
- **Sub-second autocomplete search** - every keystroke triggers full re-run; use debounced search or Enter-to-search

### Architecture Approach

The architecture adds three non-invasive enhancement layers to existing Streamlit multi-page structure: **CSS injection** (theme + styling loaded once at app start via external files), **component wrappers** (reusable glassmorphic card and themed chart functions), and **state management** (cross-page search via session state). This maintains Streamlit's reactive paradigm while pushing boundaries through targeted HTML/CSS injection.

**Major components:**
1. **Theme Layer (assets/css/)** - External CSS files for dark theme, glassmorphic cards, Plotly overrides; loaded once at streamlit_app.py entry point via st.html
2. **Component Wrappers (components/ui/, components/charts/)** - Reusable functions: glassmorphic_card() wraps content, render_themed_chart() applies consistent Plotly styling
3. **Enhanced Pages** - Existing pages (home, qualificacao, propostas, etc.) wrapped with glassmorphic cards, augmented with Plotly charts; NEW lead_profile.py for drill-down
4. **Global Search Widget** - Sidebar search with st.session_state persistence; filters applied at query level (SQL WHERE clause) for performance

**Integration with existing architecture:**
- CSS loads after st.set_page_config in streamlit_app.py (no changes to page routing)
- Metric cards wrapped with glassmorphic_card() (existing st.metric calls unchanged)
- Charts added to pages using render_themed_chart() (new visualizations, not replacements)
- Search integrated before st.navigation (query functions updated to accept search parameter)

### Critical Pitfalls

Research identified pitfalls from both web scraping/ETL domain (existing codebase handles well) and Streamlit UI domain (new risks for this redesign). Focus on Streamlit-specific pitfalls since data quality is already validated.

1. **CSS Brittleness Across Streamlit Updates** - Streamlit changes CSS class names in updates, breaking custom selectors. **Avoid:** Use minimal, stable CSS selectors (e.g., [data-testid="stMetric"] not .css-abc123), test visual regression on Streamlit updates, maintain fallback styles for core elements, document selector dependencies per Streamlit version.

2. **Performance Degradation from Glassmorphic Effects** - Backdrop-filter on many elements causes browser lag, especially mobile. **Avoid:** Limit glassmorphic cards to 5-10 per page maximum, simplify blur radius (10-12px not 30px+), disable effects on low-end devices via CSS media queries, test on mobile browsers before deployment.

3. **Fighting Streamlit's Re-run Architecture** - Attempting SPA-like features (complex animations, real-time updates) creates janky UX due to full page re-renders. **Avoid:** Embrace Streamlit's reactive model, use CSS-only animations (fade-in on static elements), skip features requiring incremental DOM updates, optimize for speed over flash (sub-second re-run > smooth animation).

4. **Session State Memory Bloat** - Storing large DataFrames in st.session_state for cross-page access causes memory issues. **Avoid:** Use st.cache_data for queries (cached, auto-refreshed on TTL), store only IDs/filters in session state (e.g., selected_lead_cnpj not entire DataFrame), let database handle filtering via WHERE clause not Python filtering.

5. **Inline CSS Maintenance Nightmare** - Copy-pasting CSS strings into every page creates inconsistency and makes updates painful. **Avoid:** Load CSS once at app entry from external files (assets/css/), use reusable component wrappers, never inject CSS per page, version control CSS separately from Python logic.

## Implications for Roadmap

Based on research, premium UI redesign should follow incremental enhancement strategy with clear separation of concerns. Architecture patterns and pitfalls indicate building from foundation (CSS + theme) to wrappers (components) to integration (enhanced pages) to new features (lead profile, global search).

### Phase 1: Visual Foundation
**Rationale:** CSS theming is foundational and non-breaking. Establishes premium look-and-feel before functional enhancements. Pure CSS work has immediate visual impact with minimal risk.

**Delivers:**
- Dark cyberpunk theme (Sigma navy #050B1F + neon blue #00D4FF)
- Glassmorphic card component infrastructure
- CSS loading mechanism at app entry
- Visual hierarchy refinement (spacing, typography)

**Addresses Features:**
- Dark cyberpunk theme (table stakes)
- Glassmorphic card design (table stakes)
- Visual hierarchy (table stakes)

**Avoids Pitfalls:**
- Inline CSS maintenance nightmare (external CSS files)
- Performance degradation (minimal backdrop-filter complexity)
- CSS brittleness (stable selectors, documented dependencies)

**Research Flag:** Standard patterns, skip research-phase. Glassmorphism CSS well-documented.

### Phase 2: Data Visualization Enhancement
**Rationale:** Charts reduce cognitive load for sales reps. Plotly has native Streamlit integration with free interactive features. Medium complexity but high value for analytics dashboard.

**Delivers:**
- Interactive lead distribution charts (by state, ministry, value tier)
- Trend visualizations (proposals over time if historical data available)
- Plotly dark theme configuration matching Sigma brand
- Themed chart wrapper component (render_themed_chart)

**Uses Stack:**
- Plotly 6.5+ for charts
- st.plotly_chart native integration
- Themed wrapper centralizes configuration

**Implements Architecture:**
- components/charts/plotly.py wrapper
- Integration into home, qualificacao pages

**Avoids Pitfalls:**
- Inconsistent chart theming (centralized wrapper)
- Performance issues (WebGL for large datasets, sampling if needed)

**Research Flag:** Standard patterns, skip research-phase. Plotly integration well-documented in Streamlit docs.

### Phase 3: Enhanced Navigation & Lead Profile
**Rationale:** Sales workflow is search > browse > drill-down. Optimizing this flow has direct business impact. Lead profile page leverages all previous components (cards, charts) for deep-dive view.

**Delivers:**
- Dedicated lead profile page with URL routing (st.query_params)
- Enhanced search UI in sidebar (visual prominence)
- Visual ranking indicators (color-coded badges, progress bars)
- Breadcrumb navigation showing current location

**Addresses Features:**
- Lead profile dedicated page (table stakes)
- Visual ranking indicators (table stakes)
- Enhanced search UI (competitive)

**Implements Architecture:**
- pages/lead_profile.py (NEW)
- components/ui/search.py for global search widget
- Session state for selected lead (CNPJ only, not full data)

**Avoids Pitfalls:**
- Session state memory bloat (store CNPJ ID only)
- Fighting re-run architecture (use st.switch_page for navigation)

**Research Flag:** Standard patterns, skip research-phase. Multi-page navigation documented.

### Phase 4: Global Search & Polish
**Rationale:** Cross-page search improves UX but requires session state + query modifications. Final polish (mobile responsive, animations) completes premium feel without affecting core functionality.

**Delivers:**
- Global search across entities (leads, emendas, propostas)
- Mobile responsive layout (CSS media queries)
- Subtle card fade-in animations (CSS only)
- Data freshness visual indicator (prominent timestamp)
- Export UX improvements (better button styling)

**Addresses Features:**
- Global search (competitive)
- Mobile responsive layout (table stakes)
- Subtle animations (competitive)
- Data freshness indicator (competitive)

**Implements Architecture:**
- components/ui/search.py integrated into streamlit_app.py
- Query functions updated to accept search parameter (SQL WHERE clause)
- CSS media queries for tablet/phone breakpoints

**Avoids Pitfalls:**
- Search performance (database-level filtering, not Python)
- CSS animation flicker (CSS-only, subtle effects)
- Mobile layout complexity (simplified view, collapsible sections)

**Research Flag:** **Needs research-phase** for global cross-entity search architecture. Complex search index across multiple tables requires deeper investigation during phase planning.

### Phase 5 (Optional/Future): Comparison View
**Rationale:** Power user feature, not essential for MVP. Add only if users actively request side-by-side lead comparison.

**Delivers:**
- Side-by-side lead comparison (2-3 leads)
- Synchronized scrolling for comparison sections
- State management for selected leads (session state)

**Addresses Features:**
- Comparison view (competitive, defer if not requested)

**Research Flag:** Standard patterns, skip research-phase. Uses st.columns with synchronized data.

### Phase Ordering Rationale

- **Foundation first (Phase 1):** CSS theming is non-breaking, establishes brand identity, enables glassmorphic cards used in all subsequent phases. Pure additive layer with no data flow changes.

- **Visualization second (Phase 2):** Charts require themed foundation (dark colors, card backgrounds) to look cohesive. Component wrapper pattern established here applies to all future charts.

- **Navigation third (Phase 3):** Lead profile page consumes components from Phase 1 & 2 (cards, charts). Navigation enhancements build on existing multi-page structure.

- **Search last (Phase 4):** Most complex feature (cross-page state, query modifications). Benefits from stable component foundation. Can ship Phase 1-3 as MVP, add search later if needed.

**Dependency chain:**
```
Phase 1 (CSS) → Phase 2 (Charts) → Phase 3 (Lead Profile) → Phase 4 (Search)
     ↓              ↓                      ↓
  All phases    Requires dark        Requires cards +
                theme colors         charts components
```

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 4 (Global Search):** Complex search index architecture across multiple entities (leads, emendas, propostas, convenios). Need to research: search index structure, SQL query optimization for cross-entity search, autocomplete performance with large datasets, search relevance ranking.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Visual Foundation):** Glassmorphism CSS well-documented, Streamlit theming official docs, Google Fonts integration standard.
- **Phase 2 (Visualization):** Plotly integration in Streamlit docs, theming patterns established, chart types documented.
- **Phase 3 (Navigation):** Multi-page apps and st.query_params in official docs, lead profile pattern standard for dashboards.
- **Phase 5 (Comparison):** st.columns for layout documented, state management for selection standard pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Minimal dependencies (Plotly only), all built-in Streamlit features verified in official docs, versions confirmed on PyPI, existing Streamlit 1.54 meets all requirements |
| Features | **HIGH** | Based on 2026 sales dashboard benchmarks (Salesforce, HubSpot patterns), Streamlit capabilities validated, anti-features clearly identified to avoid scope creep |
| Architecture | **HIGH** | Patterns verified in official Streamlit docs + Microsoft Streamlit UI Template, glassmorphism CSS documented, component wrapper pattern proven in community, existing codebase analyzed for integration points |
| Pitfalls | **MEDIUM** | Streamlit-specific pitfalls identified from community resources and best practices, but CSS brittleness across versions needs testing, performance of glassmorphic effects needs validation on target devices |

**Overall confidence:** **HIGH**

Research is comprehensive with strong foundation in official documentation and verified community patterns. Medium confidence on pitfalls reflects inherent uncertainty in CSS stability across future Streamlit updates and performance variability across user devices - both require testing during implementation.

### Gaps to Address

**CSS Selector Stability:**
- **Gap:** Streamlit CSS class names may change in updates (e.g., .css-abc123 hashes change)
- **Mitigation:** Use data-testid attributes where possible (more stable), document Streamlit version dependencies in CSS files, test visual regression on Streamlit updates before deployment, maintain fallback styles
- **Address:** Phase 1 implementation - establish testing protocol

**Glassmorphic Performance on Low-End Devices:**
- **Gap:** backdrop-filter performance varies by browser/device; may lag on older mobile devices
- **Mitigation:** Test on target devices (sales team mobile browsers), implement CSS media query to disable effects on low-end devices (prefers-reduced-motion), provide fallback solid backgrounds
- **Address:** Phase 1 testing - benchmark on representative devices

**Global Search Index Design:**
- **Gap:** Research didn't cover optimal search index structure for cross-entity search (leads + emendas + propostas + convenios)
- **Mitigation:** Run /gsd:research-phase before Phase 4 planning, focus on PostgreSQL full-text search vs. application-level search, evaluate search relevance ranking strategies
- **Address:** Phase 4 research-phase - dedicated search architecture investigation

**Chart Data Volume Performance:**
- **Gap:** Research mentions WebGL and sampling for large datasets but doesn't specify thresholds for PROJETUS data volume
- **Mitigation:** Measure actual data sizes per chart during Phase 2 implementation, implement Plotly WebGL traces (automatic at 1,000+ points), add optional sampling if datasets exceed 10k points
- **Address:** Phase 2 implementation - performance testing with production data

## Sources

### Primary (HIGH confidence)
- **Streamlit Official Documentation** - Theming configuration, st.html API, st.plotly_chart integration, multi-page apps, session state, Google Fonts integration
- **Plotly Python 6.5.2 PyPI** - Version verification, feature confirmation, WebGL rendering capabilities
- **STACK.md, ARCHITECTURE.md, FEATURES.md, PITFALLS.md** - Synthesized from parallel research agents

### Secondary (MEDIUM confidence)
- **Microsoft Streamlit UI Template (GitHub)** - Component wrapper patterns, CSS organization, best practices
- **Streamlit Community Best Practices** - Session state management, code organization, performance optimization
- **2026 Dashboard Design Resources** - Glassmorphism trends, dark theme UX, sales dashboard feature benchmarks (Salesforce, HubSpot patterns)
- **Medium: Streamlit Development Best Practices** - Structuring code, managing session state, avoiding common pitfalls

### Tertiary (LOW confidence)
- **CSS Glassmorphism Examples** - Visual inspiration, implementation patterns (needs validation for performance)
- **Sales Dashboard UX Patterns** - Feature expectations from competitors (needs validation with PROJETUS users)

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
