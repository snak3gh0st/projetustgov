---
phase: quick-25
plan: "01"
subsystem: usuarios-page
tags: [bugfix, auth, useSession, next-auth, client-crash]
dependency_graph:
  requires: []
  provides: [usuarios-page-crash-free, is_self-api-field]
  affects: [web/src/app/cadastro-vendedor/page.tsx, web/src/app/api/usuarios/route.ts]
tech_stack:
  added: []
  patterns: [server-side-self-detection]
key_files:
  created: []
  modified:
    - web/src/app/api/usuarios/route.ts
    - web/src/app/cadastro-vendedor/page.tsx
decisions:
  - Server-side self-detection via is_self field in API response eliminates useSession dependency
  - No SessionProvider in layout (Auth.js v5 server-side) — client-side useSession is incompatible
metrics:
  duration: "~5 minutes"
  completed: "2026-02-19T04:17:17Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-25 Plan 01: Fix Application Error on Usuarios Tab Summary

**One-liner:** Remove useSession (no SessionProvider in layout) from /cadastro-vendedor by moving self-detection server-side via is_self field in GET /api/usuarios response.

## What Was Built

The Usuarios tab (`/cadastro-vendedor`) crashed on load with "Application error: a client-side exception has occurred" because `useSession()` from `next-auth/react` was called in a client component without a wrapping `<SessionProvider>`. Auth.js v5 uses server-side auth exclusively — no SessionProvider exists in the layout.

The page only used `useSession` to determine `currentUserId` for identifying the logged-in user's own row (preventing self-role-change). This logic was moved server-side:

1. **GET /api/usuarios** now computes `is_self: boolean` per row by comparing `row.id === session.userId` (session already available from `getApiSession()`).
2. **cadastro-vendedor/page.tsx** drops the `useSession` import, the hook call, and the derived `currentUserId`. The table row now reads `usuario.is_self` directly from the API response.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add is_self field to GET /api/usuarios response | 3b03ae0 | web/src/app/api/usuarios/route.ts |
| 2 | Remove useSession from Usuarios page, use is_self from API | e319f51 | web/src/app/cadastro-vendedor/page.tsx |

## Verification Results

- `npx tsc --noEmit` — passes with zero errors
- `grep "useSession\|next-auth/react" cadastro-vendedor/page.tsx` — zero matches
- `npm run build` — succeeds, /cadastro-vendedor renders as dynamic SSR route (2.27 kB)
- Self-row protection intact: `isSelf = usuario.is_self` replaces client-side comparison

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- web/src/app/api/usuarios/route.ts — modified (is_self map added)
- web/src/app/cadastro-vendedor/page.tsx — modified (useSession removed)
- Commit 3b03ae0 — verified in git log
- Commit e319f51 — verified in git log
- TypeScript compilation: zero errors
- Production build: success
