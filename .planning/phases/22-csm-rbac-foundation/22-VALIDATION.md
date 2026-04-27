---
phase: 22
slug: csm-rbac-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript / Next.js (no dedicated test runner — manual curl + tsc) |
| **Config file** | tsconfig.json |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && npx next build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit && npx next build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | CSM-01/02/03/04 | compile | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 1 | CSM-01 | curl | `curl -I http://localhost:3000/csm` (expect 302 unauth) | ✅ | ⬜ pending |
| 22-01-03 | 01 | 1 | CSM-02/03/04 | curl | `curl -X GET http://localhost:3000/api/csm/clients -H 'Cookie: ...'` | ✅ | ⬜ pending |
| 22-02-01 | 02 | 2 | CSM-02 | curl | `curl -X POST /api/csm/clients -d '{"razao_social":"Test","cnpj":"00.000.000/0001-00"}'` | ✅ | ⬜ pending |
| 22-02-02 | 02 | 2 | CSM-03 | curl | `curl -X PATCH /api/csm/clients/[cnpj]/contacts -d '{"telefone":"11999999999"}'` | ✅ | ⬜ pending |
| 22-03-01 | 03 | 3 | CSM-04 | curl | `curl /api/csm/comissoes` (expect bruno's data only) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] TypeScript compiles with `npx tsc --noEmit` after canCsm() is added to dal.ts
- [ ] Middleware parses correctly — `/csm` and `/api/csm/*` are not blocked

*Existing infrastructure covers all phase requirements once middleware is patched.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSM session lands on /csm page | CSM-01 | Requires real browser session with bruno@projetus.org | Log in as CSM, navigate to /csm, verify page renders |
| Commission calculations correct | CSM-04 | Requires DB row for bruno in vendedor_projetos | Log in as CSM, visit /csm/comissoes, verify own data shows |
| Non-CSM user blocked from /csm | CSM-01 | Requires session with non-CSM role | Log in as gestor, navigate to /csm, verify redirect |
| Non-CSM blocked from /api/csm/* | CSM-02/03/04 | Requires real session auth | curl with gestor cookie to /api/csm/clients, expect 403 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
