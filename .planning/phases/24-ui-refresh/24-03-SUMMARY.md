---
phase: 24-ui-refresh
plan: "03"
subsystem: ui
tags: [mobile, vaul, drawer, responsive, nav, dark-mode, newsbanner, tailwind]

requires:
  - phase: 24-01
    provides: dark-mode-infrastructure, ThemeToggle, Providers wrapper, brand-text-hub-da-projetos
  - phase: 24-02
    provides: collapsible-sidebar-with-cookie-persistence, sidebar-actions-server-action

provides:
  - mobile-bottom-drawer-navigation
  - shared-nav-items-helper
  - responsive-desktop-sidebar-hidden-on-mobile
  - newsbanner-v4.7-ui-refresh

affects: [web/src/app/layout.tsx, web/src/components/Sidebar.tsx, web/src/components/MobileDrawer.tsx, web/src/lib/sidebar-nav-items.ts, web/src/components/NewsBanner.tsx]

tech-stack:
  added: [vaul@^1.1.2]
  patterns:
    - "vaul bottom drawer with useEffect pathname-close workaround (issue #631)"
    - "Shared getNavItemsForRole() helper in sidebar-nav-items.ts — single source of truth for nav items"
    - "hidden md:flex on desktop aside — Tailwind responsive hiding pattern for sidebar"
    - "md:ml-* on main — responsive margin offset only applied when desktop sidebar is visible"

key-files:
  created:
    - web/src/components/MobileDrawer.tsx
    - web/src/lib/sidebar-nav-items.ts
  modified:
    - web/src/components/Sidebar.tsx
    - web/src/app/layout.tsx
    - web/src/components/NewsBanner.tsx
    - web/package.json

key-decisions:
  - "vaul issue #631 workaround: useEffect(() => setOpen(false), [pathname]) closes drawer on Next.js navigation (confirmed via research)"
  - "Each nav Link also calls onClick={() => setOpen(false)} for instant feedback alongside the pathname useEffect"
  - "Desktop sidebar hidden via hidden md:flex — mobile layout has no fixed sidebar to offset, so main gets zero left margin on mobile"
  - "md:ml-56 / md:ml-14 on main — prefix ensures margin only applies at viewport >= 768px"
  - "NavIcons not used in MobileDrawer — labels sufficient on mobile (icons deferred to follow-up per plan scope)"
  - "ThemeToggle reused in MobileDrawer footer — same component as desktop sidebar"

patterns-established:
  - "Shared nav-items module: getNavItemsForRole() in lib/sidebar-nav-items.ts avoids duplication drift between desktop and mobile nav"
  - "vaul Drawer: always import from 'vaul', use Drawer.Root/Portal/Overlay/Content pattern"

requirements-completed: [UI-03]

duration: ~10min
completed: 2026-04-28
---

# Phase 24 Plan 03: Mobile Bottom Drawer Navigation Summary

**vaul-based mobile bottom drawer with role-aware nav items, pathname-close workaround for Next.js, and shared getNavItemsForRole() helper extracted from Sidebar.tsx — completes UI-03 and all Phase 24 requirements**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-28T13:10:00Z
- **Completed:** 2026-04-28T13:20:00Z
- **Tasks:** 2 auto + 1 checkpoint (human verify: APPROVED)
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Created `web/src/lib/sidebar-nav-items.ts` with `getNavItemsForRole()` — extracts all 14 role branches from Sidebar.tsx into a shared module, eliminating duplication risk
- Created `web/src/components/MobileDrawer.tsx` with vaul Drawer, `md:hidden` hamburger trigger, pathname-close useEffect (vaul #631 workaround), ThemeToggle + logout footer
- Refactored Sidebar.tsx to use shared helper, removed inline nav constants, added `hidden md:flex` to hide desktop sidebar on mobile
- Updated layout.tsx to render MobileDrawer for session users and use `md:ml-*` for main margin (mobile has no sidebar to offset)
- Bumped NewsBanner to v4.7 with 4 UI-refresh release notes; Sidebar footer updated to v4.7

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vaul, extract nav-items helper, create MobileDrawer** - `6a01b48` (feat)
2. **Task 2: Wire MobileDrawer into layout.tsx and update responsive margin + NewsBanner** - `38402f3` (feat)
3. **Task 3: Phase 24 cumulative human-verify** - APPROVED — all 16 checks passed

## Files Created/Modified

- `web/src/lib/sidebar-nav-items.ts` — NavRole type, NavItem interface, getNavItemsForRole() with 14 role branches
- `web/src/components/MobileDrawer.tsx` — vaul Drawer, md:hidden hamburger trigger, pathname-close useEffect, ThemeToggle, logout
- `web/src/components/Sidebar.tsx` — imports getNavItemsForRole, uses it for navItems, added hidden md:flex to aside, version v4.6 → v4.7
- `web/src/app/layout.tsx` — imports and renders MobileDrawer for session users, main ml-* → md:ml-*
- `web/src/components/NewsBanner.tsx` — NEWS_VERSION v4.6 → v4.7, 4 UI-refresh NEWS_ITEMS
- `web/package.json` — vaul@^1.1.2 added

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| useEffect pathname workaround for vaul | vaul drawers don't auto-close on Next.js navigation (issue #631); useEffect(() => setOpen(false), [pathname]) is the research-confirmed fix |
| onClick setOpen(false) on each nav Link | Instant feedback for user taps, complementary to useEffect |
| hidden md:flex on desktop aside | Standard Tailwind responsive pattern; cleaner than JS-based visibility toggle |
| md:ml-* on main | Mobile viewport needs no left offset since desktop sidebar is hidden |
| Shared getNavItemsForRole() helper | Prevents future drift between Sidebar and MobileDrawer; single source of truth |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Pre-existing TypeScript error:** `src/app/csm/bi/CsmBiClient.tsx:137` — TS2769 Recharts Tooltip formatter type mismatch (logged in 24-01 deferred-items.md). No new TypeScript errors introduced by Task 1 or Task 2 changes.

## Checkpoint: Phase 24 Cumulative Human-Verify (Task 3)

**Status:** APPROVED — All 16 checks passed (user: "approved", 2026-04-28)

### Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | Login page subtitle reads "Hub da Projetos" | PASS |
| 2 | Sidebar header reads "Hub da Projetos" after login | PASS |
| 3 | Browser tab title reads "Hub da Projetos" | PASS |
| 4 | Sidebar collapses to icon-only, persists after refresh | PASS |
| 5 | Dark mode toggles, html gains dark class, no FOUC on reload | PASS |
| 6 | Dark mode persists in localStorage and toggles back to light | PASS |
| 7 | Desktop sidebar disappears on mobile viewport | PASS |
| 8 | Blue circular hamburger button visible at bottom-left on mobile | PASS |
| 9 | vaul bottom drawer slides up with correct nav items | PASS |
| 10 | Nav item tap navigates AND drawer closes automatically | PASS |
| 11 | Dark/light toggle works inside drawer while drawer stays open | PASS |
| 12 | "Sair" inside drawer logs out | PASS |
| 13 | NewsBanner shows "v4.7" with four UI-refresh entries | PASS |
| 14 | Zero React hydration warnings in DevTools console | PASS |
| 15 | `npm run lint` — zero errors (pre-existing img warnings only) | PASS |
| 16 | `npx tsc --noEmit` — only pre-existing CsmBiClient.tsx error | PASS |

**Outcome:** Phase 24 UI Refresh fully verified. All 4 requirements (UI-01 through UI-04) satisfied.

## User Setup Required

None - no external service configuration required. All changes are frontend-only.

## Next Phase Readiness

- Phase 24 UI-refresh feature-complete (UI-01 through UI-04 all satisfied) pending human-verify approval
- Phase 25 (Budget Items ETL & Display) can start after Phase 24 is verified
- Pre-existing TypeScript error in CsmBiClient.tsx remains deferred (logged in deferred-items.md)

---
*Phase: 24-ui-refresh*
*Completed: 2026-04-28 — all 16 verification checks passed*
