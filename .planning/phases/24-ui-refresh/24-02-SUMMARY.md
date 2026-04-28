---
phase: 24-ui-refresh
plan: "02"
subsystem: ui
tags: [sidebar, collapsible, cookie, hydration, next-js, server-action, tailwind]

requires:
  - phase: 24-01
    provides: dark-mode-infrastructure, ThemeToggle, Providers wrapper, brand-text-hub-da-projetos

provides:
  - collapsible-sidebar-with-cookie-persistence
  - sidebar-actions-server-action
  - fouc-free-initial-sidebar-state

affects: [web/src/app/layout.tsx, web/src/components/Sidebar.tsx, web/src/lib/sidebar-actions.ts]

tech-stack:
  added: []
  patterns:
    - "Cookie-persisted sidebar state: RSC layout reads sidebar:state cookie, passes defaultOpen to client Sidebar; no hydration flash"
    - "Client-side direct document.cookie write for instant UX alongside Server Action for future use"
    - "Tailwind transition-[width]/transition-[margin] for smooth collapse/expand animation"

key-files:
  created:
    - web/src/lib/sidebar-actions.ts
  modified:
    - web/src/components/Sidebar.tsx
    - web/src/app/layout.tsx

key-decisions:
  - "Client writes sidebar:state cookie via document.cookie directly (instant UX); Server Action setSidebarState exists for future Server Component callers but is not called from the toggle handler"
  - "cookies() called WITHOUT await in layout.tsx — Next.js 14.2.0 synchronous form (Pitfall 5 from research)"
  - "Default sidebarOpen = true (cookie absent → undefined !== 'false' → true) — new users see full sidebar"
  - "setSidebarState Server Action has no httpOnly/secure flags — client document.cookie writes must work"

patterns-established:
  - "FOUC-free toggle pattern: RSC reads cookie before render → passes defaultOpen → client useState matches server HTML"

requirements-completed: [UI-01]

duration: 8min
completed: 2026-04-28
---

# Phase 24 Plan 02: Collapsible Sidebar with Cookie Persistence Summary

**Cookie-persisted collapsible sidebar: RSC layout reads `sidebar:state` cookie and passes `defaultOpen` to client Sidebar, eliminating FOUC; toggle writes cookie directly via `document.cookie` for instant UX**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-28T13:09:34Z
- **Completed:** 2026-04-28T13:17:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Created `sidebar-actions.ts` Server Action (`setSidebarState`) for cookie-based sidebar persistence
- Added collapsible state to Sidebar.tsx: `defaultOpen` prop, `useState`, toggle button with chevron icons, conditional width/padding/visibility
- Updated layout.tsx to read `sidebar:state` cookie synchronously and pass `defaultOpen` to Sidebar; main margin tracks state with `ml-56`/`ml-14` transition

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sidebar-actions.ts** - `1bb5852` (feat)
2. **Task 2: Add collapsible state + toggle button to Sidebar.tsx** - `5d11bde` (feat)
3. **Task 3: Read sidebar:state cookie in layout.tsx and sync main margin** - `8294924` (feat)

**Plan metadata:** `4bc7cb1` (docs)

## Files Created/Modified

- `web/src/lib/sidebar-actions.ts` — Server Action with `'use server'`, `setSidebarState(open: boolean)` writes `sidebar:state` cookie, 1-year maxAge, path=/, SameSite=Lax, no httpOnly
- `web/src/components/Sidebar.tsx` — Added `defaultOpen?: boolean` prop, `useState<boolean>(defaultOpen)`, `writeSidebarCookie()`/`toggleSidebar()` helpers, toggle button in header, conditional `w-56`/`w-14`, conditional label/brand/user-info visibility
- `web/src/app/layout.tsx` — Added `import { cookies } from 'next/headers'`, synchronous `cookies().get('sidebar:state')`, `defaultOpen={sidebarOpen}` on Sidebar, template-literal main margin `${sidebarOpen ? 'ml-56' : 'ml-14'}`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Client writes cookie via document.cookie (not Server Action) | Instant UX — no server round-trip needed for toggle; Server Action `setSidebarState` exists for future callers |
| cookies() without await in layout.tsx | Next.js 14.2.0 is synchronous (Pitfall 5 from research) — confirmed working |
| Default sidebarOpen = true | Cookie absent → new users see full sidebar. `undefined !== 'false'` = `true` |
| No httpOnly on cookie | client document.cookie writes must be allowed; no secure flag (dev over http) |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Worktree vs main repo:** The executor's cwd was the `.claude/worktrees/agent-a8bf29db` worktree (stale at pre-24-01 state). All file edits and commits were correctly applied to the main repo at `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/` which had the 24-01 state. No code was lost or duplicated.

**Pre-existing TypeScript errors:** 3 errors from before this plan (CsmBiClient.tsx Recharts type, Providers.tsx + ThemeToggle.tsx next-themes module — logged in 24-01 deferred-items.md). No new errors introduced.

## Self-Check

**Files on disk:**

| File | Status |
|------|--------|
| web/src/lib/sidebar-actions.ts | FOUND |
| web/src/components/Sidebar.tsx | FOUND (modified) |
| web/src/app/layout.tsx | FOUND (modified) |

**Commits:**

| Hash | Message |
|------|---------|
| 1bb5852 | feat(24-02): create sidebar-actions.ts Server Action for cookie write |
| 5d11bde | feat(24-02): add collapsible state and toggle button to Sidebar.tsx |
| 8294924 | feat(24-02): read sidebar:state cookie in layout.tsx and sync main margin |

## Next Phase Readiness

Plan 24-03 (mobile bottom drawer + `hidden md:flex` switch) can now build on:
- Stable `defaultOpen` prop on Sidebar
- `sidebar:state` cookie established as the persistence mechanism
- Layout's `sidebarOpen` variable already computed for the Sidebar passing pattern

---
*Phase: 24-ui-refresh*
*Completed: 2026-04-28*
