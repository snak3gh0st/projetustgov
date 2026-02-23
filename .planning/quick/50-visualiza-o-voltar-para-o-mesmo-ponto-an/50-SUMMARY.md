---
phase: quick-50
plan: 01
subsystem: leads-ui
tags: [ux, scroll, slide-over, leads]
dependency_graph:
  requires: []
  provides: [scroll-position-preservation-on-slide-over]
  affects: [web/src/app/leads/page.tsx]
tech_stack:
  added: []
  patterns: [useRef for imperative scroll state, requestAnimationFrame for post-render DOM ops]
key_files:
  created: []
  modified:
    - web/src/app/leads/page.tsx
decisions:
  - scrollPositionRef uses useRef (not useState) to avoid triggering re-renders when position changes
  - requestAnimationFrame used in onClose to wait for React unmount of slide-over overlay before restoring scroll
  - behavior 'instant' chosen over 'smooth' to avoid jarring visible scroll animation on close
  - handleOpenLead accepts VendedorProjeto (base type) not typeof displayLeads[0] to work for both main rows and cascade sub-rows
metrics:
  duration: 8m
  completed: 2026-02-23
  tasks: 1
  files: 1
---

# Phase quick-50 Plan 01: Preserve Scroll Position on Slide-Over Open/Close Summary

**One-liner:** Save `window.scrollY` before opening slide-over and restore it via `requestAnimationFrame` + `scrollTo({ behavior: 'instant' })` on close.

## What Was Built

Modified `/leads` page to remember the user's scroll position when they open a lead's slide-over panel, then return them to the exact same position when they close it. Previously, closing the slide-over caused the browser to jump to the top of the page, forcing vendedores to scroll back down to find their place during active prospecting sessions.

## Changes

### web/src/app/leads/page.tsx

- Added `useRef` to React import (was previously unused in imports)
- Added `scrollPositionRef = useRef<number>(0)` alongside other state declarations
- Added `handleOpenLead(lead: VendedorProjeto)` function that saves `window.scrollY` then calls `setSelectedLead(lead)`
- Replaced `onClick={() => setSelectedLead(lead)}` on main `<tr>` rows with `onClick={() => handleOpenLead(lead)}`
- Replaced `onClick={() => setSelectedLead(sub)}` on cascade sub-rows with `onClick={() => handleOpenLead(sub)}`
- Updated `<LeadSlideOver onClose>` to call `setSelectedLead(null)` followed by `requestAnimationFrame(() => window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' }))`

## Deviations from Plan

**1. [Rule 1 - Bug] Type annotation adjusted for handleOpenLead parameter**

- **Found during:** Task 1 — TypeScript check
- **Issue:** Plan specified `typeof displayLeads[0]` as the parameter type, but `displayLeads` items have `totalValor`, `emenda_count`, and `subLeads` extra fields that raw `VendedorProjeto` items (used in cascade sub-rows) lack. TypeScript error TS2345 at line 519.
- **Fix:** Changed parameter type from `typeof displayLeads[0]` to `VendedorProjeto` — the base type that `setSelectedLead` already accepts. Display lead items are structurally assignable to `VendedorProjeto` since they spread from it.
- **Files modified:** web/src/app/leads/page.tsx
- **Commit:** d195107

## Self-Check: PASSED

- web/src/app/leads/page.tsx: FOUND
- commit d195107: FOUND
- scrollPositionRef at line 59: FOUND
- handleOpenLead at line 184: FOUND
- handleOpenLead on main row at line 359: FOUND
- handleOpenLead on sub-row at line 519: FOUND
- requestAnimationFrame + window.scrollTo at lines 572-573: FOUND
