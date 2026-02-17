---
phase: quick-10
plan: 01
subsystem: crm-ui
tags: [leads, pipeline, ux, contacts, commission]
dependency_graph:
  requires: [lead_contacts table, contact_notes table, vendedor_projetos.comissao_locked]
  provides: [days_since_last_contact display, phone validity indicator, principal contact emphasis, commission lock badge]
  affects: [/leads page, LeadContacts component]
tech_stack:
  added: []
  patterns: [correlated subquery, color-coded badge, conditional CSS]
key_files:
  created: []
  modified:
    - web/src/app/api/leads/route.ts
    - web/src/lib/types.ts
    - web/src/app/leads/page.tsx
    - web/src/components/LeadContacts.tsx
decisions:
  - Correlated subqueries for days_since_last_contact and principal_telefone_status (acceptable for current dataset)
  - colSpan incremented for cascade sub-rows to accommodate new Ult. Contato column
  - Principal contact shows filled star (decorative) instead of toggle button; non-principal still shows outline star button
  - Null days treated as 9999 for sort (never-contacted sorts last when ascending)
metrics:
  duration: "2 minutes"
  completed: "2026-02-17"
  tasks_completed: 2
  files_modified: 4
---

# Phase quick-10 Plan 01: Pipeline Enhancements Summary

**One-liner:** 4 pipeline indicators added — color-coded days-since-contact column, phone validity dots, principal contact blue emphasis, and commission lock badges on Fechado leads.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Extend leads API with days_since_last_contact, principal_telefone_status, comissao_locked | e1a3295 | route.ts, types.ts |
| 2 | Add visual indicators to leads table, LeadContacts, and dashboard | a958dc8 | page.tsx, LeadContacts.tsx |

## What Was Built

### Task 1: API Extension

- **`web/src/lib/types.ts`** — Added 3 optional fields to `VendedorProjeto`:
  - `days_since_last_contact?: number | null`
  - `principal_telefone_status?: 'valido' | 'invalido' | 'nao_atende' | 'desconhecido' | null`
  - `comissao_locked?: boolean`

- **`web/src/app/api/leads/route.ts`** — Added 2 correlated subqueries:
  - `days_since_last_contact`: `EXTRACT(DAY FROM NOW() - MAX(cn.created_at))::int` from contact_notes per CNPJ
  - `principal_telefone_status`: telefone_status from lead_contacts ordered by `principal DESC, created_at ASC LIMIT 1`
  - `comissao_locked` already included via `vp.*`

### Task 2: Visual Indicators

- **`web/src/app/leads/page.tsx`:**
  - New sortable column "Ult. Contato" with color-coded badges: gray "Nunca" (null), green 0-2d, amber 3-7d, red >7d
  - Sort case `'dias'` added with null mapping to 9999 (sorts stale last)
  - Phone validity colored dots: green (valido), red (invalido), amber (nao_atende), none for desconhecido/null
  - Lock icon + "Confirmada" text on Fechado leads where `comissao_locked=true`
  - Sub-row colSpan updated from gestor:4/vendedor:3 to gestor:5/vendedor:4

- **`web/src/components/LeadContacts.tsx`:**
  - Principal contact row: `bg-blue-50/50 border-l-2 border-l-[#0072F7]` instead of hover-only bg
  - Principal contact shows filled blue star (decorative, `fill="currentColor"`)
  - Non-principal contacts still show outline star button to set as principal

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| web/src/app/api/leads/route.ts | FOUND |
| web/src/lib/types.ts | FOUND |
| web/src/app/leads/page.tsx | FOUND |
| web/src/components/LeadContacts.tsx | FOUND |
| Commit e1a3295 (Task 1) | FOUND |
| Commit a958dc8 (Task 2) | FOUND |
| TypeScript noEmit | PASSED |
| npm run build | PASSED |
