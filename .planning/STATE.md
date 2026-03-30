---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: Distribuicao, Design & Performance
status: executing
stopped_at: Completed 18-01-PLAN.md
last_updated: "2026-03-30T16:06:10Z"
last_activity: 2026-03-30 -- Plan 18-01 executed (advisory lock + client routing in distributeUnassignedExecucao)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
  percent: 50
---

# Project State: PROJETUS — v4.1 Distribuicao, Design & Performance

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov
**Current focus:** Phase 18 — lead-distribution

## Current Position

Phase: 18 (lead-distribution) — EXECUTING
Plan: 2 of 2
Status: Plan 18-01 complete — advisory lock + client routing in distributeUnassignedExecucao
Last activity: 2026-03-30 -- Plan 18-01 executed (2 tasks, 2 files, 2 min)

Progress: [█████░░░░░] 50%

## Accumulated Context

### Decisions

- Phase 18-01: pg_try_advisory_lock (skip) over pg_advisory_lock (wait) — Vercel 300s timeout makes blocking dangerous if cron already running
- Phase 18-01: existing_clients table (not vendedor_projetos column) is authoritative client detection source in distribution
- Phase 18-01: Lock key 19876543210 documents Phase 18 origin and avoids collision with other advisory lock usages
- Phase 18-01: POST /api/execucao/distribute returns 409 Conflict when lock held (not 200 with empty result)
- v4.1: Phase ordering — Distribution (18) first (zero external deps, 90% code exists), TGov (19) second, Performance (20) third, Design (21) last (blocked on client brand guide)
- v4.1: Phase 21 (Design) has hard external dependency — cannot begin brand token work until client delivers Projete brand guide
- v4.0: Execution pipeline has independent status_contato_execucao field
- v4.0: Memory peak ~1300MB on proposta sync (Vercel Pro default is 2 GB — not a crash risk but wastes headroom)

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 21 (Design Refresh)**: Blocked on Projete brand guide delivery from client. No start date known. Phase 18-20 can proceed independently.
- **Phase 18 (Distribution)**: Pre-deployment gate required — run CNPJ normalization audit before any distribution code ships. Also confirm whether gestor_vendedor role users need to be included in equalization.

## Session Continuity

Last session: 2026-03-30T16:06:10Z
Stopped at: Completed 18-01-PLAN.md
Resume file: .planning/phases/18-lead-distribution/18-01-SUMMARY.md
