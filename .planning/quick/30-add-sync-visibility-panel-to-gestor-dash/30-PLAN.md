---
phase: quick-30
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/db-migrations/create-cron-sync-log.sql
  - web/src/lib/repo-sync.ts
  - web/src/app/page.tsx
autonomous: true
requirements:
  - SYNC-LOG-01
  - SYNC-LOG-02
  - SYNC-LOG-03

must_haves:
  truths:
    - "cron_sync_log table exists in DB with columns: id, ran_at, inserted, updated, errors, duration_ms"
    - "Every syncLeadsFromRepo() call writes one row to cron_sync_log after completion"
    - "Gestor dashboard (/) shows a sync panel with: last sync time, inserts, updates, next run, and Sincronizar Agora button"
    - "Sincronizar Agora POST /api/debug-sync shows loading state and updates panel with returned stats"
    - "Panel is only visible to gestor / gestor_vendedor roles (not vendedor)"
  artifacts:
    - path: "web/src/lib/repo-sync.ts"
      provides: "syncLeadsFromRepo writes to cron_sync_log after each run"
    - path: "web/src/app/page.tsx"
      provides: "SyncPanel component visible to gestor roles only"
  key_links:
    - from: "web/src/lib/repo-sync.ts"
      to: "cron_sync_log"
      via: "INSERT at end of syncLeadsFromRepo() before returning stats"
      pattern: "cron_sync_log"
    - from: "web/src/app/page.tsx"
      to: "/api/debug-sync"
      via: "GET on mount (last sync row) + POST on button click"
      pattern: "debug-sync"
---

<objective>
Add sync visibility to the gestor dashboard: (1) create cron_sync_log DB table, (2) write to it after every sync run, (3) show a "Ultimo Sync" panel in the gestor view of page.tsx with last sync stats and a Sincronizar Agora button.

Purpose: Gestor needs operational visibility into when the daily cron ran, how many leads were inserted/updated, and the ability to manually trigger a resync from the dashboard without navigating to /api/debug-sync directly.
Output: DB table + repo-sync.ts write + dashboard panel component.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/lib/repo-sync.ts
@web/src/app/api/debug-sync/route.ts
@web/src/app/page.tsx
@web/src/lib/db.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create cron_sync_log table + write to it from repo-sync.ts</name>
  <files>
    web/src/lib/repo-sync.ts
  </files>
  <action>
    Step A — Create the DB table by running a raw SQL migration via the existing query() helper at startup.

    Add at the TOP of syncLeadsFromRepo() (before any other logic), ensure the table exists:

    ```sql
    CREATE TABLE IF NOT EXISTS cron_sync_log (
      id SERIAL PRIMARY KEY,
      ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      inserted INT NOT NULL DEFAULT 0,
      updated INT NOT NULL DEFAULT 0,
      errors INT NOT NULL DEFAULT 0,
      duration_ms INT NOT NULL DEFAULT 0
    );
    ```

    Run this via `client.query(...)` immediately after `const client = await pool.connect()` (before STEP 1 begins), so the table always exists even on first run.

    Step B — At the very end of syncLeadsFromRepo(), just before `client.release()` (inside the finally block, after `stats.duration_ms = Date.now() - startTime`), insert a log row:

    ```sql
    INSERT INTO cron_sync_log (ran_at, inserted, updated, errors, duration_ms)
    VALUES (NOW(), $1, $2, $3, $4)
    ```
    params: [stats.inserted, stats.updated, stats.errors, stats.duration_ms]

    Use a try/catch around this INSERT so a logging failure never breaks the sync.

    NOTE: The `stats.duration_ms` line currently sits AFTER the finally block. Move the `stats.duration_ms = Date.now() - startTime` line to BEFORE `client.release()` so the value is available for the log INSERT. Then keep the existing console.log after the try/finally as-is.
  </action>
  <verify>
    After deploying or running locally:
    1. `npx tsx -e "import('./web/src/lib/repo-sync.ts').then(m => m.syncLeadsFromRepo())"` — or trigger via POST /api/debug-sync
    2. Query: `SELECT * FROM cron_sync_log ORDER BY ran_at DESC LIMIT 3;` — should show at least one row with non-zero duration_ms
  </verify>
  <done>cron_sync_log table exists, every syncLeadsFromRepo() call writes one row with accurate inserted/updated/errors/duration_ms values.</done>
</task>

<task type="auto">
  <name>Task 2: Update /api/debug-sync GET to return last sync row + add SyncPanel to page.tsx</name>
  <files>
    web/src/app/api/debug-sync/route.ts
    web/src/app/page.tsx
  </files>
  <action>
    **Part A — /api/debug-sync GET: add last_sync_log to response**

    In the existing GET handler, add a fifth parallel query to fetch the most recent cron_sync_log row:

    ```sql
    SELECT ran_at, inserted, updated, errors, duration_ms
    FROM cron_sync_log
    ORDER BY ran_at DESC
    LIMIT 1
    ```

    Add this to the `Promise.all([...])` call. Return it in the JSON response as:
    ```json
    {
      "last_sync_log": {
        "ran_at": "...",
        "inserted": 12,
        "updated": 350,
        "errors": 0,
        "duration_ms": 42000
      }
    }
    ```
    If the table is empty (no rows yet), `last_sync_log` should be `null`.

    Handle the case where cron_sync_log does not yet exist with a try/catch that returns null for last_sync_log.

    **Part B — page.tsx: SyncPanel component for gestor view**

    Add a new interface SyncLog at the top of page.tsx:
    ```typescript
    interface SyncLog {
      ran_at: string
      inserted: number
      updated: number
      errors: number
      duration_ms: number
    }
    ```

    Add a SyncPanel component (above CRMDashboard or inline inside it as a sub-section). It should:
    - Accept props: `role: string | undefined`
    - Only render if `role === 'gestor'` — NOT for gestor_vendedor (they are seller-focused)
    - On mount, call GET /api/debug-sync and read `last_sync_log` from the response
    - Show a panel with:
      - Title: "Ultimo Sync" (small section label, `text-xs text-gray-500 uppercase tracking-wider`)
      - Last sync time: use `timeAgo(last_sync_log.ran_at)` + full ISO date in `text-gray-400 text-xs`
      - Inserts badge: `{inserted} novos` in green
      - Updates badge: `{updated} atualizados` in blue
      - Errors badge: only show if errors > 0, in red
      - Duration: `{(duration_ms/1000).toFixed(1)}s`
      - Next scheduled: static text "Proximo: diario as 03:00 BRT"
      - Button: "Sincronizar Agora" — POST /api/debug-sync on click
        - Loading state while POST is in flight: show spinner text "Sincronizando..."
        - On success: update panel state with returned `stats` (inserted, updated, errors, duration_ms) + set ran_at to new Date().toISOString()
        - On error: show brief error text below button

    Panel container styling: `bg-white border border-gray-200 shadow-sm rounded-xl p-5`

    Place the SyncPanel in the CRMDashboard return, after the global stats cards grid and before the pipeline section, wrapped in `{role === 'gestor' && <SyncPanel role={role} />}`.

    The component manages its own local state: `syncLog`, `syncing`, `syncError`. No changes to the parent DashboardData type needed.
  </action>
  <verify>
    1. Open / as gestor user — SyncPanel should appear with last sync data (or "nunca" if no log rows yet)
    2. Click "Sincronizar Agora" — button shows "Sincronizando...", panel updates with new stats after completion
    3. Open / as vendedor — SyncPanel should NOT appear
    4. Open / as gestor_vendedor — SyncPanel should NOT appear
  </verify>
  <done>
    Gestor sees "Ultimo Sync" panel below stat cards showing last sync time + inserts/updates/errors + duration. "Sincronizar Agora" button triggers POST /api/debug-sync and refreshes panel. Panel is hidden for vendedor and gestor_vendedor roles.
  </done>
</task>

</tasks>

<verification>
1. DB: `SELECT * FROM cron_sync_log ORDER BY ran_at DESC LIMIT 3` shows rows after sync runs
2. GET /api/debug-sync returns `last_sync_log` object with ran_at, inserted, updated, errors, duration_ms
3. Dashboard at / shows SyncPanel for gestor, hidden for other roles
4. "Sincronizar Agora" button works end-to-end (triggers sync, updates panel)
5. TypeScript compiles without errors: `cd web && npx tsc --noEmit`
</verification>

<success_criteria>
- cron_sync_log table auto-created on first sync, never crashes sync if INSERT fails
- Every syncLeadsFromRepo() call (cron or manual) logs one row
- Gestor dashboard shows last sync stats at a glance without leaving the page
- Manual sync from dashboard works and reflects updated counts
</success_criteria>

<output>
After completion, create `.planning/quick/30-add-sync-visibility-panel-to-gestor-dash/30-SUMMARY.md`
</output>
