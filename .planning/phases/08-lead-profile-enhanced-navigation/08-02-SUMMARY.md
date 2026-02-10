---
phase: 08-lead-profile-enhanced-navigation
plan: 02
subsystem: ui-pages
tags: [lead-profile, navigation, kpi-cards, tabs, quick-actions]
dependency_graph:
  requires:
    - src/dashboard/queries/lead_profile.py (Plan 08-01)
    - src/dashboard/utils/tiers.py (Plan 08-01)
    - src/dashboard/components/kpi.py (Phase 6)
  provides:
    - src/dashboard/pages/lead_profile.py (dedicated lead profile page)
    - Lead Profile navigation entry in streamlit_app.py
  affects:
    - Plan 08-03 (global search will navigate to this page)
    - Future lead workflow features
tech_stack:
  added:
    - Dedicated lead profile page with tabbed data sections
    - Tier badge visualization with Sigma brand colors
    - Quick actions (CSV export, CNPJ copy, back navigation)
  patterns:
    - Session state guard clause for selected_lead_cnpj
    - KPI row component for value summary
    - Tabbed content organization (Emendas, Propostas, Ministerios, Programas)
    - format_cnpj utility function (copied from qualificacao_new.py)
key_files:
  created:
    - src/dashboard/pages/lead_profile.py (248 lines)
  modified:
    - src/dashboard/streamlit_app.py (added lead_profile_page function and navigation entry)
decisions:
  - title: "Session state already initialized"
    rationale: "selected_lead_cnpj and selected_lead_name session state keys already exist (added by another process), only needed to add page function and navigation entry"
  - title: "Guard clause for missing lead selection"
    rationale: "Friendly warning message guides users to Qualificacao or global search when no lead is selected"
  - title: "Tier badge in header"
    rationale: "Inline HTML styling for tier badge provides immediate visual value indicator using Sigma brand colors"
  - title: "Copy CNPJ functionality via st.code()"
    rationale: "st.code() has built-in copy button, simpler than custom implementation"
metrics:
  duration: 183
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 2
  completed_date: 2026-02-10
---

# Phase 08 Plan 02: Lead Profile Page UI Summary

**One-liner:** Dedicated lead profile page with tier badge, KPI cards, contact info, tabbed data sections (emendas/propostas/ministerios/programas), and quick actions (CSV export, CNPJ copy)

## What Was Built

Created the complete UI layer for the lead profile page, the core sales workflow page for deep-dive proponent research:

1. **Lead profile page** (`src/dashboard/pages/lead_profile.py`):
   - Guard clause checks for `selected_lead_cnpj` in session state
   - Header with proponente name and tier badge (HIGH/MEDIUM/LOW with Sigma brand colors)
   - KPI value summary row: Tier, Total Emendas value, Total Propostas count, Convenios count
   - Contact info section: Email, Telefone, Endereco (3-column layout)
   - Quick actions row: CSV export button, CNPJ copy code block, back to Qualificacao button
   - Tabbed content with 4 tabs:
     - **Emendas**: Shows emendas with parlamentar, valor, tipo, ministerio (up to 100 records)
     - **Propostas**: Shows propostas with titulo, situacao, valor, data, programa (up to 100 records)
     - **Ministerios/Orgaos**: Aggregated view of orgaos by proposta count
     - **Programas**: Aggregated view of programas by proposta count

2. **Navigation registration** (`src/dashboard/streamlit_app.py`):
   - Added `lead_profile_page()` function with lazy import pattern
   - Registered page in st.navigation with "Lead Profile" title and "👤" icon
   - Session state for `selected_lead_cnpj` and `selected_lead_name` already initialized

## Technical Approach

**UI patterns:**
- Session state guard clause prevents errors when no lead is selected
- Tier badge rendered with inline HTML for color customization (Sigma brand colors from TIER_COLORS)
- KPI row component from Phase 6 for value summary (4 glassmorphic cards)
- All data tables use `st.dataframe()` with `use_container_width=True, hide_index=True`
- Currency formatting: R$ X.XXM for large values, R$ X,XXX.XX for exact amounts
- Tab organization provides clear data segmentation

**Data integration:**
- All queries use functions from `src/dashboard/queries/lead_profile.py` (Plan 08-01)
- Tier classification from `src/dashboard/utils/tiers.py` (Plan 08-01)
- KPI cards from `src/dashboard.components.kpi.py` (Phase 6)
- format_cnpj utility copied from qualificacao_new.py pattern

**Quick actions:**
- CSV export uses `lead_data.to_csv()` with single-row DataFrame (all proponente fields)
- CNPJ copy uses `st.code()` built-in copy functionality (no custom implementation needed)
- Back navigation uses `st.switch_page()` to return to Qualificacao page

## Verification Results

All verification checks passed:

- ✓ lead_profile.py imports cleanly without errors
- ✓ render_lead_profile function available
- ✓ streamlit_app.py imports successfully
- ✓ Navigation includes Lead Profile page entry (7 total pages)
- ✓ Session state keys for lead context initialized
- ✓ All query functions properly imported and used
- ✓ KPI row component integrated for value summary
- ✓ Tier colors from tiers.py used for badge styling

## Deviations from Plan

**Minor deviations (auto-fixed):**

**1. [Rule 3 - Blocking Issue] Session state already initialized**
- **Found during:** Task 2
- **Issue:** Plan expected to add session state initialization for selected_lead_cnpj/name, but keys already exist
- **Fix:** Skipped session state initialization, only added page function and navigation entry
- **Files modified:** src/dashboard/streamlit_app.py
- **Commit:** 03fb2ff (Task 2)
- **Rationale:** Another process already added these keys (likely global search component work)

## Dependencies & Integration

**This plan provides:**
- Dedicated lead profile page for Plan 08-03 (global search will navigate here)
- Complete proponent deep-dive UI for sales workflow
- Reusable lead profile pattern for future features

**Future integration points:**
- Global search component (Plan 08-03) will set selected_lead_cnpj and navigate to this page
- Qualificacao page can add "View Profile" buttons that navigate here
- Enhanced navigation features can use this as destination for proponent links

## Success Criteria Status

- ✅ Lead profile page displays proponente name, contact info, and tier badge
- ✅ KPI summary cards show tier, emendas value, propostas count, convenios
- ✅ Related data organized in 4 tabs (Emendas, Propostas, Ministerios, Programas)
- ✅ Quick actions include CSV export and CNPJ copy functionality
- ✅ Lead profile page accessible via st.navigation
- ✅ Session state routing ready for global search integration
- ✅ Guard clause shows helpful warning when no lead selected
- ✅ All data sections populated from lead_profile queries

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 529cbb6 | Create lead profile page with tabs, KPIs, and quick actions |
| 2 | 03fb2ff | Register lead profile page in app navigation |

## Self-Check: PASSED

All created files exist:
- ✓ src/dashboard/pages/lead_profile.py

All modified files updated:
- ✓ src/dashboard/streamlit_app.py

All commits exist in git log:
- ✓ 529cbb6 (Task 1)
- ✓ 03fb2ff (Task 2)

## Next Steps

Plan 08-02 is complete. Ready to proceed to:
- **Plan 08-03:** Global search component (will navigate to this lead profile page)
- Global search will use `search_entities()` from Plan 08-01
- Global search will set `selected_lead_cnpj` and navigate to lead_profile.py

---
*Execution date: 2026-02-10*
*Duration: 183 seconds (~3 minutes)*
*Model: Claude Sonnet 4.5*
