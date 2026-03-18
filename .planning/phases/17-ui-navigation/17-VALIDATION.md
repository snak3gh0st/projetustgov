---
phase: 17
slug: ui-navigation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — manual functional verification |
| **Config file** | none |
| **Quick run command** | Manual browser check (navigate /execucao as gestor) |
| **Full suite command** | Manual checklist below + API curl checks |
| **Estimated runtime** | ~5-10 minutes manual walkthrough |

---

## Sampling Rate

- **After every task commit:** Manual browser check of affected component
- **After every plan wave:** Full manual checklist + API curl checks
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds (page reload)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 17-01-01 | 01 | 1 | UI-02 | manual | Login as gestor → navigate /execucao → page loads | ⬜ pending |
| 17-01-02 | 01 | 1 | UI-02 | manual | Login as vendedor → navigate /execucao → redirected to /sem-permissao | ⬜ pending |
| 17-01-03 | 01 | 1 | AGR-01 | manual | Confirm table rows show CNPJ + fomentos count | ⬜ pending |
| 17-01-04 | 01 | 1 | UI-03 | manual | Confirm 4 KPI cards at top with correct values | ⬜ pending |
| 17-01-05 | 01 | 1 | UI-04 | manual | Confirm 10 table columns in correct order | ⬜ pending |
| 17-02-01 | 02 | 1 | AGR-02, AGR-04 | manual | Click CNPJ row → slide-over opens with financial detail | ⬜ pending |
| 17-02-02 | 02 | 1 | AGR-03 | manual | Contact badge visible for CNPJs in lead_contacts | ⬜ pending |
| 17-03-01 | 03 | 1 | UI-01 | manual | Gestor sidebar shows "Projetos em Execução" nav entry | ⬜ pending |
| 17-03-02 | 03 | 1 | UI-02 | manual | Vendedor sidebar does NOT show "Projetos em Execução" | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No automated test framework needed — manual functional verification is the established pattern (consistent with Phase 16).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CNPJ table renders with fomentos big number | AGR-01 | No test framework; visual verification | Navigate /execucao as gestor, confirm each row has CNPJ + count |
| Slide-over shows full financial detail | AGR-02, AGR-04 | Visual verification of layout | Click CNPJ row → confirm desembolso, saldo, % bar, data fim, dias |
| Contact badge appears for known CNPJs | AGR-03 | Requires cross-referencing DB | Find CNPJ in lead_contacts, confirm badge in table + slide-over |
| KPI cards compute correct values | UI-03 | Visual verification + mental math | Note row values, confirm KPI sums match |
| Alert highlighting visible | SC-3 | Visual verification of border/badge | Confirm rows with valor_desembolsado=0 have amber border + badge |
| Freshness timestamp correct | SC-5 | Visual + DB cross-reference | Confirm "Dados atualizados em" date matches cron_sync_log |
| Role redirect to /sem-permissao | UI-02 | Browser session state required | Login as vendedor → /execucao → confirm /sem-permissao |

---

## API Contract Checks

```bash
# Check 1: GET /api/execucao returns { rows, last_synced }
curl -s http://localhost:3000/api/execucao | python3 -c "import sys,json; d=json.load(sys.stdin); print(type(d), list(d.keys()))"

# Check 2: Slide-over detail fetch returns array of convenios
curl -s http://localhost:3000/api/execucao/12345678000195 | python3 -c "import sys,json; d=json.load(sys.stdin); print(type(d), len(d), 'rows')"
```

---

## Validation Sign-Off

- [ ] All tasks have manual verification steps defined
- [ ] Sampling continuity: manual check after each task commit
- [ ] No automated test gaps (all manual by design)
- [ ] Feedback latency < 60s (page reload)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
