# CRM e Operacional PDF Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the delivery plan in `docs/entregas/plano-entregas-crm-rooger.pdf` to the live Projetus codebase, close proven technical gaps, and leave human acceptance items explicit.

**Architecture:** Keep TransfereGov tables as the government source of truth and the existing operation tables as a human overlay. Treat `btapps` systemd timers and `btdb` PostgreSQL as production; remove active Vercel assumptions. S5 remains a documented go/no-go decision and does not become production automation in this rollout.

**Tech Stack:** Next.js 14, TypeScript, PostgreSQL, Node test runner through `tsx`, systemd/Coolify, HTML-to-PDF.

**Spec:** `docs/entregas/plano-entregas-crm-rooger.pdf`

## Global Constraints

- Do not change the daily lead-fetch behavior; it is under investigation only and remains scheduled at 09:30 BRT.
- Production application host is `ssh btapps`; production database host is `ssh btdb`.
- Preserve TransfereGov facts; operational checklist/document writes stay in overlay tables.
- Never expose lead PII or credentials in tests, logs, documentation, or evidence.
- Do not implement S5 production automation before a recorded go/no-go, provider choice, and cost approval.
- Preserve unrelated dirty work in `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov`.

## Review Focus

- Unknown `kind` values in the operation PATCH API must be rejected instead of being treated as documents.
- Invalid checklist/document statuses must be rejected for the selected kind.
- Production scheduling evidence must point to systemd on `btapps`, never `web/vercel.json`.
- Operation roles must preserve read/write separation between commercial, CSM, and operational teams.
- A successful sync with zero new leads must remain distinguishable from a failed fetch.

---

### Task 1: Align the isolated worktree with the deployed baseline

**Files:**
- Preserve: `output/pdf/plano-entregas-crm-rooger-final.pdf`
- Preserve: `tmp/pdfs/`

**Interfaces:**
- Consumes: `origin/main` at the production source commit lineage.
- Produces: isolated branch containing the already-delivered S1-S4 implementation.

- [ ] **Step 1: Verify worktree isolation and branch ancestry**

Run: `git rev-parse --git-dir --git-common-dir && git branch --show-current && git merge-base --is-ancestor HEAD origin/main`

Expected: linked worktree on `snak3gh0st/pearleye`; current HEAD is an ancestor of `origin/main`.

- [ ] **Step 2: Fast-forward the isolated branch**

Run: `git merge --ff-only origin/main`

Expected: branch advances without touching the dirty `main` checkout.

- [ ] **Step 3: Install exact web dependencies**

Run: `cd web && npm ci`

Expected: exit 0.

- [ ] **Step 4: Run the existing sprint verifier and build**

Run: `cd web && node scripts/verify-crm-sprints.mjs && npm run build`

Expected: verifier passes and Next.js build exits 0.

### Task 2: Make btapps systemd the versioned scheduling source of truth

**Files:**
- Create: `docs/infra/systemd/projetus-cron@.service`
- Create: `docs/infra/systemd/projetus-cron@sync-leads.timer`
- Create: `docs/infra/systemd/projetus-cron@sync-execucao.timer`
- Create: `docs/infra/systemd/projetus-cron@sync-tgov-only.timer`
- Create: `docs/infra/systemd/projetus-cron@digest.timer`
- Create: `docs/infra/systemd/projetus-cron@digest-evening.timer`
- Modify: `docs/infra/CURRENT_INFRA.md`
- Modify: `README.md`
- Modify: `web/scripts/verify-crm-sprints.mjs`
- Modify: `web/src/app/api/cron/sync-leads/route.ts`
- Modify: `web/src/app/api/cron/sync-execucao/route.ts`
- Modify: `web/src/app/api/cron/sync-tgov-only/route.ts`
- Modify: `web/src/lib/repo-sync.ts`
- Modify: `web/src/lib/tgov-only-sync.ts`

**Interfaces:**
- Consumes: live non-secret `systemctl cat` output from `btapps`.
- Produces: repository checks that require the five systemd timer definitions and no longer treat Vercel as active scheduling evidence.

- [ ] **Step 1: Change the verifier first**

Require the systemd unit/timer files, the exact schedules `09:30`, `10:00`, `10:30`, `11:20`, and `19:00`, plus `Persistent=true`. Remove the active `web/vercel.json` assertion.

- [ ] **Step 2: Run the verifier to observe RED**

Run: `cd web && node scripts/verify-crm-sprints.mjs`

Expected: FAIL because the versioned systemd files do not exist yet.

- [ ] **Step 3: Add the sanitized live unit files and update active-runtime documentation/comments**

Use `btapps`/`btdb` aliases, Coolify/systemd terminology, and keep secrets outside version control.

- [ ] **Step 4: Run the verifier and documentation search to observe GREEN**

Run: `cd web && node scripts/verify-crm-sprints.mjs && ! rg -n "Vercel Cron Job|configured in vercel.json" src/lib src/app/api/cron`

Expected: all checks pass and active cron code contains no Vercel scheduling claim.

- [ ] **Step 5: Commit**

Run: `git add docs/infra README.md web/scripts/verify-crm-sprints.mjs web/src/app/api/cron web/src/lib/repo-sync.ts web/src/lib/tgov-only-sync.ts && git commit -m "docs(infra): make btapps timers the cron source of truth"`

Expected: one focused commit.

### Task 3: Harden operation overlay request validation

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/src/lib/operacao.ts`
- Create: `web/src/lib/operacao.test.ts`
- Modify: `web/src/app/api/operacao/[cnpj]/route.ts`

**Interfaces:**
- Consumes: request fields `kind` and `status`.
- Produces: `isOperacaoKind(value: unknown)` and `isOperacaoStatus(kind, value)` type guards used by the route.

- [ ] **Step 1: Add the test command and failing contract tests**

Test valid kinds, unknown kinds, checklist-only statuses, document-only statuses, and non-string inputs.

- [ ] **Step 2: Run RED**

Run: `cd web && npm test -- src/lib/operacao.test.ts`

Expected: FAIL because the guards do not exist.

- [ ] **Step 3: Implement the guards and use them before selecting a table**

Unknown `kind` returns HTTP 400 with `Tipo de item operacional inválido`; invalid status keeps HTTP 400.

- [ ] **Step 4: Run GREEN and build**

Run: `cd web && npm test -- src/lib/operacao.test.ts && npm run build`

Expected: tests pass and build exits 0.

- [ ] **Step 5: Commit**

Run: `git add web/package.json web/package-lock.json web/src/lib/operacao.ts web/src/lib/operacao.test.ts 'web/src/app/api/operacao/[cnpj]/route.ts' && git commit -m "fix(operacao): reject invalid overlay request types"`

Expected: one focused commit.

### Task 4: Finish S3 and S4 operational handoff material

**Files:**
- Modify: `docs/entregas/s3-whatsapp-meta-api-checklist.md`
- Modify: `docs/entregas/s4-estrutura-operacional.md`
- Create: `docs/entregas/onboarding-areas-crm-operacao.md`
- Create: `docs/entregas/mapa-ownership-crm-operacao.md`

**Interfaces:**
- Consumes: current role gates in `web/src/lib/dal.ts` and current UI routes.
- Produces: one operator-facing onboarding guide and one authoritative ownership map.

- [ ] **Step 1: Add explicit evidence fields to S3 and S4 acceptance checklists**

Include tester, role, date, evidence link/reference, observed result, and accept/reject decision. Do not invent a validated WhatsApp number or Danilo approval.

- [ ] **Step 2: Write onboarding by area**

Cover Comercial, Execução, Prestação de Contas, CSM, and Gestão with entry route, allowed actions, forbidden actions, and escalation path.

- [ ] **Step 3: Write the ownership map from actual role gates**

Map source of truth, read roles, write roles, operational owner, and escalation owner for leads, TGov facts, checklist, documents, notifications, and WhatsApp.

- [ ] **Step 4: Validate names against code**

Run: `rg -n "canReadOperacao|canWriteOperacao|canReadTgov|canWriteTgov|canCsm" web/src/lib/dal.ts docs/entregas`

Expected: documentation names every current gate without granting extra authority.

- [ ] **Step 5: Commit**

Run: `git add docs/entregas && git commit -m "docs(crm): complete S3 and S4 operational handoff"`

Expected: one focused commit.

### Task 5: Deliver the S5 pricing and go/no-go brief without enabling automation

**Files:**
- Create: `docs/entregas/s5-pricing-agente-ia-rooger.md`

**Interfaces:**
- Consumes: current official OpenAI and Meta/WhatsApp pricing sources, retrieved on the execution date.
- Produces: low/base/high monthly scenarios, assumptions, exclusions, provider links, and a signed decision section.

- [ ] **Step 1: Retrieve current official pricing sources**

Use official provider documentation only; record retrieval date and currency.

- [ ] **Step 2: Calculate three auditable scenarios**

Show message/conversation assumptions, model-token assumptions, platform fee placeholder, and a formula that can be recalculated.

- [ ] **Step 3: State the production gate**

No webhook, routing, or automated outreach ships until provider, lawful basis/opt-in, templates, budget owner, and rollback owner are approved.

- [ ] **Step 4: Validate the document**

Run: `rg -n "Fonte oficial|Premissas|Cenário baixo|Cenário base|Cenário alto|Go/no-go|Sem automação" docs/entregas/s5-pricing-agente-ia-rooger.md`

Expected: every required section is present.

- [ ] **Step 5: Commit**

Run: `git add docs/entregas/s5-pricing-agente-ia-rooger.md && git commit -m "docs(ai): add Rooger pricing and go-no-go brief"`

Expected: one focused commit.

### Task 6: Verify the applied plan against production without mutating business data

**Files:**
- Modify: `docs/entregas/plano-entregas-crm-rooger-final.md`

**Interfaces:**
- Consumes: `btapps` timer/container evidence, `btdb` aggregate schema/count evidence, public authentication boundaries.
- Produces: evidence ledger separating code, deployed runtime, database readiness, and pending human acceptance.

- [ ] **Step 1: Verify runtime and protected routes**

Check production source commit, `/operacao` login redirect, `/api/operacao` unauthorized response, and timer status.

- [ ] **Step 2: Verify database readiness in `BEGIN READ ONLY`**

Record only aggregate counts for `projetos_execucao`, `operacao_checklists`, `operacao_documentos`, and `operacao_eventos`.

- [ ] **Step 3: Write the evidence ledger**

Mark S1-S4 technical status separately from S3 number validation, S4 operator acceptance, and S5 go/no-go.

- [ ] **Step 4: Commit**

Run: `git add docs/entregas/plano-entregas-crm-rooger-final.md && git commit -m "docs(crm): record delivery-plan production evidence"`

Expected: one focused commit.

### Task 7: Produce the final PDF and run the whole verification gate

**Files:**
- Modify: `tmp/pdfs/plano-entregas-crm-rooger-final.html`
- Create: `output/pdf/plano-entregas-crm-rooger-final.pdf`

**Interfaces:**
- Consumes: the evidence ledger and completed handoff documents.
- Produces: final A4 PDF with delivered, ready-for-acceptance, and gated items clearly separated.

- [ ] **Step 1: Update the PDF source from the verified ledger**

Do not mark human acceptance complete without evidence.

- [ ] **Step 2: Render and inspect every page**

Run: Chrome headless print, `pdfinfo`, `pdftotext -layout`, and `pdftoppm -png`.

Expected: three readable A4 pages, no clipping, overlap, placeholders, or broken glyphs.

- [ ] **Step 3: Run the full project gate**

Run: `cd web && npm test && node scripts/verify-crm-sprints.mjs && npm run build && cd .. && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 4: Review the branch against the PDF requirement list**

Expected: S1-S4 technical requirements have code or documented evidence; S3/S4 human acceptance and S5 go/no-go remain explicit gates.
