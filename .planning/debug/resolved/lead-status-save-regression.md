---
status: verifying
trigger: "lead-status-save-regression — Wellington (SDR) selects status like Retorno, appears to save, but reverts after page reload"
created: 2026-04-01T00:00:00Z
updated: 2026-04-01T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — PATCH route returns success:true regardless of whether any rows were updated; when vendedorCondition fails (UPDATE affects 0 rows), frontend shows optimistic update locally but DB is unchanged; on page reload, old DB value is shown
test: code reading — query() returns T[] rows; route used `await query(UPDATE...)` without checking result; always returned { success: true }
expecting: fix applied — RETURNING id + length check + 404 on 0 rows
next_action: verify fix is correct, commit

## Symptoms

expected: Selecting a status like "Retorno" persists and remains after page reload
actual: Status appears to save visually, but reverts to previous state on page reload
errors: No visible error shown to user
reproduction: Wellington selects "Retorno" on a lead → it looks saved → reloads page → status is back to old value
started: Reported 2026-04-01. CRM was slow today (cron may have been running).
scope: Any status change, any vendedor user. Silent failure mode.

## Eliminated

- hypothesis: repo-sync.ts STEP 7c overwriting statuses
  evidence: STEP 7c fix (9e20d04) is correctly in place; STEP 7c only overwrites NULL/'Não Contatado' rows, never overwrites set statuses
  timestamp: 2026-04-01

- hypothesis: parameter indexing bug in vendedorCondition
  evidence: Traced paramIndex carefully for all field combinations — $N placeholders correctly map to values array positions
  timestamp: 2026-04-01

- hypothesis: cron inserting new higher-valor emendas causing display to switch rows
  evidence: Even if new emendas are inserted, STEP 7c propagates statuses correctly; and even if the displayed row changes, the save on the correct row would persist
  timestamp: 2026-04-01

## Evidence

- timestamp: 2026-04-01
  checked: web/src/app/api/leads/[cnpj]/route.ts lines 93-97
  found: `await query(UPDATE...)` — query() returns T[] rows but UPDATE result was discarded; route always reached `return NextResponse.json({ success: true, ... })` at line 297 regardless of rows affected
  implication: If vendedorCondition (AND vendedor_id=$N OR closer_id=$N) doesn't match, 0 rows updated, but HTTP 200 returned anyway

- timestamp: 2026-04-01
  checked: web/src/app/leads/page.tsx updateLead() catch block
  found: catch block only does console.error, no alert, no UI feedback
  implication: Network errors on save are silently swallowed; combined with CRM slowness today, fetch failures would look like successful saves

- timestamp: 2026-04-01
  checked: frontend optimistic update logic
  found: setLeads is called ONLY if res.ok; if res returns 404 (new fix), setLeads is NOT called; controlled select resets to old value; user sees the correct behavior
  implication: Fix is correct — 404 response will cause frontend to show alert AND not update local state

## Resolution

root_cause: PATCH /api/leads/[cnpj] discarded the UPDATE result and returned HTTP 200 {"success":true} regardless of how many rows were affected. When the vendedorCondition (AND vendedor_id=N OR closer_id=N) failed to match, 0 rows were updated but the client received success, causing an optimistic state update. On page reload, the DB still had the old value.

fix: Added RETURNING id to the UPDATE query and check updateResult.length === 0 → return 404. Also added alert() in the catch block of updateLead() and updateProjeto() so network failures are visible to users.

verification: Code review — RETURNING id forces the DB to report affected rows; empty array = 0 rows; 404 prevents frontend from calling setLeads, preventing the false optimistic update.

files_changed:
  - web/src/app/api/leads/[cnpj]/route.ts
  - web/src/app/leads/page.tsx
  - web/src/app/lead/[cnpj]/page.tsx
