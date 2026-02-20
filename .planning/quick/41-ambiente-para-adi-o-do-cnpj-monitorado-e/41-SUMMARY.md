---
phase: quick-41
plan: 01
subsystem: ui, api, database
tags: [web-push, service-worker, notifications, postgres, next-js, vapid, cnpj-monitoring]

requires:
  - phase: quick-26
    provides: repo-sync.ts UPSERT pipeline used as trigger point for push notifications
  - phase: quick-16
    provides: vendedor_projetos table with emenda data used in cnpj_monitorado JOIN

provides:
  - cnpj_monitorado table (per-user personal CNPJ watchlist)
  - push_subscriptions table (web push subscription storage per user)
  - /api/cnpj-monitorado GET/POST/DELETE for all authenticated roles
  - /api/push-subscribe POST/DELETE for push subscription management
  - /api/push-notify POST for sending web push to watchers of a CNPJ
  - /monitorar page with watchlist UI + push notification toggle
  - web/public/sw.js service worker for push notification display
  - VAPID key configuration in .env.local
  - repo-sync STEP 7b: post-upsert push notification trigger for monitored CNPJs

affects: [repo-sync, cron-sync, sidebar-navigation, user-experience]

tech-stack:
  added: [web-push@^3.6.x, @types/web-push]
  patterns: [internal-api-key auth for server-to-server calls, web push with VAPID, service worker push event handler]

key-files:
  created:
    - web/src/app/api/cnpj-monitorado/route.ts
    - web/src/app/api/push-subscribe/route.ts
    - web/src/app/api/push-notify/route.ts
    - web/src/app/monitorar/page.tsx
    - web/public/sw.js
  modified:
    - web/src/app/api/setup-crm/route.ts
    - web/src/components/Sidebar.tsx
    - web/src/lib/repo-sync.ts
    - web/.env.local

key-decisions:
  - "Push notifications use VAPID protocol via web-push library; keys generated locally and stored in .env.local"
  - "Internal server-to-server calls to /api/push-notify authenticated via x-internal-key header matching INTERNAL_API_KEY env var"
  - "All authenticated roles (vendedor, gestor, gestor_vendedor) can add CNPJs to their personal watchlist; visualizador excluded"
  - "Monitored CNPJ check in STEP 7b uses all CNPJs from sync batch (not just inserted/updated) to ensure notifications on any activity"
  - "Expired push subscriptions (410/404 from push service) are automatically cleaned from DB"

requirements-completed: []

duration: 25min
completed: 2026-02-20
---

# Quick Task 41: CNPJ Monitorado + Web Push Notifications Summary

**Personal CNPJ watchlist with web push alerts: users add CNPJs to /monitorar, receive browser push notifications when emendas are detected in daily cron sync**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-20T00:00:00Z
- **Completed:** 2026-02-20
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments
- Any authenticated user (vendedor, gestor, gestor_vendedor) can manage a personal CNPJ watchlist at /monitorar
- Watchlist shows name, formatted CNPJ, phone, email, UF/municipality, valor_emenda, parlamentar data from vendedor_projetos
- Users can subscribe to browser push notifications; service worker displays them when a monitored CNPJ is updated in sync
- Daily cron sync (repo-sync.ts STEP 7b) automatically triggers push notifications to all users watching any touched CNPJ
- push_subscriptions table stores subscriptions per user with automatic cleanup on expired endpoints

## Task Commits

Each task was committed atomically:

1. **Task 1: DB tables + /api/cnpj-monitorado CRUD API** - `1bf7d2d` (feat)
2. **Task 2: /monitorar page + Sidebar nav item** - `e32226e` (feat)
3. **Task 3: Service worker + push-notify API + repo-sync integration** - `7134a0f` (feat)

## Files Created/Modified
- `web/src/app/api/setup-crm/route.ts` - Added cnpj_monitorado and push_subscriptions CREATE TABLE blocks
- `web/src/app/api/cnpj-monitorado/route.ts` - GET/POST/DELETE CRUD for personal watchlist (all roles)
- `web/src/app/api/push-subscribe/route.ts` - POST/DELETE for web push subscription management
- `web/src/app/api/push-notify/route.ts` - POST to send push notifications to all watchers of a CNPJ
- `web/src/app/monitorar/page.tsx` - Watchlist UI page with add/remove/push toggle
- `web/public/sw.js` - Service worker handling push events and notification clicks
- `web/src/components/Sidebar.tsx` - Added 'Meus Monitorados' nav item (hidden for visualizador)
- `web/src/lib/repo-sync.ts` - STEP 7b: post-upsert check for monitored CNPJs + push trigger
- `web/.env.local` - Added NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, INTERNAL_API_KEY

## Decisions Made
- Used `x-internal-key` header for server-to-server auth between repo-sync and push-notify endpoint, avoiding session requirement from server-side code
- VAPID keys generated locally; INTERNAL_API_KEY is a random UUID for this deployment
- Monitored CNPJ check fires on all CNPJs in the sync batch (not just new inserts) — ensures users get notified on updates too
- Visualizador role explicitly excluded from /monitorar nav link (read-only role, no action capability)
- Expired push subscriptions auto-cleaned on 410/404 response from push service

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Uint8Array return type for VAPID key conversion**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `urlBase64ToUint8Array` returned `Uint8Array` which TypeScript could not assign to `BufferSource` in `pushManager.subscribe()` due to `SharedArrayBuffer` incompatibility in strict types
- **Fix:** Changed return type to `ArrayBuffer` with explicit cast `outputArray.buffer as ArrayBuffer`
- **Files modified:** web/src/app/monitorar/page.tsx
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** e32226e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TypeScript type fix, no behavior change.

## Issues Encountered
- None beyond the TypeScript fix above

## User Setup Required
For production deployment, the following environment variables must be added to Vercel dashboard:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — already in .env.local
- `VAPID_PRIVATE_KEY` — already in .env.local
- `VAPID_EMAIL` — already in .env.local (mailto:admin@projetus.org)
- `INTERNAL_API_KEY` — already in .env.local (random UUID)

Push notifications require HTTPS in production (Vercel deployment) — localhost will not work for actual push delivery.

## Next Phase Readiness
- /monitorar is live and accessible to all non-visualizador roles
- Run /api/setup-crm to create the cnpj_monitorado and push_subscriptions tables in production DB
- Service worker at /sw.js is ready; push notifications functional once HTTPS is established on Vercel

---
*Phase: quick-41*
*Completed: 2026-02-20*
