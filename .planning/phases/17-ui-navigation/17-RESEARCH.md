# Phase 17: UI & Navigation — Research

**Researched:** 2026-03-18
**Domain:** Next.js App Router page composition, Tailwind CSS, role-based access, slide-over pattern
**Confidence:** HIGH

---

## Summary

Phase 17 is a pure UI assembly phase. The API contract (Phase 16) is complete and stable — all 5/5 observable truths verified and committed. All component patterns are direct copies of existing code in this codebase — no new libraries, no new design system decisions, no external dependencies. The UI-SPEC has been approved and is the authoritative design contract. Research confirms every element described in the UI-SPEC already exists in code that can be directly referenced.

The three plans map cleanly to three discrete file edits: create `execucao/page.tsx`, create `ExecucaoSlideOver.tsx`, and modify `Sidebar.tsx`. All three use patterns already present in `leads/page.tsx`, `LeadSlideOver.tsx`, and `Sidebar.tsx` respectively. No architectural decisions remain — they were settled in Phases 14-16 and the UI-SPEC.

One gap that requires a new file: the `/sem-permissao` page does not exist in the codebase. The `distribuir/page.tsx` redirects to `/` on unauthorized, but the STATE.md decision log specifies vendedores must be redirected to `/sem-permissao` (not login, not root). This page must be created in Plan 17-01. Additionally, the GET /api/execucao currently returns a bare array — it must be extended to return `{ rows, last_synced }` to satisfy the freshness timestamp requirement (Success Criterion 5).

**Primary recommendation:** Implement Plans 17-01, 17-02, 17-03 in order. 17-01 creates `sem-permissao`, the page, the client component, and extends the API for `last_synced`. 17-02 depends on the client component in 17-01 having `selectedCnpj` state to pass as prop. 17-03 is fully independent and can be done in any order.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGR-01 | Propostas agrupadas por CNPJ (big number = quantidade de fomentos) | GET /api/execucao returns CNPJ-grouped rows with `total_projetos` field; client renders one row per CNPJ |
| AGR-02 | Gestor pode expandir CNPJ para ver propostas individuais com detalhes | ExecucaoSlideOver fetches /api/execucao/[cnpj] on open — lazy detail fetch per-CNPJ |
| AGR-03 | Contatos existentes exibidos via lead_contacts/BrasilAPI | API returns `contact_present: boolean` per CNPJ; slide-over shows contact badge when true |
| AGR-04 | Slide-over com detalhes completos ao clicar num CNPJ | ExecucaoSlideOver.tsx — full per-convenio detail panel |
| UI-01 | Nova aba /execucao no sidebar | Sidebar.tsx modification — add nav entry for gestor + coordenador only |
| UI-02 | Acesso restrito a gestor e coordenador (vendedor nao ve) | Server-side role check in page.tsx via verifySession; API double-guards with getApiSession |
| UI-03 | KPI cards no topo | KPIRow + 4x KPICard computed client-side from fetched rows array |
| UI-04 | Tabela principal com colunas definidas | 10-column table rendered client-side; columns spec from UI-SPEC section "Table Columns" |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | existing | App Router, server components, redirect | Project foundation |
| react | existing | Client components, useState, useEffect, useCallback | Project foundation |
| tailwindcss | existing | All styling — utility classes only | Project standard; shadcn not initialized |
| typescript | existing | Type safety for API response shapes | Project standard |

### Reused Utilities (already in codebase)
| Function | File | Used For |
|----------|------|----------|
| `formatCNPJ` | `web/src/lib/format.ts` | CNPJ column rendering |
| `formatCompactCurrency` | `web/src/lib/format.ts` | Desembolsado and Saldo columns |
| `formatDate` | `web/src/lib/format.ts` | Vigencia column rendering |
| `verifySession` | `web/src/lib/dal.ts` | Server-side role check in page.tsx |
| `getApiSession` | `web/src/lib/dal.ts` | API route auth (already guarding /api/execucao) |

### Reused Components (no changes except Sidebar)
| Component | File | Used As |
|-----------|------|---------|
| `KPICard` | `web/src/components/KPICard.tsx` | 4x KPI cards at top of /execucao |
| `KPIRow` | `web/src/components/KPIRow.tsx` | Container for 4 KPI cards |
| `Sidebar` | `web/src/components/Sidebar.tsx` | Modified: add execucao nav entry |

**Installation:** None required — all dependencies are already present.

---

## Architecture Patterns

### Recommended File Structure (new and modified files)
```
web/src/app/
└── execucao/
    └── page.tsx              # Plan 17-01: server component role guard + ExecucaoClient
web/src/app/sem-permissao/
    └── page.tsx              # Plan 17-01: static "sem permissao" page (redirect target)
web/src/components/
    └── ExecucaoSlideOver.tsx # Plan 17-02: right slide-over for per-CNPJ detail

# Modified:
web/src/app/api/execucao/route.ts         # Plan 17-01: extend response to { rows, last_synced }
web/src/components/Sidebar.tsx            # Plan 17-03: add execucao nav entry + NavIcon case
```

### Pattern 1: Server Component Role Guard (for page.tsx)

The STATE.md decision log (2026-03-18) confirms: "Role guard on both page (verifySession) and API (getApiSession)". The page.tsx must be a server component that calls `verifySession`, checks role, and redirects vendedor to `/sem-permissao`. The client component is then a separate `'use client'` component.

```typescript
// Source: web/src/lib/dal.ts + STATE.md decision
// Pattern: server component wraps client component, passes user as prop

import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'

export default async function ExecucaoPage() {
  const session = await verifySession()  // redirects to /login if not authenticated
  if (session.role === 'vendedor') {
    redirect('/sem-permissao')
  }
  return <ExecucaoClient role={session.role} />
}
```

**Critical:** `verifySession` is React-cached (uses `cache()`). The `redirect()` for vendedor role must fire BEFORE rendering any client component. The `/sem-permissao` redirect is to a new static page — NOT to `/login` and NOT to `/`. Pass only `role` (not the full session) to the client component — this read-only page does not need `userId` or `email`.

### Pattern 2: Client Component with Debounced Fetch (for ExecucaoClient)

Direct copy from `web/src/app/leads/page.tsx` — the 300ms debounce pattern:

```typescript
// Source: web/src/app/leads/page.tsx lines 96-118
const fetchData = useCallback(async () => {
  setLoading(true)
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (uf) params.set('uf', uf)
  if (alertOnly) params.set('alert_only', 'true')
  try {
    const res = await fetch(`/api/execucao?${params}`)
    const data = await res.json()
    // NOTE: API returns { rows, last_synced } after Plan 17-01 extension
    setRows(Array.isArray(data) ? data : (data.rows ?? []))
    setLastSynced(data.last_synced ?? null)
  } catch {
    setError(true)
  } finally {
    setLoading(false)
  }
}, [search, uf, alertOnly])

useEffect(() => {
  const timer = setTimeout(fetchData, 300)
  return () => clearTimeout(timer)
}, [fetchData])
```

**Debounce applies to search text input only.** UF dropdown and alert toggle trigger re-fetch immediately (no debounce). This matches the `leads/page.tsx` pattern.

### Pattern 3: Slide-Over Component (for ExecucaoSlideOver)

Direct copy from `web/src/components/LeadSlideOver.tsx` structure. Key structural elements verified from source:

- Wrapper: `fixed inset-0 z-50`
- Backdrop: `absolute inset-0 bg-black/30 backdrop-blur-sm` with `onClick={onClose}`
- Panel: `absolute right-0 top-0 h-full w-[420px] max-w-[90vw] bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-slide-in-right`
- Top accent: `absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0072F7] to-blue-400 pointer-events-none`
- `animate-slide-in-right` is defined in `web/tailwind.config.ts` (lines 30-36) — no additional CSS needed
- `null` guard: if `!cnpj` return `null` — consistent with LeadSlideOver `if (!lead) return null`

The ExecucaoSlideOver fetches `/api/execucao/{cnpj}` lazily on open (useEffect triggered by `cnpj` prop change). NOT pre-fetched on page load.

```typescript
// Source: web/src/components/LeadSlideOver.tsx — Escape key + lazy fetch pattern
useEffect(() => {
  if (!cnpj) return
  setDetailRows([])  // Clear stale data immediately (Pitfall 6)
  setDetailLoading(true)

  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  document.addEventListener('keydown', handler)

  fetch(`/api/execucao/${encodeURIComponent(cnpj)}`)
    .then(r => r.json())
    .then(data => setDetailRows(Array.isArray(data) ? data : []))
    .catch(() => setDetailError(true))
    .finally(() => setDetailLoading(false))

  return () => document.removeEventListener('keydown', handler)
}, [cnpj, onClose])
```

### Pattern 4: Sidebar Nav Extension

The Sidebar has two extension points:
1. Add nav item `{ href: '/execucao', label: 'Projetos em Execucao', icon: 'execucao' }` to gestor array and coordenador array (lines 53-65 in Sidebar.tsx).
2. Add `case 'execucao'` to `NavIcon` switch (lines 15-38 in Sidebar.tsx) — use ChartBarIcon SVG path from Heroicons strokeWidth=1.5.

The `BASE_NAV_ITEMS` array is shared by all roles and must NOT be modified. The execucao entry is added only to gestor and coordenador role-specific arrays.

```typescript
// Source: web/src/components/Sidebar.tsx lines 52-68
// Pattern: execucao appended to gestor and coordenador arrays, NOT to BASE_NAV_ITEMS
const navItems = user.role === 'gestor'
  ? [
      ...BASE_NAV_ITEMS,
      { href: '/execucao', label: 'Projetos em Execucao', icon: 'execucao' },  // ADD THIS
      { href: '/upload', label: 'Importar Planilha', icon: 'upload' },
      // ... rest unchanged
    ]
  : user.role === 'coordenador'
  ? [
      ...BASE_NAV_ITEMS,
      { href: '/execucao', label: 'Projetos em Execucao', icon: 'execucao' },  // ADD THIS
      // ... rest unchanged
    ]
```

### Pattern 5: Freshness Timestamp from cron_sync_log

The `cron_sync_log` table has a `source` column. `execucao-sync.ts` inserts with `source = 'sync-execucao'` (verified at line 403-406 of execucao-sync.ts). The execucao page needs the most recent row WHERE `source = 'sync-execucao'` — NOT the most recent row overall (which could be a leads sync).

**Implementation:** Extend GET /api/execucao to return `{ rows, last_synced }` instead of a bare array. Three lines added to the route:

```typescript
// In web/src/app/api/execucao/route.ts — add after main rows query
const syncLogRows = await query(
  `SELECT ran_at FROM cron_sync_log WHERE source = 'sync-execucao' ORDER BY ran_at DESC LIMIT 1`
)
const last_synced: string | null = (syncLogRows[0] as { ran_at: string } | undefined)?.ran_at ?? null
return NextResponse.json({ rows, last_synced })
```

The client renders: `"Dados atualizados em {formatDate(last_synced)}"` as `text-xs text-gray-400` below the page title.

### Pattern 6: KPI Cards Computed Client-Side

KPI values are derived from the fetched `rows` array — no second API call needed. Computed with `useMemo`:

```typescript
// Source: UI-SPEC "KPI Cards (UI-03)"
const kpis = useMemo(() => ({
  totalClientes: rows.length,
  totalFomentos: rows.reduce((s, r) => s + r.total_projetos, 0),
  totalDesembolsado: rows.reduce((s, r) => s + Number(r.total_desembolsado), 0),
  alertasAtivos: rows.filter(r => r.tem_alerta).length,
}), [rows])
```

The `total_desembolsado` field from the API is a NUMERIC string (pg default) — always wrap with `Number()` before arithmetic (Pitfall 1).

### Pattern 7: Alert Row Highlighting

```typescript
// Source: UI-SPEC "Interaction Contract" + "Table Columns"
// Alert rows get a left border override — must come AFTER base row class
<tr
  onClick={() => setSelectedCnpj(row.cnpj)}
  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
    row.tem_alerta ? 'border-l-4 border-amber-400 bg-amber-50/30' : ''
  }`}
>
```

### Pattern 8: Progress Bar in SlideOver

```typescript
// Source: UI-SPEC "ExecucaoSlideOver" section
// pct_execucao from /api/execucao/[cnpj] is NUMERIC string — parse with Number()
// Cap at 100 — pct may exceed 100 in data anomalies (confirmed possible)
const pct = Math.min(100, Number(convenio.pct_execucao) || 0)
<div className="bg-gray-100 rounded-full h-2">
  <div
    className="bg-[#0072F7] h-2 rounded-full"
    style={{ width: `${pct}%` }}
    role="progressbar"
    aria-valuenow={pct}
    aria-valuemin={0}
    aria-valuemax={100}
  />
</div>
```

### Anti-Patterns to Avoid
- **Pre-fetching slide-over data on page load:** Do NOT fetch `/api/execucao/{cnpj}` for all rows at once. Fetch lazily on slide-over open only.
- **Passing full session object to client component:** Pass only `role` — client does not need `userId` or `email`.
- **Using middleware for role guard:** Middleware checks session existence only, not role (confirmed in STATE.md). Guard in page.tsx with `verifySession`.
- **Computing KPI sums from a second API call:** KPI cards are computed client-side from the `rows` array.
- **Querying cron_sync_log without source filter:** Always filter `WHERE source = 'sync-execucao'` — the table stores both leads and execucao events.
- **Applying debounce to alert toggle or UF filter:** Debounce applies to search text only. Toggle and dropdown are immediate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide-over animation | Custom CSS keyframe | `animate-slide-in-right` (tailwind.config.ts lines 30-36) | Already defined, consistent with LeadSlideOver |
| CNPJ formatting | Custom formatter | `formatCNPJ()` from `@/lib/format` | Handles 14-digit zero-padding edge cases |
| Currency display | Custom number format | `formatCompactCurrency()` from `@/lib/format` | Handles R$/K/M/B thresholds correctly |
| Date formatting | Custom date parser | `formatDate()` from `@/lib/format` | Handles null and invalid date strings |
| Session validation | Custom cookie check | `verifySession()` from `@/lib/dal` | React-cached, redirects to /login on failure |
| API auth check | Custom header parse | `getApiSession()` from `@/lib/dal` | Consistent with all other API routes |

**Key insight:** This is a copy-paste-and-adapt phase. Every UI primitive and utility needed already exists in the codebase. The value is in wiring them together correctly, not in building anything new.

---

## Common Pitfalls

### Pitfall 1: NUMERIC Returns as String from pg
**What goes wrong:** `total_desembolsado`, `total_repasse`, `total_saldo`, `pct_execucao_ponderado` are NUMERIC columns — pg driver returns them as strings, not numbers.
**Why it happens:** pg's default type casting treats NUMERIC/DECIMAL as string to preserve precision.
**How to avoid:** Always wrap with `Number()` before arithmetic or display: `Number(row.total_desembolsado)`. The `formatCompactCurrency` function accepts `string | number` so it handles this, but `reduce()` sums require explicit `Number()`.
**Warning signs:** KPI sums showing "0" or NaN despite data being present.

### Pitfall 2: Missing sem-permissao Page
**What goes wrong:** `page.tsx` calls `redirect('/sem-permissao')` for vendedor, but that page does not exist — Next.js returns a 404 instead of a clear access-denied message.
**Why it happens:** The page has never been created. `distribuir/page.tsx` redirects to `/` (root) instead.
**How to avoid:** Plan 17-01 must create `web/src/app/sem-permissao/page.tsx` as a minimal static page before the role guard is wired.
**Warning signs:** Vendedor navigating to /execucao sees a 404 page.

### Pitfall 3: layout.tsx Type Cast Missing coordenador
**What goes wrong:** `layout.tsx` line 25 casts session role as `'gestor' | 'vendedor' | 'visualizador'` — coordenador is missing from the union type.
**Why it happens:** layout.tsx was written before coordenador role was added.
**How to avoid:** The SidebarProps interface in Sidebar.tsx already includes `coordenador`. The cast is technically incorrect but does not cause a runtime failure. Do NOT change layout.tsx in this phase — it is out of scope and may cause unrelated TypeScript ripples.
**Warning signs:** TypeScript compile error on coordenador session if strict type checking is enabled.

### Pitfall 4: pct_execucao Can Exceed 100
**What goes wrong:** Progress bar renders wider than its container or overflows layout.
**Why it happens:** `valor_desembolsado / valor_repasse * 100` can exceed 100 if disbursement exceeds repasse (confirmed possible from STATE.md context).
**How to avoid:** `Math.min(100, Number(convenio.pct_execucao) || 0)` — cap at 100 before setting `width` style.
**Warning signs:** Progress bar visually overflows its container on real government data.

### Pitfall 5: dias_ate_vencimento Can Be Negative
**What goes wrong:** Urgency coloring logic that handles only positive values renders nothing or wrong color for expired projects.
**Why it happens:** `data_fim_vigencia - NOW()` is negative when `data_fim_vigencia` is in the past.
**How to avoid:** Handle `< 0` explicitly: `dias < 0 ? 'text-red-600 font-bold' : dias < 30 ? 'text-red-500 font-medium' : dias <= 90 ? 'text-amber-600' : 'text-gray-600'`.
**Warning signs:** Expired projects showing no urgency color in the slide-over.

### Pitfall 6: Slide-Over Stale Data on Re-Open
**What goes wrong:** Re-opening the slide-over for a different CNPJ shows the previous CNPJ's data briefly before new data loads.
**Why it happens:** `useEffect` fires asynchronously — if `detailRows` state is not cleared first, stale rows are visible during the fetch.
**How to avoid:** Set `detailRows` to `[]` synchronously at the start of the fetch effect (before the async fetch), OR use a key prop on the slide-over to force unmount/remount.
**Warning signs:** Slide-over briefly shows wrong CNPJ's convenio list when switching rows rapidly.

### Pitfall 7: API Shape Change Breaks Client
**What goes wrong:** Changing GET /api/execucao from returning `ExecucaoAggRow[]` to `{ rows: ExecucaoAggRow[], last_synced: string | null }` silently breaks if the client still destructures as a bare array.
**Why it happens:** Both the server and client must be updated in the same plan to change the response shape.
**How to avoid:** Plan 17-01 must update both the route and the client component fetch handler together. The client must read `data.rows` not `data` directly.
**Warning signs:** Table renders 0 rows after the API shape change; no error, just empty state.

---

## Code Examples

### API Response Type (from /api/execucao GET — after Plan 17-01 extension)
```typescript
// Source: web/src/app/api/execucao/route.ts — ExecucaoAggRow interface
interface ExecucaoAggRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  total_projetos: number
  total_repasse: string        // NUMERIC as string — always wrap with Number()
  total_desembolsado: string   // NUMERIC as string
  total_saldo: string          // NUMERIC as string
  pct_execucao_ponderado: string | null
  tem_alerta: boolean
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: string | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_present: boolean
}

// Extended response shape (after Plan 17-01):
// { rows: ExecucaoAggRow[], last_synced: string | null }
```

### API Response Type (from /api/execucao/[cnpj] GET)
```typescript
// Source: web/src/app/api/execucao/[cnpj]/route.ts — ExecucaoDetailRow interface
interface ExecucaoDetailRow {
  nr_convenio: string
  id_proposta: string | null
  situacao: string | null
  modalidade: string | null
  objeto: string | null
  valor_global: string | null       // NUMERIC as string
  valor_repasse: string | null
  valor_desembolsado: string | null
  saldo_conta: string | null
  valor_empenhado: string | null
  pct_execucao: string | null
  dias_em_execucao: number | null
  dias_ate_vencimento: number | null
  data_assinatura: string | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  alerta_desembolso: boolean
  verificar_saldo: boolean
}
```

### Dias-at-Vencimento Color Logic
```typescript
// Source: UI-SPEC "ExecucaoSlideOver" + Pitfall 5 above
function diasColor(dias: number | null): string {
  if (dias == null) return 'text-gray-400'
  if (dias < 0) return 'text-red-600 font-bold'    // expired — past fim de vigencia
  if (dias < 30) return 'text-red-500 font-medium'
  if (dias <= 90) return 'text-amber-600'
  return 'text-gray-600'
}
```

### sem-permissao Page (static, minimal)
```typescript
// Source: Pattern from distribuir/page.tsx role handling + STATE.md "redirect to /sem-permissao"
// This page has no client logic — purely static
export default function SemPermissaoPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="font-heading text-2xl font-bold text-gray-900">Acesso Restrito</h1>
      <p className="text-sm text-gray-500">Acesso restrito a gestores e coordenadores.</p>
    </div>
  )
}
```

---

## Validation Architecture

> Required for downstream Nyquist validation system.

### Test Framework

No automated test framework is configured in this project (no `jest.config.*`, `vitest.config.*`, `pytest.ini`, or `__tests__/` directories detected). All validation for this phase is manual functional verification, consistent with Phase 16's verification approach (manual observable truths).

| Property | Value |
|----------|-------|
| Framework | none — manual functional verification |
| Config file | none |
| Quick run command | Manual browser check described below |
| Full suite command | Manual checklist in VERIFICATION.md |
| Estimated runtime | ~5-10 minutes manual walkthrough |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Verification Method | Notes |
|--------|----------|-----------|---------------------|-------|
| AGR-01 | /execucao table shows one row per CNPJ with `total_projetos` as big number | Manual | Navigate to /execucao as gestor, confirm each row has a CNPJ and fomentos count | Requires live DB with projetos_execucao data |
| AGR-02 | Clicking CNPJ row opens slide-over showing per-convenio detail rows | Manual | Click any CNPJ row, confirm slide-over appears with individual convenio rows (nr_convenio, desembolso, saldo, progress bar) | Verifies /api/execucao/[cnpj] fetch |
| AGR-03 | Contact badge appears for CNPJs in lead_contacts | Manual | Find a CNPJ known to be in lead_contacts; confirm contact badge visible in both table and slide-over footer | Requires cross-referencing DB |
| AGR-04 | Slide-over shows full financial detail | Manual | Open slide-over; confirm desembolso, saldo, % execucao progress bar, data fim vigencia, dias em execucao all present | All fields from ExecucaoDetailRow |
| UI-01 | /execucao nav entry visible in sidebar for gestor/coordenador | Manual | Login as gestor; confirm "Projetos em Execucao" appears in sidebar. Login as coordenador; same. | Sidebar.tsx modification |
| UI-02 | Vendedor cannot access /execucao — redirected to /sem-permissao | Manual | Login as vendedor; navigate to /execucao; confirm redirect to /sem-permissao with "Acesso restrito" message. Also confirm nav entry absent from sidebar. | Two checks: redirect + nav absence |
| UI-03 | 4 KPI cards at top showing correct computed values | Manual | Note the count/sum of rows; confirm KPI card values match: totalClientes = row count, totalFomentos = sum of total_projetos, etc. | Can verify with small dataset |
| UI-04 | Table has 10 columns in correct order: CNPJ, Nome, UF, Fomentos, Desembolsado, Saldo em Conta, % Execucao, Vigencia, Alerta, Contato | Manual | Inspect rendered table headers left-to-right | Column order from UI-SPEC |

### Success Criteria Verification Map

| Success Criterion | Verification Steps |
|-------------------|--------------------|
| 1. Gestor sees CNPJ list with fomentos count + KPI cards | Login as gestor → navigate /execucao → confirm table rows show CNPJ + big number + 4 KPI cards load at top |
| 2. Click CNPJ row opens slide-over with full financial detail | Click any row → confirm slide-over opens from right → confirm all required fields present (desembolso, saldo, % bar, data fim, dias execucao, contact badge) |
| 3. Alert-highlighted rows visible for tem_alerta=true CNPJs | Confirm rows with `valor_desembolsado=0` have amber left border `border-l-4 border-amber-400` and amber "Alerta" badge |
| 4. Vendedor redirected to /sem-permissao; nav entry absent | Login as vendedor → navigate /execucao → confirm /sem-permissao redirect → confirm sidebar has no "Projetos em Execucao" entry |
| 5. Freshness timestamp shows last execucao sync time | Confirm "Dados atualizados em {date}" text visible below page title; date matches most recent `cron_sync_log` row WHERE `source='sync-execucao'` |

### API Contract Checks (verifiable via curl/browser devtools)

```bash
# Check 1: GET /api/execucao returns { rows, last_synced } (not bare array) after Plan 17-01
# Expected: { "rows": [...], "last_synced": "2026-03-18T..." }
curl -s http://localhost:3000/api/execucao | python3 -c "import sys,json; d=json.load(sys.stdin); print(type(d), list(d.keys()))"

# Check 2: Vendedor session returns 401 from API
# Expected: { "error": "Unauthorized" }
# Manual: call /api/execucao while authenticated as vendedor via browser devtools fetch

# Check 3: Slide-over detail fetch returns array of convenios
# Expected: array of ExecucaoDetailRow objects
curl -s http://localhost:3000/api/execucao/12345678000195 | python3 -c "import sys,json; d=json.load(sys.stdin); print(type(d), len(d), 'rows')"
```

### Wave 0 Gaps (must be created before implementation)

No automated test framework exists or needs to be created for this phase. All validation is manual functional verification following the Phase 16 pattern. The VERIFICATION.md created by gsd-verifier will formalize the observable truths checklist.

The only "gap" that must be filled before other plans can verify correctly: `web/src/app/sem-permissao/page.tsx` — this must exist before Plan 17-01's role guard is testable end-to-end. It is created within Plan 17-01 itself.

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| Client-side role redirect (fetch session in useEffect, redirect in effect) | Server component + `verifySession()` + `redirect()` | Plan 17-01 uses server component — NOT the client-side pattern from distribuir/page.tsx |
| Manual debounce implementation | `useCallback` + `useEffect` + `clearTimeout` | Pattern from leads/page.tsx lines 115-118 — copy exactly |
| Bare array response from API | `{ rows, last_synced }` response shape | This is a small breaking change to /api/execucao — must be coordinated in Plan 17-01 |

**Deprecated / outdated in this project:**
- Client-side session fetch + role redirect: `distribuir/page.tsx` does `fetch('/api/auth/session')` in a `useEffect` — this pattern is not used for /execucao. Use the server component pattern instead.

---

## Open Questions

1. **UF options for the dropdown filter**
   - What we know: The `uf` column in `projetos_execucao` contains Brazilian state codes (AC, AL, AM...). The API accepts `?uf=XX`.
   - What's unclear: Should the UF dropdown be populated from a static list of 27 Brazilian states, or from a `SELECT DISTINCT uf` query?
   - Recommendation: Static list of the 27 Brazilian state codes. Avoids an extra API call and UF values are fixed. Consistent with how other pages handle UF filters.

2. **cron_sync_log source column backfill**
   - What we know: The `cron_sync_log` CREATE TABLE in `repo-sync.ts` (line 509) does NOT include a `source` column. Only `execucao-sync.ts` inserts with `source`.
   - What's unclear: Does the `source` column exist in the production DB? If the column was added after initial table creation, it may not exist on older DBs.
   - Recommendation: The Plan 17-01 SQL for freshness should use a TRY/CATCH around the source-filtered query, falling back to `SELECT ran_at FROM cron_sync_log ORDER BY ran_at DESC LIMIT 1` if the column doesn't exist. The execucao-sync INSERT at line 403 would have failed if the column didn't exist, so if execucao sync has run, the column exists.

---

## Sources

### Primary (HIGH confidence)
- `web/src/components/LeadSlideOver.tsx` — slide-over structural pattern, Escape key handler, panel CSS, lazy fetch pattern
- `web/src/components/Sidebar.tsx` — NavIcon switch pattern, role-based navItems array, nav link CSS, BASE_NAV_ITEMS structure
- `web/src/components/KPICard.tsx` — KPI card props interface (`title`, `value`, `subtitle`, `icon`, `delta`, `deltaType`)
- `web/src/components/KPIRow.tsx` — KPI row container
- `web/src/app/leads/page.tsx` — debounced fetch pattern, table structure, loading state, slide-over state management
- `web/src/app/bi/page.tsx` — client-only page pattern with useEffect fetch (no server component guard needed)
- `web/src/app/api/execucao/route.ts` — ExecucaoAggRow type, filter params, alert business rule (ALERT_ZERO_EXECUTION = valor_desembolsado=0)
- `web/src/app/api/execucao/[cnpj]/route.ts` — ExecucaoDetailRow type, detail query
- `web/src/lib/dal.ts` — verifySession (React-cached, redirects to /login), getApiSession signatures
- `web/src/lib/format.ts` — formatCNPJ, formatCompactCurrency, formatDate, formatCurrency signatures
- `web/tailwind.config.ts` — animate-slide-in-right defined (lines 30-36), sigma color tokens
- `web/src/lib/execucao-sync.ts` lines 400-407 — `source='sync-execucao'` confirmed in cron_sync_log INSERT
- `.planning/phases/17-ui-navigation/17-UI-SPEC.md` — approved design contract (copywriting, spacing, color, components, table columns)
- `.planning/STATE.md` — key decisions: role guard on page+API, objeto excluded from grouped response, alert condition valor_desembolsado=0

### Secondary (MEDIUM confidence)
- `web/src/app/distribuir/page.tsx` — client-side role redirect pattern (NOT recommended for /execucao — use server component instead)
- `web/src/app/api/debug-sync/route.ts` — cron_sync_log query pattern (does not filter by source — confirmed limitation)
- `web/src/lib/repo-sync.ts` lines 507-516 — original cron_sync_log CREATE TABLE (no `source` column in schema definition)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries and utilities verified directly from source code
- Architecture: HIGH — all patterns copied from existing verified source files in this codebase
- Pitfalls: HIGH — identified from direct code inspection (NUMERIC-as-string, missing sem-permissao page, stale slide-over data, pct overflow)
- API shape change: MEDIUM — `{ rows, last_synced }` extension is a recommendation, plan must explicitly include both server and client update

**Research date:** 2026-03-18
**Valid until:** Indefinite — this is an internal codebase, not an external dependency
