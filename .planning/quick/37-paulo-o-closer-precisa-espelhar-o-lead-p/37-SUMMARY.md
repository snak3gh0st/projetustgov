---
phase: quick-37
plan: 01
subsystem: leads-ui
tags: [gestor_vendedor, leads-list, sdr-column, closer-badge, ui]
dependency_graph:
  requires: []
  provides: [gestor_vendedor-sdr-visibility]
  affects: [web/src/app/leads/page.tsx]
tech_stack:
  added: []
  patterns: [role-conditional-rendering, badge-indicator]
key_files:
  created: []
  modified:
    - web/src/app/leads/page.tsx
decisions:
  - Purple CLOSER badge shown only when closer_id is set AND status is 'Aguardando Closer' (not just closer_id alone)
  - gestor_vendedor sees SDR column header label (not 'Vendedor') to clarify the column semantics
  - No assignment button for gestor_vendedor (SDR leads are not theirs to reassign)
  - colSpan on cascade sub-rows updated for gestor_vendedor to prevent broken layout
metrics:
  duration: 58s
  completed: 2026-02-20
  tasks: 1
  files_modified: 1
---

# Quick Task 37: Paulo o Closer Precisa Espelhar o Lead Summary

**One-liner:** SDR column + purple CLOSER badge added to gestor_vendedor view in leads list, distinguishing mirrored SDR leads from own leads.

## What Was Done

Paulo (role `gestor_vendedor`) can now open /leads and immediately see:

1. **Page subtitle** changed to "Seus leads + leads aguardando seu fechamento" — making the dual nature of his list explicit.

2. **SDR column header** — the Vendedor column is now visible to `gestor_vendedor` with the label "SDR" (instead of "Vendedor"), correctly describing what that column shows for his view.

3. **SDR name + CLOSER badge** — for each lead in his list, he sees the vendedor_nome (the SDR who owns the lead). When the lead has `closer_id` set AND `status_contato === 'Aguardando Closer'`, a purple "CLOSER" badge appears inline, instantly communicating that he is the assigned closer for that lead.

4. **No assignment button** — `gestor_vendedor` cannot reassign SDR leads (correct behavior; only `gestor` can do that).

5. **colSpan fix** — cascade sub-rows now span 5 columns for `gestor_vendedor` (same as `gestor`), preventing the layout from breaking when the SDR column is visible.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Show SDR column and mirrored-lead badge for gestor_vendedor | 6cf50c8 | web/src/app/leads/page.tsx |

## Verification

- Build: `npm run build` passed with no TypeScript errors
- gestor role: unchanged (Vendedor column with assignment button intact)
- vendedor role: unchanged (no SDR/Vendedor column)
- gestor_vendedor: SDR column header, SDR name shown, purple CLOSER badge on Aguardando Closer leads

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- web/src/app/leads/page.tsx: modified (confirmed in git log)
- Commit 6cf50c8: confirmed in git log
