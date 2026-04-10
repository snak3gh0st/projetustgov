---
phase: 21-tgov-ajustes-0904
verified: 2026-04-10T00:00:00Z
status: passed
score: 21/21 must-haves verified
re_verification: false
---

# Phase 21: Ajustes TGov 09/04 Verification Report

**Phase Goal:** Nav TGov BI + TGov Pipeline (kanban estilo CRM), split Execução em Execução/Prestação de Contas, novos roles coord_execucao/assistente_execucao/projetista_execucao, isolamento de perfis, bugfixes aprovação
**Verified:** 2026-04-10
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Users with the 3 new execution roles can access /tgov without redirect | VERIFIED | `page.tsx` guard explicitly lists `coord_execucao`, `assistente_execucao`, `projetista_execucao` at lines 22-24 |
| 2 | Execution roles cannot see Aprovação tab | VERIFIED | `TGovDashboardClient.tsx` line 541: `if (isExecucaoRole && tab === 'aprovacao') return false` |
| 3 | Aprovação roles cannot see Execução or Prestação de Contas tabs | VERIFIED | `TGovDashboardClient.tsx` line 541: `if (isAprovacaoRole && tab !== 'aprovacao') return false` |
| 4 | canReadTgov/canWriteTgov/canCommentTgov include the 3 new roles | VERIFIED | `dal.ts` lines 86-104: all three helpers include the new roles |
| 5 | DB constraint migration covers all 13 roles | VERIFIED | `migrations/add_roles_execucao.sql` has DROP + ADD CONSTRAINT with all 13 roles |
| 6 | projetista_execucao filtered to assigned tecnico_id records in execucao API | VERIFIED | `execucao/route.ts` line 265-268: projetista_execucao gets `pe.tecnico_id` filter |
| 7 | Sidebar shows "TGov BI" (not "TGov Pipeline") pointing to /tgov for all TGov roles | VERIFIED | `Sidebar.tsx` lines 74,91,98,104,111,118,124,131,138: all TGov role branches have `href: '/tgov', label: 'TGov BI'` |
| 8 | Sidebar shows new "TGov Pipeline" item linking to /tgov/pipeline | VERIFIED | `Sidebar.tsx` lines 75,92,99,105,112,119,125,132,139: all branches have `href: '/tgov/pipeline', label: 'TGov Pipeline'` |
| 9 | New execution roles see TGov items in sidebar | VERIFIED | `Sidebar.tsx` lines 122-140: explicit cases for `coord_execucao`, `assistente_execucao`, `projetista_execucao` with TGov BI + Pipeline items |
| 10 | /tgov/pipeline loads without auth error for all 10 TGov roles | VERIFIED | `pipeline/page.tsx`: ALLOWED_ROLES array covers all 10 TGov roles |
| 11 | Kanban cards on /tgov/pipeline show situação counts from Aprovação data | VERIFIED | `TGovPipelineClient.tsx` line 44: `fetch('/api/tgov/aprovacao?page=1&page_size=1')` + `data.byStatus` mapping |
| 12 | Clicking a card navigates to /tgov?status=<situação> | VERIFIED | `TGovPipelineClient.tsx` line 126: `router.push('/tgov?status=${encodeURIComponent(situacao)}')` |
| 13 | Two separate tabs exist: "Execução" and "Prestação de Contas" | VERIFIED | `TGovDashboardClient.tsx` line 537: `['aprovacao', 'execucao', 'prestacao_contas']` with label mapping |
| 14 | Execução tab filters LOWER(situacao) = 'em execução' | VERIFIED | `execucao/route.ts` line 227: `mainConditions.push('LOWER(pe.situacao) = \'em execução\'')`  |
| 15 | Prestação de Contas tab filters via ILIKE '%Prestação de Contas%' | VERIFIED | `execucao/route.ts` line 229: `mainConditions.push('pe.situacao ILIKE \'%Prestação de Contas%\'')` |
| 16 | Prestação de Contas tab fetches execucao API with mode=prestacao_contas | VERIFIED | `TGovDashboardClient.tsx` lines 375-379: `apiPath = 'execucao'`, `modeParam = '&mode=prestacao_contas'` for that tab |
| 17 | Table rows in AprovacaoTable have visible divide-gray-100 separators | VERIFIED | `TGovDashboardClient.tsx` line 1158: `<tbody className="divide-y divide-gray-100">` |
| 18 | Table rows in ExecucaoTable have visible divide-gray-100 separators | VERIFIED | `TGovDashboardClient.tsx` line 1268: `<tbody className="divide-y divide-gray-100">` |
| 19 | Each AprovacaoTable row shows comment count badge/icon | VERIFIED | `TGovDashboardClient.tsx` lines 1192-1207: comment column with `row.commentCount` render |
| 20 | Clicking the comment icon opens the sidecard for that proposta | VERIFIED | Line 1192: `onClick={(e) => { e.stopPropagation(); onRowClick(row) }}` |
| 21 | Aprovação API returns comment_count per row via tgov_comments subquery | VERIFIED | `aprovacao/route.ts` lines 231-232: correlated subquery against `tgov_comments` table |

**Score:** 21/21 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `migrations/add_roles_execucao.sql` | DB constraint with all 13 roles | VERIFIED | Contains DROP + ADD CONSTRAINT with coord_execucao, assistente_execucao, projetista_execucao |
| `web/src/lib/dal.ts` | Updated Role type + RBAC helpers | VERIFIED | Role type includes 3 new roles; canReadTgov/canWriteTgov/canCommentTgov, ROLE_CAN_CREATE, ROLE_CAN_DELETE all updated |
| `web/src/lib/tgov.ts` | APROVACAO_ONLY_ROLES and EXECUCAO_ONLY_ROLES constants + TGovTab with prestacao_contas + commentCount on row type | VERIFIED | Lines 18-19: both constants exported; line 37: TGovTab includes 'prestacao_contas'; line 134: commentCount?: number on TGovAprovacaoTableRow |
| `web/src/lib/validations.ts` | CreateUsuarioSchema includes 3 new roles | VERIFIED | Line 18: enum includes coord_execucao, assistente_execucao, projetista_execucao |
| `web/src/app/tgov/page.tsx` | Guard allows 10 TGov roles | VERIFIED | Lines 14-24: all 10 roles listed in guard condition |
| `web/src/app/api/tgov/execucao/route.ts` | mode param + ILIKE filters + projetista_execucao tecnico_id filter + APROVACAO_ONLY 403 | VERIFIED | mode parsing at line 217; ILIKE filters at 227-230; APROVACAO_ONLY guard at 196-198; projetista_execucao filter at 265-268 |
| `web/src/components/Sidebar.tsx` | TGov BI + TGov Pipeline in all role branches including 3 new roles | VERIFIED | Both items present in all 9 TGov role branches; new role cases at lines 122-140 |
| `web/src/app/tgov/pipeline/page.tsx` | Auth-guarded server component for /tgov/pipeline | VERIFIED | Exists, 19 lines, all 10 TGov roles in ALLOWED_ROLES |
| `web/src/app/tgov/pipeline/TGovPipelineClient.tsx` | Kanban client component using Aprovação data | VERIFIED | 156 lines, fetches /api/tgov/aprovacao, renders cards, card click → /tgov?status= |
| `web/src/app/tgov/TGovDashboardClient.tsx` | Three tabs + RBAC filter + per-tab mode param + comment column + divide-gray-100 | VERIFIED | All elements verified in their respective locations |
| `web/src/app/api/tgov/aprovacao/route.ts` | comment_count subquery in SELECT | VERIFIED | Lines 231-232: correlated subquery; line 347: commentCount mapped in response |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TGovPipelineClient.tsx` | `/api/tgov/aprovacao` | fetch in useEffect | WIRED | Line 44: fetch call; lines 48-51: byStatus response consumed to build counts |
| `TGovPipelineClient card click` | `/tgov?status=<situação>` | router.push | WIRED | Line 126: `router.push('/tgov?status=${encodeURIComponent(situacao)}')` |
| `TGovDashboardClient prestacao_contas tab` | `/api/tgov/execucao?mode=prestacao_contas` | fetch with mode param | WIRED | Lines 375-379: apiPath and modeParam computed; appended to fetch URL |
| `execucao/route.ts mode param` | mainConditions ILIKE filter | conditional push | WIRED | Lines 226-230: mode → mainConditions filter correctly applied |
| `aprovacao/route.ts SELECT` | `tgov_comments` | correlated subquery | WIRED | Lines 231-232: subquery counts comments; line 347: commentCount in response mapping |
| `AprovacaoTable comment badge` | `onRowClick` | onClick handler | WIRED | Line 1192: `onClick={(e) => { e.stopPropagation(); onRowClick(row) }}` |
| `page.tsx guard` | new execution roles | role check | WIRED | Lines 22-24: coord_execucao, assistente_execucao, projetista_execucao in guard |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments found in the changed files. No stub implementations detected.

**Note:** `divide-gray-50` still appears at lines 923 and 990 in `TGovDashboardClient.tsx`, but these belong to a CNPJ search sub-table (not the main AprovacaoTable or ExecucaoTable targeted by D-19). The two main table tbodies correctly use `divide-gray-100`.

### Human Verification Required

The following items cannot be verified programmatically:

#### 1. Pipeline Kanban Card Display

**Test:** Log in as gestor, navigate to /tgov/pipeline
**Expected:** Grid of cards appears, each showing a situação name, count, percentage, color bar, and conversion rate label
**Why human:** Visual layout and data accuracy require a running app with real DB data

#### 2. Tab Isolation by Role

**Test:** Log in as coord_execucao (if a test user exists), navigate to /tgov
**Expected:** Only "Execução" and "Prestação de Contas" tabs visible — "Aprovação" tab absent
**Why human:** Requires an actual user session with the new role

#### 3. Prestação de Contas Data Accuracy

**Test:** As gestor, click "Prestação de Contas" tab
**Expected:** Table shows only records whose situacao contains "Prestação de Contas"; Execução tab shows only "Em Execução" records
**Why human:** Requires live DB data to confirm filtering is correct

#### 4. Comment Count Badge Rendering

**Test:** Navigate to /tgov Aprovação tab, find a proposta with known comments
**Expected:** Speech bubble icon + count number visible in the Coments. column; clicking opens the sidecard
**Why human:** Requires live DB data with actual tgov_comments rows

---

## Summary

All 21 observable truths verified against the actual codebase. All 11 required artifacts exist, are substantive, and are correctly wired. All 7 key links confirmed connected end-to-end.

**Plan 21-01 (RBAC Foundation):** Fully delivered. Three new roles propagated through DB migration, validations.ts enum, dal.ts Role type + RBAC helpers (canReadTgov/canWriteTgov/canCommentTgov/ROLE_CAN_CREATE/ROLE_CAN_DELETE), tgov.ts constants (APROVACAO_ONLY_ROLES/EXECUCAO_ONLY_ROLES), page.tsx guard, and execucao API (APROVACAO_ONLY 403 guard + projetista_execucao tecnico_id filter).

**Plan 21-02 (Sidebar + Pipeline Route):** Fully delivered. All 9 TGov role branches in Sidebar.tsx now show both "TGov BI" (→/tgov) and "TGov Pipeline" (→/tgov/pipeline). Three new role cases added. Pipeline route exists with auth guard and functioning kanban client using `Object.keys(TGOV_STATUS_ORDER)` (correctly adapted from the plan template since TGOV_STATUS_ORDER is a Record, not an array).

**Plan 21-03 (Execução/PC Split):** Fully delivered. TGovTab type includes 'prestacao_contas'. Execucao API has mode param with correct LOWER() and ILIKE filters. TGovDashboardClient renders three-tab UI with RBAC-aware filtering, correct fetch routing per tab, and initial tab computed dynamically for execution roles.

**Plan 21-04 (Bugfixes):** Fully delivered. AprovacaoTable and ExecucaoTable tbodies use divide-gray-100. AprovacaoTable has 8 columns (comment column added). Aprovação API returns comment_count via tgov_comments subquery. Comment badge wired to onRowClick. SituacaoBadge confirmed present in both tables (was already implemented in phase 19/20).

Phase 21 goal fully achieved.

---

_Verified: 2026-04-10_
_Verifier: Claude (gsd-verifier)_
