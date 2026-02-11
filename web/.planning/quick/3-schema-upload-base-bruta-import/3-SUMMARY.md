---
phase: quick-3
plan: 01
subsystem: schema, import, upload
tags: [schema-expansion, siconv, import, upload-ui]
dependency-graph:
  requires: [quick-2]
  provides: [expanded-schema, siconv-import, upload-page]
  affects: [dashboard, leads, lead-detail, slide-over]
tech-stack:
  added: []
  patterns: [format-auto-detection, duplicate-cnpj-detection, drag-drop-upload]
key-files:
  created:
    - web/src/app/upload/page.tsx
  modified:
    - web/src/lib/types.ts
    - web/src/app/api/setup-crm/route.ts
    - web/src/app/api/import-spreadsheet/route.ts
    - web/src/app/api/leads/route.ts
    - web/src/app/api/leads/[cnpj]/route.ts
    - web/src/app/api/dashboard/route.ts
    - web/src/app/api/dashboard-enhanced/route.ts
    - web/src/app/api/filters/natureza-juridica/route.ts
    - web/src/components/LeadTable.tsx
    - web/src/components/LeadSlideOver.tsx
    - web/src/app/page.tsx
    - web/src/app/lead/[cnpj]/page.tsx
    - web/src/app/leads/page.tsx
decisions:
  - "NUMERIC(15,2) for all financial columns instead of VARCHAR"
  - "Status values changed from PROPOSTA/AINDA NAO/RETORNO to Novo/Contactado/Proposta/Retorno"
  - "Duplicate detection by CNPJ - skip and report, not overwrite"
  - "Format auto-detection via header inspection (Siconv indicators vs CRM indicators)"
metrics:
  duration: ~10min
  completed: 2026-02-11
---

# Quick Task 3: Schema Expansion + Base Bruta Import Summary

Expanded vendedor_projetos schema for Siconv base bruta with NUMERIC financial columns, rewrote import endpoint with format auto-detection and duplicate handling, created gestor upload page.

## What Was Done

### Task 1: Schema expansion + update all backend and frontend (917c190)

Replaced the entire data model from the old Manus-style schema (saldo VARCHAR, perc_executado, status_categoria) to an expanded schema supporting TransferenciaGov/Siconv data:

- **Types**: VendedorProjeto now has 30+ fields including codigo_programa, nome_programa, valor_emenda, valor_global, valor_empenhado, valor_liberado (all NUMERIC), situacao, modalidade, natureza_juridica, importado_de
- **Setup-CRM**: CREATE TABLE with proper NUMERIC(15,2) columns, 4 indexes (vendedor, cnpj, status_contato, uf)
- **Dashboard**: Replaced parseSaldo with Number(valor_global), status_categoria with status_contato
- **Dashboard-enhanced**: All SQL queries updated - saldo aggregations now use COALESCE(valor_global, 0), execution distribution uses valor_liberado/valor_global ratio
- **Leads API**: ORDER BY valor_global DESC NULLS LAST, filter param changed to status_contato
- **Lead detail PATCH**: status_contato replaces status_categoria, observacoes no longer sliced to 100 chars
- **Filters**: natureza-juridica route now queries actual natureza_juridica column
- **LeadTable**: Columns now show nome_programa, valor_global (formatted), situacao, uf, status_contato
- **LeadSlideOver**: New info cards for Valor Global, Situacao, Programa, Natureza Juridica; removed progress bar
- **Home page**: Full rewrite of CRM tab - valorGlobal replaces totalSaldo, new status values, edit modal uses textarea for observacoes
- **Leads page + Lead detail page**: Updated all column references

### Task 2: Import endpoint rewrite + Upload UI (33fd78c)

- **Import endpoint**: Format auto-detection from headers (Siconv indicators: "Nr Instrumento", "Objeto", "Saldo em conta" / CRM indicators: "Codigo Programa", "Nome Programa"). Two column maps (SICONV_COLUMN_MAP, CRM_COLUMN_MAP). parseNumeric handles R$ formatting, thousand separators, decimal commas. Duplicate CNPJ detection queries existing CNPJs before insert, tracks within import batch too.
- **Upload page**: Drag-and-drop with cyan accent on drag-over, file selection, gestor-only access check via /api/auth/session. Results card shows format badge (Siconv/CRM), stats grid (total/new/duplicates/errors), per-sheet breakdown table for multi-sheet CRM imports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed lead detail page and leads page not updated**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** lead/[cnpj]/page.tsx and leads/page.tsx still referenced saldo, perc_executado, status_categoria
- **Fix:** Updated both pages with new column names, status values, and formatting
- **Files modified:** web/src/app/lead/[cnpj]/page.tsx, web/src/app/leads/page.tsx

## Self-Check: PASSED

All 15 modified/created files exist and compile. Both commits (917c190, 33fd78c) verified in git log. Zero references to old columns (status_categoria, perc_executado, desembolso, pagamento) in source.
