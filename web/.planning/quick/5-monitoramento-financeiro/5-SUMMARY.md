---
phase: quick-5
plan: 01
subsystem: monitoramento-financeiro
tags: [monitoramento, financeiro, convenios, prospeccao]
dependency-graph:
  requires: [quick-3]
  provides: [monitoramento-page, monitoramento-api]
  affects: [navigation]
tech-stack:
  added: []
  patterns: [server-side-priority-calculation, debounced-filters, glassmorphic-modal]
key-files:
  created:
    - web/src/app/api/monitoramento/route.ts
    - web/src/app/monitoramento/page.tsx
  modified: []
decisions:
  - "Priority thresholds: Alta = <30% exec + >=500k saldo, Baixa = >70% exec, Média = rest"
  - "Default saldo_min filter at R$ 500k to focus on high-value leads"
  - "5 stats cards (not 4) to show all three priority levels separately"
  - "Priority computed server-side, filtered post-computation for accurate stats"
metrics:
  duration: "2m 35s"
  completed: "2026-02-11"
  tasks: 2
  files: 2
---

# Quick Task 5: Monitoramento Financeiro Summary

Full-stack financial monitoring page for convênios in execution with priority-based prospecting (Alta/Média/Baixa based on execution % and remaining balance).

## What Was Built

### API Endpoint: GET /api/monitoramento
- Queries `vendedor_projetos` where `situacao = 'Em execução'` and `saldo_conta > 0`
- Computes `perc_execucao` (valor_liberado / valor_global * 100) and `prioridade` per row
- Priority logic: Alta (<30% exec + >=500k saldo), Baixa (>70% exec), Média (everything else)
- Filters: prioridade, saldo_min (default 500k), uf, search (ILIKE on nome/cnpj)
- Returns `{ stats, convenios }` with aggregated counts from filtered results

### Page: /monitoramento
- **5 stats cards**: Total Monitorados, Total em Saldo, Alta/Média/Baixa priority counts
- **Filter bar**: Priority pill buttons, saldo mínimo input (R$ prefix, debounced 500ms), UF dropdown, search input (debounced 500ms)
- **Table**: Nr Convênio, Organização, UF, Saldo, % Execução (progress bar colored by priority), Prioridade badge, Ver Detalhes button
- **Detail modal**: Informações Básicas, Contato, Financeiro (saldo highlighted in cyan), Execução (progress bar + percentages), Análise de Prioridade (explanation text), TransfereGov link
- **UX**: Striped rows, hover states, responsive horizontal scroll, Escape/backdrop close for modal
- 411 lines, Sigma dark theme with glassmorphism

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | bb11eaa | feat(quick-5): create /api/monitoramento endpoint with priority calculation |
| 2 | a040061 | feat(quick-5): create /monitoramento page with stats, filters, table, and detail modal |

## Self-Check: PASSED
