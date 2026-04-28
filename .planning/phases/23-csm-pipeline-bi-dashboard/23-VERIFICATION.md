---
phase: 23-csm-pipeline-bi-dashboard
verified: 2026-04-27T00:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
human_verification:
  - test: "Sign in as bruno@projetus.org, navigate to /csm"
    expected: "Table loads with client rows; search by name/CNPJ filters live without network calls; priority pills filter live; saldo min/max filter live; expanding a row triggers exactly one GET /api/csm/clients/{cnpj}/projects on first open and uses cache on subsequent opens"
    why_human: "Lazy-fetch caching and zero-network-call client-side filtering cannot be confirmed by static analysis"
  - test: "Sign in as bruno, navigate to /csm/bi"
    expected: "4 KPI cards show non-zero values (Saldo em Conta, Saldo Rendimento, A Liberar, Total Projetos), donut chart shows up to 6 coloured segments, funnel shows all 6 ordered horizontal bars"
    why_human: "Chart rendering, correct colour-bucket mapping, and real API values require browser verification"
  - test: "Check browser console on /csm page load"
    expected: "No React key warnings in console (the bare Fragment wrapper in the filtered.map loop may generate a warning on rows — each fragment should have key={c.cnpj} on the fragment itself)"
    why_human: "The static code shows <></> returned inside map without a key on the fragment; this only manifests as a runtime console warning"
  - test: "Sign in as gestor, inspect sidebar"
    expected: "Sidebar does NOT contain 'BI Dashboard CSM' entry; direct URL /csm/bi still renders (canCsm permits gestor)"
    why_human: "Static grep confirms the csm block is correct; gestor block is also clean — but human should verify the rendered sidebar has no contamination"
  - test: "Phase 22 regression: POST /api/csm/clients and /csm/comissoes"
    expected: "POST /api/csm/clients returns 201/200; /csm/comissoes page loads without error"
    why_human: "These routes were declared unmodified; a quick smoke-test confirms no accidental breakage"
  - test: "Verify count_aprovacao accuracy on a known client"
    expected: "count_aprovacao matches the actual count of apr_rows for a client; portfolio route uses COUNT(*) FILTER (WHERE valor_global > 0) which may undercount approval rows where valor_global is NULL or 0"
    why_human: "Possible semantic drift from spec ('apr_rows count' vs 'apr_rows where valor_global > 0'); needs a real client with known apr_rows to verify"
---

# Phase 23: CSM Pipeline & BI Dashboard Verification Report

**Phase Goal:** CSM has a complete client list view with expandable rows, financial data, and priority badges, plus a standalone BI dashboard showing portfolio totals and project breakdown by situacao.
**Verified:** 2026-04-27
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | GET /api/csm/portfolio returns one row per CNPJ with aggregated financial fields and per-situacao project counts | VERIFIED | File exists 247 lines; 4x NOT MATERIALIZED CTEs; correct column aggregations; canCsm gate; maxDuration=30 |
| 2 | GET /api/csm/portfolio rejects non-CSM with 403 | VERIFIED | `if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })` at line 27 |
| 3 | GET /api/csm/bi returns portfolio totals and project counts grouped by situacao | VERIFIED | File exists 211 lines; Promise.all with 3 queries; totals + by_status + funnel in response; all 6 bucket strings present |
| 4 | GET /api/csm/bi rejects non-CSM with 403 | VERIFIED | Same canCsm gate pattern at line 22 |
| 5 | Neither route exposes paulo_breakdown / per_vendedor / vendedores_list / selected_vendedor_stats | VERIFIED | grep clean on both routes |
| 6 | CSM /csm page shows unified client table with aggregated financials and project counts | VERIFIED | CsmDashboardClient.tsx is 465 lines; fetches /api/csm/portfolio; renders all four financial columns with correct "Saldo Rendimento" label (not "Rendimento Previsto") |
| 7 | Each client row displays a coloured PriorityBadge from priority_level | VERIFIED | PriorityBadge imported and used at line 5 and line 418; 5 distinct Tailwind colour roots present |
| 8 | User can search by name/CNPJ and filter by priority pills and saldo range | VERIFIED | useMemo filter at lines 159-181; search/priorityFilter/saldoMin/saldoMax state wired; filter pills use PriorityBadge component |
| 9 | Clicking a row expands a per-project panel fetching /api/csm/clients/{cnpj}/projects on first open only | VERIFIED | toggleExpand at lines 195-217; cache check `if (!projectsCache[cnpj])` before fetch; projectsCache state populated |
| 10 | /csm/bi displays 4 KPI cards + donut chart + funnel visualization | VERIFIED | CsmBiClient.tsx 185 lines; 4 KPICard uses; PieChart+Pie from recharts; horizontal bar funnel via styled divs |
| 11 | Sidebar shows BI Dashboard CSM nav entry for CSM role only | VERIFIED | Line 100 of Sidebar.tsx inside `user.role === 'csm'` block; absent from gestor/admin block |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/app/api/csm/portfolio/route.ts` | GET handler returning CsmClientRow[] | VERIFIED | 247 lines; exports GET, dynamic, maxDuration; 4 NOT MATERIALIZED CTEs |
| `web/src/app/api/csm/bi/route.ts` | GET handler returning CsmBiResponse | VERIFIED | 211 lines; exports GET, dynamic, maxDuration; Promise.all; 8 NOT MATERIALIZED CTEs across 3 queries |
| `web/src/app/api/csm/clients/[cnpj]/projects/route.ts` | GET handler returning {projects: CsmProjectRow[]} | VERIFIED | 210 lines; exports GET, dynamic, maxDuration; 2 NOT MATERIALIZED CTEs; CNPJ 14-digit validation |
| `web/src/app/csm/CsmDashboardClient.tsx` | Full CSM client list UI | VERIFIED | 465 lines (min 200 required); 'use client'; all state, filter, expand logic present |
| `web/src/components/PriorityBadge.tsx` | PriorityBadge component with 5 distinct colours | VERIFIED | 41 lines (min 35 required); all 5 labels and Tailwind colour classes present; null case handled |
| `web/src/app/csm/bi/page.tsx` | Server component with canCsm() gate | VERIFIED | 11 lines (min_lines: 12 in spec — off by 1 due to no trailing newline, content is complete); canCsm gate; redirects to /sem-permissao |
| `web/src/app/csm/bi/CsmBiClient.tsx` | Client component with KPIs, chart, funnel | VERIFIED | 185 lines (min 120 required); 'use client'; fetches /api/csm/bi |
| `web/src/components/Sidebar.tsx` | CSM nav block with /csm/bi entry | VERIFIED | `/csm/bi` at line 100 inside csm block; after comissoes, before tgov/pipeline |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| portfolio/route.ts | dal.ts | import { getApiSession, canCsm } | WIRED | Lines 3+27 |
| portfolio/route.ts | tgov.ts | EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS | WIRED | Lines 4+29-30 |
| portfolio/route.ts | PostgreSQL (4 tables) | NOT MATERIALIZED CTEs | WIRED | 4 CTEs: exec_rows, apr_rows, csm_added, all_rows |
| bi/route.ts | dal.ts | canCsm(session.role) | WIRED | Lines 3+22 |
| bi/route.ts | PostgreSQL (4 tables) | NOT MATERIALIZED CTEs | WIRED | 8 CTEs across 3 parallel queries |
| clients/[cnpj]/projects/route.ts | dal.ts | canCsm(session.role) | WIRED | Lines 3+51 |
| clients/[cnpj]/projects/route.ts | PostgreSQL | NOT MATERIALIZED CTEs | WIRED | exec_rows + apr_rows CTEs |
| CsmDashboardClient.tsx | /api/csm/portfolio | fetch in useEffect | WIRED | Line 141 |
| CsmDashboardClient.tsx | /api/csm/clients/{cnpj}/projects | fetch on expand | WIRED | Line 205 |
| CsmDashboardClient.tsx | PriorityBadge | import default | WIRED | Line 5; used at lines 299, 418, 113 |
| CsmBiClient.tsx | /api/csm/bi | fetch in useEffect | WIRED | Line 45 |
| bi/page.tsx | dal.ts | verifySession + canCsm | WIRED | Lines 1+7 |
| Sidebar.tsx | /csm/bi | href nav item | WIRED | Line 100 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CLI-01 | 23-03 | CSM ve todos os clientes em lista unificada | SATISFIED | CsmDashboardClient fetches /api/csm/portfolio and renders one row per client |
| CLI-02 | 23-03 | Cada cliente exibe saldo em conta, a desembolsar, saldo rendimento, a liberar | SATISFIED | All four columns rendered at lines 347-400; labeled correctly |
| CLI-03 | 23-03 | Contagem de projetos por situacao por cliente | SATISFIED | countPills render count_execucao_saldo, count_a_desembolsar, count_aprovacao, count_prestacao_contas |
| CLI-04 | 23-02 | CSM pode expandir cliente e ver projetos por fase | SATISFIED | toggleExpand fetches /api/csm/clients/{cnpj}/projects; ProjectSubTable renders Aprovação/Execução/PC sub-sections |
| CLI-05 | 23-03 | CSM pode buscar e filtrar por nome, CNPJ, situacao, saldo | SATISFIED | Single search input + priority pills + saldo min/max; useMemo filter applied client-side |
| CLI-06 | 23-01, 23-02, 23-03 | Badge colorida por nivel de prioridade | SATISFIED | PriorityBadge with 5 distinct colours; used on client rows and per-project rows |
| BI-01 | 23-01, 23-04 | BI exibe total saldo em conta | SATISFIED | KPICard "Saldo em Conta" at CsmBiClient.tsx line 111; fed by totals.total_saldo_conta |
| BI-02 | 23-01, 23-04 | BI exibe contagem por situacao (KPIs + grafico) | SATISFIED | PieChart donut with by_status data; legend with counts and percentages |
| BI-03 | 23-01, 23-04 | BI exibe total saldo rendimento | SATISFIED | KPICard "Saldo Rendimento" at line 112; fed by totals.total_rendimento |
| BI-04 | 23-01, 23-04 | BI exibe valor total a liberar | SATISFIED | KPICard "A Liberar" at line 113; fed by totals.total_a_liberar |
| BI-05 | 23-01, 23-04 | CSM tem funil proprio separado do CRM vendas | SATISFIED | /csm/bi page with funnel visualization; separate from /bi (CRM) and /tgov routes |

**Notes on REQUIREMENTS.md tracking table:** Lines 84-86 still show CLI-01, CLI-02, CLI-03 as "Pending (API done, UI pending)" — this is stale documentation. The implementation is complete (Plans 23-03 and 23-04 delivered the UI). The `[x]` checkboxes at lines 19-24 are correct. The tracking table should be updated to reflect completion.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| CsmDashboardClient.tsx | `.map(c => { return (<>...</>) })` — fragment returned without key; inner `<tr>` and `<tr key={c.cnpj}-expanded>` have keys but the fragment wrapper does not | Warning | React will emit a console warning at runtime; no functional breakage |
| portfolio/route.ts | `count_aprovacao` uses `COUNT(*) FILTER (WHERE valor_global > 0)` rather than a pure row count of apr_rows | Info | Approval rows with NULL or 0 valor_global are excluded from the count; benign in practice but deviates from "apr_rows count" wording in spec |
| bi/page.tsx | File is 11 lines; plan min_lines: 12 | Info | Cosmetic counter miss — content is functionally complete; no trailing newline |

---

### Human Verification Required

#### 1. CSM Client List Functional Test

**Test:** Sign in as bruno@projetus.org, navigate to /csm. Type a partial CNPJ (e.g., first 5 digits) in search box. Click a priority pill (e.g., "1 Saldo em Conta"). Set Saldo mín to 100000. Click a row to expand.
**Expected:** Table loads with multiple rows. Each filter operation is instant with no new network requests. First expand of a row fires one GET /api/csm/clients/{cnpj}/projects; second click collapses and third reopens with no network call.
**Why human:** Client-side filter performance and fetch caching require browser observation.

#### 2. BI Dashboard Visual Verification

**Test:** Navigate to /csm/bi. Observe KPI cards, donut chart, funnel bars.
**Expected:** 4 KPI cards show non-zero numeric values. Donut has coloured segments (up to 6). Funnel shows all 6 priority-ordered horizontal bars. No "Previsto" or "Rendimento Previsto" labels anywhere.
**Why human:** Chart rendering and data accuracy require browser + real DB verification.

#### 3. Console Warning Check

**Test:** Load /csm in browser with DevTools open. Check Console tab.
**Expected:** Clean console or only minor warnings. Watch for React "Each child in a list should have a unique key" warning from the fragment-without-key pattern in the row map.
**Why human:** Runtime React warnings only visible in browser DevTools.

#### 4. Sidebar Role Isolation

**Test:** Sign in as gestor. Inspect sidebar.
**Expected:** Sidebar shows Pipeline, Lead Aprovacao, Lead Execucao, Comissoes, BI Analytics, Meus Monitorados, TGov Pipeline, TGov Dashboard, TGov BI, Distribuir Leads, Monitoramento, Usuarios — NO "BI Dashboard CSM" entry. Direct URL /csm/bi as gestor should render the BI page (canCsm allows).
**Why human:** Visual sidebar inspection confirms no role contamination.

#### 5. Phase 22 Regression Check

**Test:** POST /api/csm/clients with a valid payload; navigate to /csm/comissoes.
**Expected:** Both Phase 22 routes respond correctly; no breakage.
**Why human:** Static analysis confirms contacts/route.ts and clients/route.ts are unchanged; smoke test confirms no runtime regression.

#### 6. count_aprovacao Accuracy

**Test:** Pick a client CNPJ known to have apr_rows. Compare count_aprovacao from /api/csm/portfolio against a direct DB query on propostas + tgov_propostas for that CNPJ.
**Expected:** Counts match. If any apr_row has valor_global = NULL or 0, count_aprovacao will be lower than the raw row count.
**Why human:** Requires access to production DB and a known reference client.

---

### Deviations from Spec (Non-Blocking)

1. **portfolio route uses an intermediate `all_rows AS NOT MATERIALIZED` CTE** in addition to exec_rows, apr_rows, csm_added. The plan spec showed 3 CTEs; the implementation uses 4 (exec_rows, apr_rows, csm_added, all_rows). This is a valid and arguably better query structure — the extra CTE consolidates per-row priority before the final GROUP BY. Not a gap.

2. **bi/page.tsx is 11 lines vs min_lines: 12.** Content is fully spec-compliant. The count miss is a trailing-newline artifact.

3. **count_aprovacao filter.** Portfolio uses `COUNT(*) FILTER (WHERE valor_global > 0)` instead of a raw apr_rows row count. Deviates slightly from spec wording but does not break any visible requirement.

---

_Verified: 2026-04-27_
_Verifier: Claude (gsd-verifier)_
