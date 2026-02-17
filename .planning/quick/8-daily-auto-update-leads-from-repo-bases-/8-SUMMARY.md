---
phase: quick-8
plan: 01
subsystem: api
tags: [cron, vercel, csv, zip, upsert, siconv, repo-sync]

# Dependency graph
requires:
  - phase: quick-16
    provides: import-repo-auto.mjs logic for CSV parsing and lead building
provides:
  - Daily automated UPSERT-based lead sync from repositorio.dados.gov.br
  - Vercel cron endpoint at /api/cron/sync-leads
  - Core sync library at web/src/lib/repo-sync.ts
  - Unique constraint on vendedor_projetos(cnpj, codigo_programa) for upsert support
affects: [setup-crm, leads, distribuir]

# Tech tracking
tech-stack:
  added: []
  patterns: [ZIP streaming via zlib.createInflateRaw, UPSERT with ON CONFLICT preserving CRM state, Vercel cron with CRON_SECRET auth]

key-files:
  created:
    - web/src/lib/repo-sync.ts
    - web/src/app/api/cron/sync-leads/route.ts
  modified:
    - web/vercel.json
    - web/src/app/api/setup-crm/route.ts

key-decisions:
  - "UPSERT preserves CRM fields (vendedor_id, status_contato, valor_venda, comissao_*) while updating repo fields"
  - "ZIP files downloaded as buffers (6-11MB each), CSVs streamed via zlib.createInflateRaw + readline"
  - "Round-robin vendedor assignment for new leads only; existing assignments preserved"
  - "Cron schedule 06:00 UTC daily (03:00 BRT)"
  - "BrasilAPI enrichment limited to 20 new leads per sync, with 280s timeout guard"

patterns-established:
  - "Vercel cron pattern: CRON_SECRET bearer auth + maxDuration=300 + vercel.json crons array"
  - "UPSERT pattern: ON CONFLICT (cnpj, codigo_programa) with selective SET clause"

requirements-completed: [CRON-SYNC-01]

# Metrics
duration: 5min
completed: 2026-02-17
---

# Quick Task 8: Daily Auto-Update Leads from Repo Bases - Summary

**Vercel cron job syncing 3 siconv ZIP files daily via UPSERT, preserving CRM state while refreshing repo data fields**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-17T14:22:26Z
- **Completed:** 2026-02-17T14:28:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `repo-sync.ts` library that downloads 3 siconv ZIPs, stream-parses CSVs, and UPSERTs leads preserving all CRM state
- Created `/api/cron/sync-leads` endpoint with CRON_SECRET authentication and 300s timeout
- Added cron schedule to `vercel.json` for daily execution at 06:00 UTC
- Added unique constraint on `(cnpj, codigo_programa)` to `setup-crm` route with deduplication migration
- Ported all helper functions from `import-repo-auto.mjs`: cleanCNPJ, parseBRNumber, formatPhone, fixText

## Task Commits

Each task was committed atomically:

1. **Task 1: Add unique constraint + create repo-sync library** - `49c0780` (feat)
2. **Task 2: Create cron API route + configure Vercel cron schedule** - `a4b7773` (feat)

## Files Created/Modified
- `web/src/lib/repo-sync.ts` - Core sync library: download ZIPs, stream-parse CSVs, UPSERT leads with round-robin assignment
- `web/src/app/api/cron/sync-leads/route.ts` - Vercel cron endpoint with CRON_SECRET auth, maxDuration=300
- `web/vercel.json` - Added crons configuration for daily 06:00 UTC schedule
- `web/src/app/api/setup-crm/route.ts` - Added deduplication + unique index on (cnpj, codigo_programa)

## Decisions Made
- Used `zlib.createInflateRaw()` with `readline` for memory-efficient CSV streaming from ZIP files (no new dependencies needed)
- UPSERT ON CONFLICT clause selectively updates ONLY repo data fields (nome_programa, link_externo, orgao_concedente, qualificacao, nr_emenda, parlamentar, valor_emenda) while NEVER touching CRM fields (vendedor_id, status_contato, valor_venda, comissao_*, tipo_vendedor, observacoes, comissao_locked, comissao_bonus)
- COALESCE pattern for uf/municipio/telefone/email: preserves existing values, fills if missing
- BrasilAPI enrichment capped at 20 CNPJs per sync with 250s timeout guard to stay within Vercel 300s limit
- Dedup migration runs BEFORE unique index creation to handle pre-existing duplicate rows

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

**Environment variable required:** The user must add `CRON_SECRET` to their Vercel project environment variables. Vercel auto-generates this when crons are configured, OR the user can set a custom one.

Steps:
1. Deploy to Vercel (the cron config will be detected from `vercel.json`)
2. Vercel will auto-set `CRON_SECRET` for cron job authentication
3. For manual testing: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-leads`

## Next Phase Readiness
- Cron endpoint ready to deploy and trigger automatically on Vercel
- Unique constraint on (cnpj, codigo_programa) enables safe re-runs without data duplication
- The destructive TRUNCATE+INSERT import script can be retired in favor of this UPSERT-based sync

## Self-Check: PASSED

All 4 files verified present. Both task commits (49c0780, a4b7773) verified in git log.

---
*Phase: quick-8*
*Completed: 2026-02-17*
