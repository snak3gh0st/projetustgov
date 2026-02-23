---
phase: quick-49
plan: 01
subsystem: dashboard
tags: [pipeline, percentages, ux, funnel]
dependency_graph:
  requires: []
  provides: ["pipeline-card-pct-denominator-nao-contatado"]
  affects: ["web/src/app/page.tsx"]
tech_stack:
  added: []
  patterns: ["IIFE to derive constant before .map()", "Math.min/Math.max for progress bar clamping"]
key_files:
  created: []
  modified:
    - web/src/app/page.tsx
decisions:
  - "Use IIFE pattern to derive naoContatadoCount once outside STATUS_ORDER.map() — avoids redundant lookup per iteration"
  - "Não Contatado is the funnel entry point; showing each downstream status as % of that pool is more meaningful than % of total leads"
metrics:
  duration: "5 minutes"
  completed: "2026-02-23T21:35:00Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 49: Fix pipeline card pct denominator to Não Contatado Summary

**One-liner:** Pipeline card percentages now use Não Contatado count as denominator — funnel entry-point = 100%, downstream statuses show fraction of initial pool.

## What Was Done

Changed the `pct` calculation in the Pipeline de Vendas section of `web/src/app/page.tsx` so that each status card's percentage is relative to the "Não Contatado" count rather than `g.total_leads`.

**Before:**
```tsx
const pct = g.total_leads > 0 ? (count / g.total_leads) * 100 : 0
```

**After:**
```tsx
const naoContatadoCount = g.by_status['Não Contatado'] || 0
const pct = naoContatadoCount > 0 ? (count / naoContatadoCount) * 100 : 0
```

The `naoContatadoCount` is derived once outside the `STATUS_ORDER.map()` via an IIFE to avoid redundant object lookups per iteration.

Also added `Math.min(..., 100)` to the progress bar width clamp so the bar never visually overflows:
```tsx
style={{ width: `${Math.min(Math.max(pct, 2), 100)}%` }}
```

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Change pipeline card pct denominator to Não Contatado | Done | 60a5d88 |

## Verification

- TypeScript: `./node_modules/.bin/tsc --noEmit` passes with zero errors
- `g.by_status['Não Contatado']` is the pct denominator in pipeline section
- Progress bar width capped at 100% via Math.min guard

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `web/src/app/page.tsx` modified: confirmed
- Commit 60a5d88 exists: confirmed
- TypeScript clean: confirmed
