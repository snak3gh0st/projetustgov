---
task: 31
title: "Fix cascade grouping to separate rows per parlamentar/emenda + gestor auth for cron sync"
date: 2026-02-17
commits: [fc4932c, 82cf535]
status: complete
---

# Quick Task 31: Summary

## What Changed

### Data Model (repo-sync.ts)
- **Before:** One DB row per `(cnpj, codigo_programa)` with pipe-concatenated parlamentar/nr_emenda/valor_emenda
- **After:** One DB row per emenda — each parlamentar gets its own row with individual values
- STEP 5b added: deletes old concatenated rows after preserving vendedor assignments via CNPJ-level fallback map
- UPSERT conflict key: `(cnpj, codigo_programa, COALESCE(nr_emenda, ''))`

### Database Index (setup-crm/route.ts)
- Dropped: `idx_vp_cnpj_codigo_programa` (old unique constraint forcing collapse)
- Created: `idx_vp_cnpj_prog_emenda` expression index allowing multiple rows per program

### Leads API (leads/route.ts)
- `emenda_count` changed from `COUNT(DISTINCT nr_emenda)` to `COUNT(*)` (nr_emenda now per-row)

### Cron Auth (cron/sync-leads/route.ts)
- Added gestor session as fallback auth alongside CRON_SECRET for manual browser triggers

## Results

- Leads: 386 → 421 rows (35 previously hidden parlamentar rows now separate)
- Cascade expand buttons: 35 visible on leads page
- Verified: SERVICO NACIONAL DE APRENDIZAGEM INDUSTRIAL shows 2 sub-rows (ROGERIO MARINHO R$500K + BENES LEOCADIO R$200K) under same program
- Production migration: setup-crm index + repo-sync re-import ran successfully on Vercel

## Files Changed

| File | Change |
|------|--------|
| `web/src/lib/repo-sync.ts` | One-row-per-emenda data model, STEP 5b cleanup, CNPJ fallback assignments |
| `web/src/app/api/setup-crm/route.ts` | New expression index for multi-parlamentar support |
| `web/src/app/api/leads/route.ts` | Emenda count query fix |
| `web/src/app/api/cron/sync-leads/route.ts` | Gestor session auth fallback |
