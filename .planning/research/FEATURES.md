# Feature Research: Premium Streamlit Dashboard UI/UX Redesign

**Domain:** Sales-focused data dashboard (lead qualification)
**Researched:** 2026-02-09
**Confidence:** MEDIUM

## Executive Summary

Premium sales dashboards in 2026 are defined by three core pillars: real-time interactivity with visual analytics, AI-powered insights with predictive lead scoring, and mobile-first responsive design with glassmorphic aesthetics. For a Streamlit-based dashboard, success requires understanding what's table stakes (expected by all users), what differentiates (competitive advantage), and critically, what to avoid building given Streamlit's architectural constraints.

The PROJETUS dashboard targets sales reps qualifying leads from Transfer Gov data. The primary workflow is research-driven: browse ranked leads, search for specific organizations, then drill into full profiles. The target aesthetic is dark cyberpunk-tech with neon blue on navy and glassmorphic cards (Sigma brand).

**Key Finding:** Modern sales dashboards must balance visual polish with performance. Streamlit's re-run architecture makes certain "premium" features (real-time collaboration, complex animations, sub-second interactivity) either impossible or performance killers. Success means ruthlessly prioritizing features that Streamlit handles well (data viz, filtering, drill-down) while using CSS to create visual premium feel without fighting the framework.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any modern sales dashboard. Missing these = product feels incomplete or dated.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Dark theme with professional aesthetics** | Dark mode is standard for 2026 data dashboards; light themes feel dated for sales tools | LOW | Streamlit native theming via config.toml. Fully supported, straightforward implementation. |
| **Real-time data freshness indicators** | Sales teams need to know if data is current or stale; "as of [timestamp]" is expected | LOW | Already exists in PROJETUS (home page shows extraction history). Just needs visual prominence. |
| **Mobile-responsive layout** | 60%+ of dashboard traffic is mobile in 2026; sales reps check leads on phones | MEDIUM | Streamlit layout="wide" + st.columns with responsive breakpoints. CSS media queries needed for polish. |
| **Fast search/filtering** | Users expect sub-second search response for lead lookup by name/CNPJ | LOW | Already implemented. Performance depends on data size; OK for <10K rows. |
| **Clear visual hierarchy (cards, sections)** | Flat layouts feel amateur; users expect grouped information in visual cards | MEDIUM | CSS-based card styling via st.markdown with unsafe_allow_html. Achievable with custom CSS. |
| **Drill-down to detail views** | Users expect to click a lead and see full profile with tabs/sections | LOW | Already implemented in qualificacao_new.py. Standard Streamlit pattern with st.tabs. |
| **Data export (CSV)** | Sales teams need to export lead lists for CRM import or offline analysis | LOW | Already implemented. Standard expectation for any B2B dashboard. |
| **Loading states / progress indicators** | Users need feedback during data loads; blank screens feel broken | LOW | Streamlit native st.spinner, st.progress. Easy to implement. |
| **Metric cards with KPIs** | Dashboard must show high-level metrics (total leads, value, etc.) at top | LOW | Already implemented with st.metric. Standard pattern. |
| **Filtering with immediate visual feedback** | Filter changes must update results without page reload feel | MEDIUM | Streamlit native re-run handles this. Performance degrades with >5K rows. |

### Differentiators (Competitive Advantage)

Features that set PROJETUS apart from generic dashboards. Not required, but highly valued for premium positioning.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Glassmorphic card design (dark theme)** | Creates premium "Sigma brand" aesthetic; signals quality and modernity | MEDIUM | CSS backdrop-filter + rgba backgrounds. Works in modern browsers. Performance cost is minimal (static elements). |
| **Visual lead value indicators (color-coded badges)** | Instant recognition of high-value leads without reading numbers; faster decision-making | LOW | Already implemented with emoji badges. Enhance with color-coded visual pills via CSS. |
| **Interactive charts for lead distribution** | Visual analytics reduce cognitive load; users understand patterns faster than tables | MEDIUM | Plotly/Altair integration. Streamlit native support. Interactive hover, zoom, filter. |
| **Global search with smart filters** | Search across all entities (leads, emendas, propostas) from single input; reduces navigation friction | HIGH | Requires custom search index across multiple data tables. Complex state management in Streamlit. |
| **Lead profile page (dedicated view)** | Deep-dive into single lead with all related data (emendas, propostas, convenios, contact); sales workflow optimization | MEDIUM | Separate page with URL parameters for lead ID. Streamlit st.query_params for routing. |
| **Visual ranking indicators (1-10 visual scale)** | Progress bars or visual scales for lead quality; easier to scan than numbers | LOW | CSS-based progress bars or st.progress. Simple visual enhancement. |
| **Comparison view (side-by-side leads)** | Compare 2-3 leads at once; faster qualification decisions | MEDIUM | st.columns with synchronized data. State management for selected leads. |
| **Animated transitions (subtle)** | Smooth fade-ins for cards/metrics create polished feel | MEDIUM-HIGH | CSS animations work but Streamlit re-runs can cause flicker. Must be subtle to avoid janky UX. |
| **Customizable dashboard layout** | Users can rearrange or hide KPI cards; personalization increases engagement | HIGH | Requires persistent state (database or cookies). Complex in Streamlit's stateless model. |
| **Data freshness auto-refresh** | Dashboard auto-updates when new data is available (e.g., every 5 min) | MEDIUM | st.rerun() on timer. Works but can be jarring for users. Better with visual "new data available" banner. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems in Streamlit or sales dashboard context. Document why to avoid scope creep.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Real-time collaboration (multi-user editing)** | "Like Google Docs - see what others are doing" | Streamlit's stateless architecture makes this nearly impossible without complex WebSocket custom components. Performance killer. | Use shared filters via URL parameters; export/import saved views. |
| **Complex animations (loading, transitions)** | "Make it feel like a modern SPA" | Streamlit re-runs entire script on every interaction, causing flicker/jank with animations. CSS animations fight the framework. | Subtle fade-ins on static elements only. Embrace Streamlit's re-run model; optimize for speed over flash. |
| **Infinite scroll** | "Load more leads as user scrolls" | Streamlit re-renders entire dataframe on scroll; performance degrades rapidly. Not natively supported. | Pagination with "Load More" button or configurable page size (25/50/100 rows). |
| **Drag-and-drop dashboard customization** | "Let users build their own layout" | Requires custom JavaScript components; breaks on Streamlit re-runs. High maintenance burden. | Predefined layout variants (e.g., "Compact" vs "Detailed" view) via toggle. |
| **Sub-second search with autocomplete** | "Search as you type with suggestions" | Every keystroke triggers full re-run in Streamlit. Laggy with large datasets. | Debounced search (search on Enter or after 500ms pause). Pre-computed search index. |
| **Complex interactive charts (brushing/linking)** | "Select data on chart, filter dashboard" | Streamlit's Plotly/Altair integration has limited bidirectional interaction. Custom components needed. | Click to filter on simple categorical data (e.g., click state on chart). Avoid complex multi-chart linking. |
| **Embedded video/multimedia** | "Add demo videos for leads" | Increases page load time; Streamlit isn't optimized for media. Distracts from data focus. | External links to videos; focus dashboard on data, not content. |
| **Chat/comments on leads** | "Collaborate on lead notes" | Requires database writes, user auth, real-time sync. Out of scope for Streamlit dashboard. | Export lead data to CRM where collaboration happens. Dashboard is read-only analytics. |
| **Email/CRM integration** | "Send email to lead from dashboard" | Streamlit dashboards are read-only analytics tools, not CRMs. Adding write operations increases complexity/security risks. | Provide email addresses for copy-paste; integrate at CRM level, not dashboard. |
| **3D visualizations** | "3D charts look futuristic" | Novelty without value for sales data. Increases cognitive load, hurts performance. | Stick to 2D charts (bar, line, scatter). Use color/size for additional dimensions. |

## Feature Dependencies

```
Dark Theme (config.toml)
    └──requires──> Glassmorphic Cards (CSS with backdrop-filter)
                       └──enhances──> Visual Hierarchy (cards + sections)

Interactive Charts (Plotly/Altair)
    └──requires──> Chart Theme Config (matching dark theme)

Lead Profile Page
    └──requires──> URL Parameter Routing (st.query_params)
    └──enhances──> Visual Ranking Indicators (displayed on profile)
    └──enhances──> Comparison View (link from profile to compare)

Global Search
    └──requires──> Search Index (pre-computed)
    └──requires──> Unified Data Model (across entities)
    └──conflicts──> Real-time Autocomplete (performance)

Mobile Responsive Layout
    └──requires──> CSS Media Queries
    └──requires──> Simplified Mobile Navigation
    └──conflicts──> Complex Multi-column Layouts (too much on mobile)
```

### Dependency Notes

- **Dark Theme enables Glassmorphic Cards:** Glassmorphism (frosted glass effect) only works visually on dark backgrounds. Light theme + glassmorphism looks washed out. Must implement dark theme first.

- **Lead Profile Page enhances Comparison View:** Profile page can have "Compare with..." button. Comparison view links back to individual profiles. Bidirectional navigation.

- **Global Search conflicts with Real-time Autocomplete:** Global search requires querying multiple tables. Doing this on every keystroke (autocomplete) will lag. Must choose: debounced search or autocomplete on single entity.

- **Mobile Responsive conflicts with Complex Layouts:** Multi-column layouts (4+ columns) don't fit on mobile. Must have simplified mobile view with collapsible sections.

## MVP Recommendation (Milestone Scope)

This milestone adds premium UI/UX to existing functional dashboard. Prioritize features that maximize visual impact with minimal Streamlit fighting.

### Phase 1: Visual Foundation (Week 1)
Establish premium look-and-feel with CSS theming.

- [ ] **Dark cyberpunk theme** - config.toml + custom CSS for navy/neon blue Sigma brand
- [ ] **Glassmorphic card components** - Reusable CSS card wrapper for metrics, tables, filters
- [ ] **Visual hierarchy refinement** - Spacing, typography, section headers with visual weight
- [ ] **Loading state polish** - Branded st.spinner with Sigma colors

**Rationale:** Visual impact is high, complexity is low. Pure CSS work. Sets foundation for all subsequent features. Users immediately see "premium" feel.

### Phase 2: Data Visualization (Week 1-2)
Add interactive charts to replace/enhance table-only views.

- [ ] **Lead distribution charts** - Plotly bar charts for leads by state, ministry, value tier
- [ ] **Trend visualization** - Line chart for proposals over time (if historical data available)
- [ ] **Chart theming** - Match dark theme with Streamlit chart config
- [ ] **Interactive tooltips** - Hover for details on chart elements

**Rationale:** Charts reduce cognitive load for sales reps. Streamlit has native Plotly/Altair support. Interactive features come free with libraries. High value, medium-low effort.

### Phase 3: Enhanced Navigation & Search (Week 2)
Improve user flow for lead discovery.

- [ ] **Lead profile dedicated page** - Deep-dive view with URL routing via st.query_params
- [ ] **Enhanced search UI** - Visual search bar in sidebar with clear affordances
- [ ] **Visual ranking indicators** - Color-coded value badges + progress bars for lead scores
- [ ] **Breadcrumb navigation** - Show current location (e.g., "Qualificacao > Lead Profile > CNPJ 12.345.678/0001-90")

**Rationale:** Sales workflow is search > browse > drill-down. Optimizing this flow has direct business impact. Medium complexity but core to UX.

### Phase 4: Polish & Responsiveness (Week 2-3)
Final touches for professional feel.

- [ ] **Mobile responsive layout** - CSS media queries for tablet/phone
- [ ] **Subtle animations** - Fade-in for cards (CSS only, no JavaScript)
- [ ] **Data freshness prominence** - Visual indicator in header (e.g., "Updated 2h ago" with icon)
- [ ] **Export UX improvement** - Better export button styling, add "Export filtered results" option

**Rationale:** Polish features that don't affect core functionality but complete the premium feel. Mobile support is table stakes but can be added after desktop UX is solid.

### Defer to Post-MVP

Features that are valuable but out of scope for this milestone:

- [ ] **Global cross-entity search** - Requires search index architecture. Complex. Defer until user feedback confirms need.
- [ ] **Comparison view (side-by-side leads)** - Nice-to-have for power users. Not core workflow. Add if users request.
- [ ] **Customizable dashboard layout** - High complexity for Streamlit. Only add if users actively complain about fixed layout.
- [ ] **Auto-refresh on new data** - Can be jarring. Better to add "Check for updates" manual button first, auto-refresh only if users want it.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Dark cyberpunk theme | HIGH | LOW | **P1** | Foundation for brand identity. Pure CSS. |
| Glassmorphic cards | HIGH | MEDIUM | **P1** | Signature visual style. CSS backdrop-filter. |
| Interactive charts (lead distribution) | HIGH | MEDIUM | **P1** | Reduce cognitive load. Native Streamlit support. |
| Visual ranking indicators | HIGH | LOW | **P1** | Faster lead qualification. Simple CSS enhancement. |
| Lead profile page | HIGH | MEDIUM | **P1** | Core sales workflow. Medium routing complexity. |
| Mobile responsive layout | HIGH | MEDIUM | **P1** | Table stakes for 2026. CSS media queries. |
| Loading state polish | MEDIUM | LOW | **P2** | Professional feel. Low effort, nice-to-have. |
| Data freshness visual indicator | MEDIUM | LOW | **P2** | Builds trust. Simple timestamp display. |
| Enhanced search UI | MEDIUM | LOW | **P2** | Visual polish for existing feature. |
| Subtle card animations | MEDIUM | MEDIUM | **P2** | Premium feel but must avoid flicker. Test carefully. |
| Comparison view (side-by-side) | MEDIUM | MEDIUM | **P2** | Power user feature. Not essential. |
| Breadcrumb navigation | MEDIUM | LOW | **P2** | Helpful but not critical. Easy to add. |
| Global cross-entity search | HIGH | HIGH | **P3** | High value but complex. Defer until needed. |
| Customizable layout | LOW | HIGH | **P3** | Low ROI for sales dashboard. Avoid unless requested. |
| Auto-refresh | MEDIUM | MEDIUM | **P3** | Can be disruptive. Manual refresh better. |
| Chart brushing/linking | LOW | HIGH | **P3** | Complex custom components. Avoid in Streamlit. |

**Priority key:**
- **P1:** Must have for milestone completion. Core premium redesign.
- **P2:** Should have if time permits. Enhances polish.
- **P3:** Nice to have, future consideration. Defer to later milestones.

## Streamlit-Specific Constraints

Critical limitations to acknowledge when planning features:

### Architecture Constraints

1. **Full re-run on every interaction** - Every button click, filter change, or search keystroke re-executes the entire Python script. This makes real-time interactions (autocomplete, live collaboration) laggy or impossible.

2. **Stateless by default** - Session state must be explicitly managed. Complex multi-step workflows (wizards, multi-page forms) require careful state management.

3. **Limited CSS customization** - No direct CSS file support. Must inject via st.markdown with unsafe_allow_html=True (which may be deprecated). Custom styling is hacky.

4. **Single-threaded per session** - Each user session runs in one Python process. Heavy computation blocks UI. Must use st.cache_data for performance.

### Performance Constraints

1. **Large dataframes (>5K rows) slow down** - Streamlit re-renders entire dataframe on every interaction. Pagination or virtual scrolling not natively supported.

2. **Chart rendering is blocking** - Complex Plotly charts can take 1-2 seconds to render, blocking other UI updates.

3. **No incremental updates** - Can't update just one metric; entire page re-renders. Makes dashboards with many metrics feel slow.

### UX Constraints

1. **No true SPA feel** - Page "flickers" on re-run (though Streamlit tries to minimize this). Can't achieve buttery-smooth transitions like React apps.

2. **Limited interactivity between components** - Can't easily do "click chart to filter table" without custom components. Plotly/Altair events have limited Streamlit integration.

3. **Mobile UX is desktop-first** - Streamlit is optimized for desktop. Mobile works but requires extra CSS effort for polish.

### Browser Compatibility

1. **Glassmorphic backdrop-filter** - Requires modern browsers (Chrome 76+, Firefox 103+, Safari 15.4+). Fallback needed for older browsers.

2. **CSS Grid/Flexbox** - Streamlit uses modern CSS but must test on target browsers (sales teams often use corporate IT with older browsers).

## Competitor Feature Analysis (Implicit Benchmarks)

Sales dashboard users have implicit expectations from tools they've used:

| Feature Category | Standard Expectation (Salesforce, HubSpot, etc.) | PROJETUS Approach |
|------------------|--------------------------------------------------|-------------------|
| **Lead scoring** | Numeric score (0-100) with color coding | Value badges (Verde/Alto/Bom/Regular) + color highlights |
| **Search** | Instant autocomplete, search history | Debounced search on Enter, no autocomplete (Streamlit limitation) |
| **Filtering** | Multi-select filters with "Apply" button | Immediate filter application (Streamlit native) |
| **Data visualization** | Interactive charts with drill-down | Plotly charts with hover, limited drill-down (Streamlit constraint) |
| **Lead profiles** | Dedicated page with tabs (Activity, Contact, History) | Tabs for Emendas, Propostas, Convenios, Historico (matches pattern) |
| **Mobile** | Native app with offline mode | Responsive web app, online-only (Streamlit limitation) |
| **Collaboration** | Comments, tags, assignment | Export-only, no collaboration (out of scope for analytics dashboard) |
| **Customization** | User-specific views, saved filters | No customization (Streamlit complexity, defer) |

**Key Takeaway:** PROJETUS can match core expectations (search, filtering, charts, profiles) but must set different expectations for advanced features (collaboration, customization, real-time). Position as "analytics dashboard" not "CRM replacement."

## Sources

### Dashboard Design Best Practices (2026)
- [Curated Dashboard Design Examples for UI Inspiration (2026) | Muzli Blog](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/)
- [9 Dashboard Design Principles (2026) | DesignRush](https://www.designrush.com/agency/ui-ux-design/dashboard/trends/dashboard-design-principles)
- [Dashboard Design: Best Practices & How-Tos 2026](https://improvado.io/blog/dashboard-design-guide)
- [Understanding data visualization dashboards in 2026](https://www.fanruan.com/en/blog/data-visualization-dashboard-key-metrics)
- [Dashboard Design UX Patterns Best Practices - Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)

### Sales Dashboard Specific
- [Lead analytics dashboard: 7 metrics every sales team needs in 2026](https://monday.com/blog/crm-and-sales/lead-analytics-dashboard/)
- [Sales Dashboard: Insights & Real-World Examples 2026](https://improvado.io/blog/sales-dashboard)
- [UI Trends in 2026 for SaaS Companies - TFC](https://www.thefrontendcompany.com/posts/ui-trends)

### Streamlit Capabilities & Limitations
- [Theming - Streamlit Docs](https://docs.streamlit.io/develop/concepts/configuration/theming)
- [Chart elements - Streamlit Docs](https://docs.streamlit.io/develop/api-reference/charts)
- [A new Streamlit theme for Altair and Plotly charts](https://blog.streamlit.io/a-new-streamlit-theme-for-altair-and-plotly/)
- [Streamlit Supports 5 Important Data Visualization Libraries](https://alanjones2.github.io/streamlit-chart-varieties/)
- [How to Build a Minimalistic Streamlit Dashboard That Actually Looks Good — A Step-by-Step Guide | Medium](https://medium.com/data-science-collective/how-to-build-a-minimalistic-streamlit-dashboard-that-actually-looks-good-a-step-by-step-guide-ef5d803ae4a2)
- [15 Pros & Cons of Streamlit [2026] - DigitalDefynd](https://digitaldefynd.com/IQ/pros-cons-of-streamlit/)

### Glassmorphism & Modern UI Design
- [Dark Glassmorphism: The Aesthetic That Will Define UI in 2026 | Medium](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f)
- [Glassmorphism: What It Is and How to Use It in 2026 - The Inverness Design Studio](https://invernessdesignstudio.com/glassmorphism-what-it-is-and-how-to-use-it-in-2026)
- [How to Create Glassmorphic UI Effects with Pure CSS](https://blog.openreplay.com/create-glassmorphic-ui-css/)
- [64 CSS Glassmorphism Examples](https://freefrontend.com/css-glassmorphism/)

### Search & Navigation UX
- [6 Essential Search UX Best Practices for 2026 | DesignRush](https://www.designrush.com/best-designs/websites/trends/search-ux-best-practices)
- [Master Search UX in 2026: Best Practices, UI Tips & Design Patterns](https://www.designmonks.co/blog/search-ux-best-practices)
- [st.navigation - Streamlit Docs](https://docs.streamlit.io/develop/api-reference/navigation/st.navigation)
- [Build a custom navigation menu with st.page_link - Streamlit Docs](https://docs.streamlit.io/develop/tutorials/multipage/st.page_link-nav)

---
*Feature research for: PROJETUS Premium Dashboard UI/UX Redesign*
*Researched: 2026-02-09*
*Confidence: MEDIUM (Web search + official Streamlit docs; no hands-on testing of all features)*
