---
phase: quick-6
plan: 01
subsystem: dashboard-crm
tags: [crm, dashboard, gestor, pipeline]
key-files:
  created:
    - web/src/app/api/dashboard-crm/route.ts
  modified:
    - web/src/app/page.tsx
decisions:
  - "5 status pipeline (Novo/Tentativa/Contactado/Negociacao/Sem Interesse) with color-coded bar"
  - "Replaced entire home page rather than adding tab"
metrics:
  duration: 101s
  completed: 2026-02-11
---

# Quick Task 6: Dashboard CRM Gestor Summary

CRM admin dashboard at / with global stats, status pipeline bar, per-vendedor cards, and activity feed -- ready for Tito's meeting.

## What Was Built

### API Endpoint: GET /api/dashboard-crm
- Three SQL queries: global aggregations, per-vendedor GROUP BY, recent activity
- CASE WHEN for status counting (avoids multiple queries)
- Returns structured JSON: `{ global, vendedores[], recent_activity[] }`
- Auth via `getApiSession()`, 401 if not authenticated

### Home Page: CRM Dashboard (replaced previous overview+CRM tabs)
- **Global stats row:** Total leads, Atribuidos (with %), Nao Atribuidos (with %), Valor em Emendas
- **Pipeline bar:** Horizontal stacked bar with 5 color-coded segments + hover tooltips
- **Vendedor cards:** Grid with name, lead count, 5 status badges, valor total, last activity time-ago
- **Activity feed:** Last 10 updates with vendedor name, lead name, CNPJ, status badge, time-ago
- Skeleton loading state, error handling, responsive grid layout

### Styling
- Glassmorphic cards: `bg-gray-900/40 backdrop-blur-sm border border-gray-800`
- Neon cyan (#06b6d4) for values and highlights
- Status colors: Novo=red, Tentativa=amber, Contactado=blue, Negociacao=emerald, Sem Interesse=gray

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 948bde4 | feat(quick-6): add /api/dashboard-crm endpoint |
| 2 | 7cbcc44 | feat(quick-6): replace home page with CRM gestor dashboard |

## Self-Check: PASSED
