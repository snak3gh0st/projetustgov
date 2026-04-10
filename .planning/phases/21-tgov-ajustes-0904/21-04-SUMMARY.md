---
phase: 21-tgov-ajustes-0904
plan: "04"
subsystem: tgov-dashboard
tags: [tgov, bugfix, ui, comments, table]
dependency_graph:
  requires: [21-01]
  provides: [visible-table-dividers, comment-count-badge]
  affects: [web/src/app/tgov/TGovDashboardClient.tsx, web/src/app/api/tgov/aprovacao/route.ts, web/src/lib/tgov.ts]
tech_stack:
  added: []
  patterns: [correlated-subquery, optional-type-field, stopPropagation-click-isolation]
key_files:
  created: []
  modified:
    - web/src/app/tgov/TGovDashboardClient.tsx
    - web/src/app/api/tgov/aprovacao/route.ts
    - web/src/lib/tgov.ts
decisions:
  - "divide-gray-100 applied only to AprovacaoTable and ExecucaoTable main tbodies; CNPJ search modal sub-tables intentionally left at divide-gray-50 (out of scope)"
  - "SituacaoBadge confirmed already present in both SITUACAO columns — no code change needed (D-20 already implemented)"
  - "Correlated subquery for comment_count preferred over JOIN to avoid complicating existing CTE/pagination query structure"
metrics:
  duration: "~8 min"
  completed: "2026-04-10"
  tasks_completed: 2
  files_modified: 3
---

# Phase 21 Plan 04: Table Dividers + Comment Count Badge Summary

Table dividers made visible and comment count badge added to AprovacaoTable.

## What Was Built

**Fix invisible row dividers:** Changed `divide-gray-50` to `divide-gray-100` on both the AprovacaoTable `<tbody>` and ExecucaoTable `<tbody>` in TGovDashboardClient.tsx. The gray-50 shade was effectively invisible against the white background.

**Confirm SituacaoBadge (D-20):** Verified that `<SituacaoBadge situacao={row.situacao} />` is already present in the SITUACAO column of both AprovacaoTable (line 1189) and ExecucaoTable (line 1301). No code change required.

**Add commentCount type field:** Added `commentCount?: number` to `TGovAprovacaoTableRow` interface in `web/src/lib/tgov.ts`.

**Add comment_count subquery to API:** Added a correlated subquery to the `tableDataRows` SELECT in `web/src/app/api/tgov/aprovacao/route.ts`:
```sql
(SELECT COUNT(*)::int FROM tgov_comments c
 WHERE c.target_key = p.nr_proposta AND c.target_type = 'proposta') AS comment_count
```
Mapped to `commentCount: r.comment_count ?? 0` in the response row builder.

**Add comment badge column to AprovacaoTable:** Added an 8th column (was 7):
- "Coments." header before the chevron column
- Speech bubble SVG icon with count number for rows with `commentCount > 0`
- Dim gray-200 speech bubble icon for zero-comment rows
- `onClick` on the badge cell calls `onRowClick(row)` with `stopPropagation()` to open the sidecard
- Updated `SkeletonRows cols={7}` to `cols={8}` and `EmptyRow cols={7}` to `cols={8}`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix table dividers + commentCount type + API subquery | 47c37c2 | TGovDashboardClient.tsx, aprovacao/route.ts, tgov.ts |
| 2 | Add comment count badge column to AprovacaoTable | e409d5c | TGovDashboardClient.tsx |

## Deviations from Plan

None — plan executed exactly as written. The two `divide-gray-50` instances remaining in TGovDashboardClient.tsx (lines 923 and 990) are inside the CNPJ search result sub-tables (a different modal component), not the AprovacaoTable/ExecucaoTable tbodies targeted by the plan.

## Verification

- `grep -n "divide-gray-100" web/src/app/tgov/TGovDashboardClient.tsx` returns 2 matches (AprovacaoTable and ExecucaoTable tbodies)
- `grep -n "tgov_comments" web/src/app/api/tgov/aprovacao/route.ts` returns 2 matches (subquery)
- `grep -n "commentCount" web/src/lib/tgov.ts` returns 1 match (type field)
- `npx tsc --noEmit` passes cleanly

## Self-Check: PASSED

Files modified confirmed:
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/tgov/TGovDashboardClient.tsx` — modified
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/tgov/aprovacao/route.ts` — modified
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/tgov.ts` — modified

Commits confirmed:
- 47c37c2 — feat(21-04): fix table dividers + add commentCount to aprovacao API and type
- e409d5c — feat(21-04): add comment count badge column to AprovacaoTable
