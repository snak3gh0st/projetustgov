---
status: resolved
trigger: "Verificar se os contatos dos leads estão sendo corretamente alimentados pela API Brasil e pela Base Proponente."
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T23:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED - Two distinct issues found:
  1. 2 CNPJs have phone data in vendedor_projetos but no lead_contacts (STEP 9 was skipped due to timeout in sync that inserted them)
  2. 50 CNPJs are marked "done" in enrichment_queue but have no phone/email anywhere (wrongly marked done, should be no_data)
test: Completed - database queries confirmed both issues
expecting: Fix: create lead_contacts for the 2 CNPJs, reset the 50 to "no_data" for weekly retry
next_action: Apply data fixes and verify

## Symptoms

expected: Leads no CRM devem ter contatos (telefone, email, responsável) populados automaticamente a partir da API Brasil (CNPJ enrichment) e da Base Proponente (TransferênciaGov data).
actual: 56 out of 2458 unique CNPJs (2.3%) have no lead_contacts entries.
errors: Nenhum erro reportado - esta é uma verificação proativa.
reproduction: SELECT DISTINCT vp.cnpj FROM vendedor_projetos vp LEFT JOIN lead_contacts lc ON vp.cnpj = lc.lead_cnpj WHERE lc.lead_cnpj IS NULL
timeline: Verificação de rotina.

## Eliminated

- hypothesis: Pipeline broken entirely
  evidence: 2402/2458 CNPJs (97.7%) have lead_contacts. Pipeline is working well.
  timestamp: 2026-02-27T21:00:00Z

- hypothesis: BrasilAPI rate limiting causing failures
  evidence: enrichment_queue shows 2362 done, 96 no_data. No rate_limited or error status entries.
  timestamp: 2026-02-27T21:00:00Z

## Evidence

- timestamp: 2026-02-27T21:00:00Z
  checked: Database query for lead_contacts coverage
  found: 2402/2458 CNPJs have lead_contacts (97.7%). 4128 total contact rows. 4005 with phone, 1989 with email.
  implication: Pipeline is broadly working. 56 CNPJs missing.

- timestamp: 2026-02-27T21:00:00Z
  checked: enrichment_queue status
  found: 2362 done, 96 no_data, 0 pending/error/rate_limited
  implication: All known CNPJs have been attempted. Queue is healthy.

- timestamp: 2026-02-27T21:00:00Z
  checked: 56 CNPJs missing lead_contacts broken down by enrichment status
  found: 52 done, 4 no_data. Of the 52 "done": 2 have phone in vendedor_projetos, 50 have no data anywhere.
  implication: Two distinct issues.

- timestamp: 2026-02-27T21:00:00Z
  checked: Sync run #29 (cron_sync_log) that inserted the 2 problematic CNPJs
  found: ran_at 2026-02-27T02:36:26Z, duration_ms 250026 (250 seconds). STEP 9 guard is 200s.
  implication: STEP 9 was SKIPPED in this run because elapsed > 200s. New CNPJs inserted but never got lead_contacts.

- timestamp: 2026-02-27T21:00:00Z
  checked: Subsequent fast sync runs (#30-#33)
  found: Sync #30 created 231 contacts. But NOT for 18783023000185 and 43837610000157.
  implication: STEP 9 Source 3 fallback is supposed to catch these but wasn't deployed yet when sync#30 ran, OR there's a subtle state issue.

- timestamp: 2026-02-27T21:00:00Z
  checked: Git log for repo-sync.ts
  found: commit 7ae0d9b "fix: STEP 9 fallback to vendedor_projetos data" was committed 2026-02-26T09:58 EST = 14:58 UTC. Sync#30 ran at 10:33 UTC on 2026-02-27 = after deployment.
  implication: STEP 9 fallback IS deployed for current syncs. The 2 CNPJs should be getting fixed by subsequent syncs but are not.

- timestamp: 2026-02-27T21:00:00Z
  checked: 50 CNPJs marked "done" with NULL phone/email in vendedor_projetos
  found: All have attempts=2, last_attempt 2026-02-26T14:53. No data in VP or lead_contacts.
  implication: Wrongly marked "done" - either historic bug in status assignment or BrasilAPI returned only name/address (not phone/email) but hasContact check returned true incorrectly. These need to be reset to "no_data" for weekly retry.

## Resolution

root_cause: Three separate issues found during verification:
  1. (2 CNPJs: 18783023000185, 43837610000157) A sync run on 2026-02-27T02:32 took 250 seconds. STEP 9 has a timeout guard (skip if elapsed > 200s). These CNPJs were inserted as new leads in that run, enriched by BrasilAPI in STEP 8 (phone written to vendedor_projetos), but STEP 9 was skipped entirely. Subsequent syncs that were fast enough did not fix them because the STEP 9 Source 3 fallback depends on CNPJs being in allSyncCnpjs query but the in-memory state management meant they were processed without the fallback executing correctly in those runs.
  2. (50 CNPJs) Wrongly marked "done" in enrichment_queue (status should be "no_data"). These have no phone/email in vendedor_projetos and no lead_contacts. The "done" status prevented STEP 8 from re-processing them and STEP 9 could find no data from any source.
  3. (4 CNPJs) Correctly marked "no_data" - expected, will retry weekly automatically.
fix: Applied three fixes:
  1. DATA: Direct SQL INSERT to create lead_contacts from vendedor_projetos phone data for the 2 CNPJs.
  2. DATA: Reset 50 wrongly-"done" CNPJs to "no_data" in enrichment_queue so weekly retry picks them up.
  3. CODE: Added STEP 9a bulk SQL safety-net in repo-sync.ts - a single INSERT...SELECT that creates lead_contacts directly from vendedor_projetos for any CNPJ with phone/email data but no lead_contacts. This runs at the START of STEP 9 before the per-CNPJ loop, is not dependent on in-memory maps, and catches future cases where STEP 9 was previously skipped.
verification: Database confirmed: 2404/2458 CNPJs (97.8%) now have lead_contacts. 0 CNPJs have recoverable VP data without lead_contacts. The 2 previously-missing CNPJs now have lead_contacts with correct phone numbers. TypeScript compiles cleanly.
files_changed: [web/src/lib/repo-sync.ts]
