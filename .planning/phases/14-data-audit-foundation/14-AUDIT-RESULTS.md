# Phase 14 Data Audit Results

**Run date:** 2026-03-18
**Script:** web/scripts/audit-phase14.js

## 1. NULL proposta_id in "em execucao" Convenios

| Metric | Value |
|--------|-------|
| Total convenios em execucao | 44035 |
| With proposta_id | 44035 |
| NULL or empty proposta_id | 0 |

As of 2026-03-18, there are zero convenios in "em execucao" state with a missing proposta_id. All 44,035 records have a valid proposta_id and would survive an INNER JOIN. However, this count is a point-in-time snapshot — see Gap-Handling Strategy section below.

## 2. CNPJ Length Distribution in Proponentes

| Metric | Value |
|--------|-------|
| Total proponentes | 27215 |
| Correct (14 chars) | 27215 |
| Short (< 14 chars) | 0 |
| Long (> 14 chars) | 0 |
| Min length | 14 |
| Max length | 14 |

### CNPJ Migration Applied

No — all CNPJs already 14 characters. No migration needed.

All 27,215 proponente records have a correctly zero-padded 14-digit CNPJ. The Python ETL that populated this table applied CNPJ normalization consistently. No LPAD migration was required or applied.

## 3. Gap-Handling Strategy for Phase 15

**Decision:** Phase 15 ETL MUST use LEFT JOIN with join_miss_count logging regardless of the NULL proposta_id count.

**Rationale:** The diagnostic result is a point-in-time snapshot. Future Python ETL runs may insert new convenios with NULL proposta_id. The architecture decision is permanent; the diagnostic count is transient. LEFT JOIN with logged miss count is the safe default — it makes data gaps visible instead of silently dropping records (the known anti-pattern from instruments/route.ts INNER JOIN).

**Reference:** STATE.md locked decision: "LEFT JOIN with join_miss_count for proposta join — INNER JOIN silently drops projects with NULL proposta_id; LEFT JOIN + logged miss count makes data loss visible"

**Implementation guidance for Phase 15:**
- Use `LEFT JOIN propostas ON c.proposta_id = prop.transfer_gov_id`
- Count rows where `prop.transfer_gov_id IS NULL` (join misses) and log as `join_miss_count` in sync stats
- Do not use INNER JOIN even though current count = 0 — the architectural decision must not depend on a snapshot
