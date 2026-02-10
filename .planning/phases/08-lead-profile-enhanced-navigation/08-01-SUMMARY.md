---
phase: 08-lead-profile-enhanced-navigation
plan: 01
subsystem: data-layer
tags: [queries, search, lead-profile, tier-classification]
dependency_graph:
  requires:
    - src/dashboard/config.py (run_query function)
    - src/loader/db_models.py (schema understanding)
  provides:
    - src/dashboard/queries/search.py (cross-entity search)
    - src/dashboard/queries/lead_profile.py (lead overview/details)
    - src/dashboard/utils/tiers.py (tier classification)
  affects:
    - Plan 08-02 (lead profile page will consume these queries)
    - Plan 08-03 (global search will consume search_entities)
tech_stack:
  added:
    - Cross-entity UNION ALL search pattern
    - Tier classification utility (HIGH/MEDIUM/LOW)
  patterns:
    - Parameterized SQL via run_query() (SQL injection prevention)
    - 5-minute cache TTL for search/lead queries
    - Python-side tier computation (keeps SQL simple)
key_files:
  created:
    - src/dashboard/queries/search.py (77 lines)
    - src/dashboard/queries/lead_profile.py (187 lines)
    - src/dashboard/utils/__init__.py (1 line)
    - src/dashboard/utils/tiers.py (49 lines)
  modified: []
decisions:
  - title: "Virgin proponents = HIGH tier"
    rationale: "0 propostas means untapped market (never competed for government transfers)"
  - title: "5-minute cache for search queries"
    rationale: "Lower than entity queries (30m) since search results change more frequently with new data"
  - title: "Python-side tier computation"
    rationale: "Keeps SQL simple, allows complex business logic without database function deployment"
  - title: "Relevance ranking 3-2-1"
    rationale: "Proponentes highest (direct leads), propostas medium (opportunities), programas lowest (context)"
metrics:
  duration: 122
  tasks_completed: 2
  files_created: 4
  files_modified: 0
  commits: 2
  completed_date: 2026-02-10
---

# Phase 08 Plan 01: Lead Profile Data Layer Summary

**One-liner:** Cross-entity search with UNION ALL relevance ranking and centralized tier classification utility (HIGH/MEDIUM/LOW based on propostas/emendas/convenios)

## What Was Built

Created the complete data layer foundation for lead profile and global search features:

1. **Cross-entity search module** (`src/dashboard/queries/search.py`):
   - `search_entities()` function with UNION ALL across proponentes, propostas, programas
   - Relevance scoring: proponentes=3, propostas=2, programas=1
   - Parameterized ILIKE search (prevents SQL injection)
   - 5-minute cache TTL for responsive search

2. **Lead profile queries module** (`src/dashboard/queries/lead_profile.py`):
   - `get_lead_overview()` - Complete proponente data with tier classification
   - `get_lead_emendas()` - Emendas with parlamentar/ministerio details
   - `get_lead_propostas()` - Propostas with programa associations
   - `get_lead_ministerios()` - Orgao aggregations by proposal count
   - `get_lead_programas()` - Programa aggregations by proposal count

3. **Tier classification utility** (`src/dashboard/utils/tiers.py`):
   - `calculate_value_tier()` - HIGH/MEDIUM/LOW classification
   - `TIER_COLORS` - Sigma brand colors for tier display
   - Business logic: virgin proponents (0 propostas) = HIGH, high-value with convenios = HIGH, low competition + moderate value = MEDIUM, rest = LOW

## Technical Approach

**Query patterns:**
- All queries use `run_query()` from config.py (established pattern)
- Parameterized SQL with `:param_name` syntax (no string interpolation)
- `@st.cache_data(ttl="5m")` decorators for performance

**Search architecture:**
- UNION ALL pattern combines three entity types
- ORDER BY relevance_score DESC, nome ASC for ranked results
- ILIKE for case-insensitive partial matching

**Tier classification:**
- Computed Python-side after query (not in SQL)
- Centralizes business logic in single utility function
- Reusable across all UI components

## Verification Results

All verification checks passed:

- ✓ All three modules import cleanly
- ✓ search_entities function available with correct signature
- ✓ Five lead profile functions available with documented parameters
- ✓ calculate_value_tier logic verified:
  - Virgin proponents (0, 0, 0) → HIGH
  - Low competition moderate value (2, 500K, 0) → MEDIUM
  - High competition (5, 50K, 0) → LOW
  - High value with convenios (1, 1.5M, 1) → HIGH
- ✓ Parameterized queries prevent SQL injection
- ✓ All queries follow run_query() pattern

## Deviations from Plan

**None** - plan executed exactly as written.

## Dependencies & Integration

**This plan provides:**
- Data layer for Plan 08-02 (lead profile page)
- Search function for Plan 08-03 (global search component)
- Tier utility for cross-UI value visualization

**Future integration points:**
- Lead profile page will call get_lead_overview/emendas/propostas/ministerios/programas
- Global search will call search_entities and navigate to entity-specific pages
- Tier colors can be used in KPI cards, badges, and filters

## Success Criteria Status

- ✅ Cross-entity search function ready for global search component
- ✅ Lead profile queries ready for lead profile page
- ✅ Tier classification centralized in single utility
- ✅ All functions follow existing codebase patterns (caching, run_query, parameterized SQL)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 9602856 | Create cross-entity search queries and tier utility |
| 2 | 001323a | Create lead profile query functions |

## Self-Check: PASSED

All created files exist:
- ✓ src/dashboard/queries/search.py
- ✓ src/dashboard/queries/lead_profile.py
- ✓ src/dashboard/utils/__init__.py
- ✓ src/dashboard/utils/tiers.py

All commits exist in git log:
- ✓ 9602856 (Task 1)
- ✓ 001323a (Task 2)

## Next Steps

Plan 08-01 is complete. Ready to proceed to:
- **Plan 08-02:** Lead profile page UI (consumes these queries)
- **Plan 08-03:** Global search component (consumes search_entities)

---
*Execution date: 2026-02-10*
*Duration: 122 seconds (~2 minutes)*
*Model: Claude Sonnet 4.5*
