---
status: resolved
trigger: "Lead save fails (stays 'Editando') and FUDOSHIN SPORTS appears in wrong category"
created: 2026-04-03T00:00:00Z
updated: 2026-04-03T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - two separate bugs found
test: complete code trace
expecting: both fixes are surgical and independent
next_action: apply fixes

## Symptoms

expected:
1. Interaction history saves successfully (status changes from "Editando" back to normal)
2. FUDOSHIN SPORTS should appear in "execução" leads, not "aprovação" leads

actual:
1. After clicking "Salvar" on interaction form, the status shows "Editando..." indefinitely - does not save
2. FUDOSHIN SPORTS disappeared from execução leads and appeared in aprovação leads

errors: No visible error reported, save fails silently showing "Editando..."

reproduction:
1. Open any lead → Histórico de Contatos → click "Editar" on a note you didn't create → click Salvar → stays "Editando..."
2. FUDOSHIN SPORTS CNPJ - search in CRM leads, find it in aprovação instead of execução

started: After recent commits, specifically the tgov_interactions migration and tgov split feature

## Eliminated

- hypothesis: tgov/interaction PATCH route auth bug (gestor/admin only)
  evidence: Wellington uses /api/leads/[cnpj]/notes not /api/tgov/interaction — different endpoint
  timestamp: 2026-04-03

- hypothesis: "isolate bare lead batch" commit changed execucao/aprovacao query logic
  evidence: git diff shows that commit only touched bi/route.ts, dashboard-crm/route.ts, crm-scope.ts — did NOT change tgov routes
  timestamp: 2026-04-03

## Evidence

- timestamp: 2026-04-03
  checked: ContactNotesTimeline.tsx - "Editando..." render path
  found: "Editando..." is a label shown when `isEditing === true` (editingNoteId === note.id). It is set by startEdit() and only CLEARED on success (if res.ok). On PATCH failure, editSubmitting→false but editingNoteId stays set → form permanently stuck in "Editando..."
  implication: Root cause of bug 1

- timestamp: 2026-04-03
  checked: /api/leads/[cnpj]/notes PATCH - ownership check
  found: Line 75: `if (note.vendedor_id !== session.userId && session.role !== 'gestor')` → 403. Wellington (vendedor) can only edit notes he created. If editing another user's note → returns 403 → frontend catch block silently ignores → "Editando..." stuck
  implication: Wellington is editing a note not created by him. Server returns 403. Frontend ignores it.

- timestamp: 2026-04-03
  checked: tgov_interactions migration + PATCH SQL
  found: Schema has `item_key TEXT NOT NULL UNIQUE` (unique on item_key alone, not on item_key+tab). PATCH uses `ON CONFLICT (item_key)`. SELECT uses `WHERE item_key=$1 AND tab=$2`. If the same item_key is saved with tab='aprovacao', it overwrites the record, and the execucao tab's lookup (WHERE tab='execucao') returns nothing.
  implication: Root cause of bug 2 - FUDOSHIN's item_key was saved under the aprovacao tab, overwriting the execucao record. Now the execucao tab finds no match.

- timestamp: 2026-04-03
  checked: execucao/route.ts and aprovacao/route.ts git history + diff
  found: Both routes correctly filter by whitelist (execucao uses wl WHERE tab IN ('ambos','execucao'), aprovacao uses tw WHERE tab IN ('ambos','aprovacao')). The data display is correct. The issue is that FUDOSHIN's tgov_interactions record has tab='aprovacao' due to the upsert overwrite bug.
  implication: The lead STILL appears in execucao's table data correctly. But its internal_status JOIN (LEFT JOIN tgov_interactions ti ON ti.item_key = pe.nr_convenio AND ti.tab = 'execucao') returns null. Meanwhile, aprovacao sees the record because ti.tab='aprovacao' matches.

## Resolution

root_cause:
  bug1: ContactNotesTimeline.tsx handleEditSubmit() never clears editingNoteId on failure - the "Editando..." label stays visible permanently when the API call returns non-ok (403 because Wellington is trying to edit a note he did not create, or any other error).
  bug2: tgov_interactions table has UNIQUE constraint on item_key only (not item_key+tab). PATCH upsert ON CONFLICT(item_key) blindly overwrites tab column. A save on aprovacao tab overwrites an execucao record, breaking the LEFT JOIN in execucao query (WHERE tab='execucao' no longer matches). Requires: (a) fix UNIQUE constraint to (item_key, tab), (b) fix ON CONFLICT clause, (c) add migration to repair existing data.

fix:
  bug1: In handleEditSubmit, after the try/catch finally block, always call setEditingNoteId(null) if saving failed (res.ok is false) — or show an error message and cancelEdit(). Simplest: move cancelEdit() to the catch block and show a brief error message.
  bug2: Add migration to drop old UNIQUE(item_key) and add UNIQUE(item_key, tab). Fix the ON CONFLICT clause in the PATCH route to use (item_key, tab). Also add a new migration to fix any corrupted data.

verification:
  bug1: Wellington clicks "Editar" on any note. Clicks "Salvar". If note is not his: error message shown and edit mode exits. If note is his: saves and exits edit mode.
  bug2: Check FUDOSHIN in execucao tab - internal status loads correctly. Save status in execucao tab, then in aprovacao tab — both records exist independently.

files_changed:
  - web/src/components/ContactNotesTimeline.tsx
  - web/src/app/api/tgov/interaction/[key]/route.ts (ON CONFLICT fix)
  - migrations/fix_tgov_interactions_unique.sql (new)
