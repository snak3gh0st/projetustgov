---
phase: quick-55
plan: 01
subsystem: bi-dashboard, dashboard-crm
tags: [sql-fix, gestor-exclusion, commission, kpi, audit]
dependency_graph:
  requires: []
  provides: [accurate-bi-kpis, gestor-excluded-commission-chart, correct-ticket-medio, correct-ainda-nao-count]
  affects: [web/src/app/api/bi/route.ts, web/src/app/api/dashboard-crm/route.ts]
tech_stack:
  added: []
  patterns: [CASE WHEN role exclusion, per-CNPJ subquery aggregation]
key_files:
  created: []
  modified:
    - web/src/app/api/bi/route.ts
    - web/src/app/api/dashboard-crm/route.ts
decisions:
  - "Use CASE WHEN u.role != 'gestor' in dashboard-crm query 5 to zero gestor rows without changing COUNT(*)"
  - "Per-CNPJ subquery for ticket_medio prevents multi-emenda CNPJs from inflating the average"
  - "Bug 5 (Paulo summary total) already correct via paulo_breakdown.total_geral — no code change needed"
metrics:
  duration: "5 minutes"
  completed: "2026-02-24T18:56:04Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-55 Plan 01: Fix 5 Audit Bugs (BI Chart Gestor Filter) Summary

**One-liner:** SQL-only fixes: gestor excluded from BI commission chart, ainda_nao_count guarded to assigned leads, ticket_medio averaged per-CNPJ, dashboard-crm commission sum zeroes gestor rows.

## What Was Done

### Task 1: Fix 3 BI SQL bugs in `web/src/app/api/bi/route.ts`

**Fix A — Query 9 (commission_by_vendedor): gestor exclusion**

Added `AND u.role != 'gestor'` to the WHERE clause of the commission bar chart query. Tito (gestor role) was appearing as a bar with R$0 commission (or whatever comissao_valor was stored) because the query joined users but did not filter out gestor-role users.

Before:
```sql
WHERE vp.vendedor_id IS NOT NULL
${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
```

After:
```sql
WHERE vp.vendedor_id IS NOT NULL
  AND u.role != 'gestor'
  ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
```

**Fix B — Query 6 (ainda_nao_count): vendedor_id IS NOT NULL guard**

The `ainda_nao_count` CASE expression was counting all CNPJs with status 'Ainda Não', including unassigned leads. The fix adds `AND vp.vendedor_id IS NOT NULL` inside the CASE condition, consistent with how `nao_contatado_count` was already guarded.

Before:
```sql
COUNT(DISTINCT CASE WHEN vp.status_contato = 'Ainda Não' THEN vp.cnpj END)::int as ainda_nao_count
```

After:
```sql
COUNT(DISTINCT CASE WHEN vp.status_contato = 'Ainda Não' AND vp.vendedor_id IS NOT NULL THEN vp.cnpj END)::int as ainda_nao_count
```

**Fix C — Query 5 (ticket_medio): per-CNPJ subquery**

The original query computed `AVG(vp.valor_venda)` directly across all emenda rows. For CNPJs with multiple emendas each having their own `valor_venda`, this averaged across rows (not per-CNPJ), artificially inflating the ticket average. The fix uses a subquery to first average per CNPJ, then averages across CNPJs.

Before: flat `AVG(vp.valor_venda::numeric) FILTER (WHERE status = 'Fechado' AND valor_venda > 0)`

After: subquery `SELECT vp.cnpj, AVG(vp.valor_venda::numeric) as cnpj_avg ... GROUP BY vp.cnpj` then outer `AVG(cnpj_avg)`

Commit: `205f19f`

---

### Task 2: Fix dashboard-crm commission_breakdown in `web/src/app/api/dashboard-crm/route.ts`

**Fix — Query 5 (commission_breakdown): gestor commission zeroed**

The `total_comissao` SUM in query 5 included all rows where `comissao_valor > 0`, without checking the user's role. Since Tito (gestor) has comissao_valor stored (from before the gestor R$0 enforcement), this inflated the total. The fix adds a JOIN to users and uses `CASE WHEN u.role != 'gestor' THEN vp.comissao_valor ELSE 0 END` — matching the pattern already used in query 2 of the same file.

Before:
```sql
SUM(vp.comissao_valor)::numeric as total_comissao
FROM vendedor_projetos vp
```

After:
```sql
SUM(CASE WHEN u.role != 'gestor' THEN vp.comissao_valor ELSE 0 END)::numeric as total_comissao
FROM vendedor_projetos vp
JOIN users u ON u.id = vp.vendedor_id
```

`COUNT(*)` is unchanged so the row count still reflects all Fechado rows regardless of role.

Commit: `81c3a7a`

---

### Bug 5: Paulo summary total — already correct (no change needed)

Confirmed via grep that `comissoes/page.tsx` already uses `paulo_breakdown.total_geral` for the "Minha Comissao Total" card in the coordenador view (lines 331-333). This correctly includes the 1% coordenador commission because `paulo_breakdown.total_geral` aggregates all commission types including the coordenador percentage. No code change required.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `web/src/app/api/bi/route.ts` modified with 3 SQL fixes
- [x] `web/src/app/api/dashboard-crm/route.ts` modified with commission JOIN + CASE WHEN
- [x] Commit `205f19f` exists (Task 1)
- [x] Commit `81c3a7a` exists (Task 2)
- [x] Bug 5 confirmed already resolved in comissoes/page.tsx
