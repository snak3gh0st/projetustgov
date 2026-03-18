# Phase 17: UI & Navigation — Research

**Researched:** 2026-03-18
**Domain:** Next.js App Router page composition, Tailwind CSS, role-based access, slide-over pattern
**Confidence:** HIGH

---

## Summary

Phase 17 is a pure UI assembly phase. The API contract (Phase 16) is complete and stable. All component patterns are direct copies of existing code in this codebase — no new libraries, no new design system decisions, no external dependencies. The UI-SPEC has been approved and is the authoritative design contract. Research confirms every element described in the UI-SPEC already exists in code that can be directly referenced.

The three plans map cleanly to three discrete file edits: create `execucao/page.tsx`, create `ExecucaoSlideOver.tsx`, and modify `Sidebar.tsx`. All three use patterns already present in `leads/page.tsx`, `LeadSlideOver.tsx`, and `Sidebar.tsx` respectively. No architectural decisions remain — they were settled in Phases 14-16 and the UI-SPEC.

One gap that requires a new file: the `/sem-permissao` page does not exist in the codebase. The `distribuir/page.tsx` redirects to `/` on unauthorized, but the STATE.md decision log specifies vendedores must be redirected to `/sem-permissao` (not login, not root). This page must be created in Plan 17-01.

**Primary recommendation:** Implement Plans 17-01, 17-02, 17-03 in order. 17-01 depends on `/sem-permissao` page existing. 17-02 depends on the client component in 17-01 having `selectedCnpj` state to pass as prop. 17-03 is fully independent and can be done in any order.

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

### Reused Components (no changes)
| Component | File | Used As |
|-----------|------|---------|
| `KPICard` | `web/src/components/KPICard.tsx` | 4x KPI cards at top of /execucao |
| `KPIRow` | `web/src/components/KPIRow.tsx` | Container for 4 KPI cards |

**Installation:** None required — all dependencies are already present.

---

## Architecture Patterns

### Recommended File Structure (new files only)
```
web/src/app/
└── execucao/
    └── page.tsx              # Server component role guard + ExecucaoClient inline or imported
web/src/app/sem-permissao/
    └── page.tsx              # Static "sem permissao" page (redirect target for vendedor)
web/src/components/
    └── ExecucaoSlideOver.tsx # Right slide-over for per-CNPJ detail
```

**Modified files:**
```
web/src/components/Sidebar.tsx    # Add execucao nav entry + NavIcon case
```

### Pattern 1: Server Component Role Guard (for page.tsx)

The STATE.md decision log (2026-03-18) confirms: "Role guard on both page (verifySession) and API (getApiSession)". The page.tsx must be a server component that calls `verifySession`, checks role, and redirects vendedor to `/sem-permissao`. The client component is then a separate `'use client'` component (either inlined or in its own file).

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
  return <ExecucaoClient user={session} />
}
```

**Critical:** `verifySession` is cached (uses React `cache()`). The `redirect()` for vendedor role must fire BEFORE rendering any client component. The `/sem-permissao` redirect is to a new static page — NOT to `/login` and NOT to `/`.

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
    setRows(Array.isArray(data) ? data : [])
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

### Pattern 3: Slide-Over Component (for ExecucaoSlideOver)

Direct copy from `web/src/components/LeadSlideOver.tsx` structure. Key structural elements (all verified from source):

- Wrapper: `fixed inset-0 z-50`
- Backdrop: `absolute inset-0 bg-black/30 backdrop-blur-sm` with `onClick={onClose}`
- Panel: `absolute right-0 top-0 h-full w-[420px] max-w-[90vw] bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-slide-in-right`
- Top accent: `absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0072F7] to-blue-400 pointer-events-none`
- `animate-slide-in-right` is defined in `tailwind.config.ts` — no additional CSS needed

The ExecucaoSlideOver fetches `/api/execucao/{cnpj}` lazily on open (useEffect triggered by `cnpj` prop). NOT pre-fetched.

```typescript
// Source: web/src/components/LeadSlideOver.tsx (Escape key handler pattern)
useEffect(() => {
  if (!cnpj) return
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [cnpj, onClose])
```

### Pattern 4: Sidebar Nav Extension

The Sidebar has two clear extension points:
1. Add nav item to gestor array and coordenador array (lines 53-65 in Sidebar.tsx)
2. Add `case 'execucao'` to `NavIcon` switch (lines 15-38 in Sidebar.tsx)

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

The `cron_sync_log` table has a `source` column. execucao-sync.ts inserts with `source = 'sync-execucao'`. The execucao page needs to query the most recent row WHERE `source = 'sync-execucao'` to show the correct freshness, not the most recent log overall (which might be a leads sync).

The GET /api/execucao response should include a `last_synced` field, OR the client component fetches a dedicated endpoint. The simplest approach: add `last_synced` to the GET /api/execucao response as a sibling to the rows array. This avoids a second fetch.

**Alternate approach:** Change GET /api/execucao to return `{ rows: ExecucaoAggRow[], last_synced: string | null }` instead of a bare array. This is a minor API change but keeps it clean.

**Simpler approach:** Fetch `/api/debug-sync` (already exists) which queries `cron_sync_log` and returns `last_sync_log`. However, debug-sync does NOT filter by source — it returns the most recent row regardless of source. This means if leads sync ran after execucao sync, the timestamp would show the leads sync time.

**Recommended:** Extend GET /api/execucao to return `{ rows, last_synced }` — query `SELECT ran_at FROM cron_sync_log WHERE source = 'sync-execucao' ORDER BY ran_at DESC LIMIT 1` inline in the route. This is 3 lines of SQL added to the existing route.

### Pattern 6: KPI Cards Computed Client-Side

KPI values are derived from the fetched `rows` array — no second API call. The UI-SPEC section "KPI Cards (UI-03)" documents exactly what to compute:

```typescript
// Computed from rows array after fetch completes
const kpis = useMemo(() => ({
  totalClientes: rows.length,
  totalFomentos: rows.reduce((s, r) => s + r.total_projetos, 0),
  totalDesembolsado: rows.reduce((s, r) => s + Number(r.total_desembolsado), 0),
  alertasAtivos: rows.filter(r => r.tem_alerta).length,
}), [rows])
```

### Pattern 7: Alert Row Highlighting

```typescript
// Source: UI-SPEC "Interaction Contract" + "Table Columns"
// Alert rows get a left border override class
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
// Cap at 100 for display
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
- **Pre-fetching slide-over data:** Do NOT fetch `/api/execucao/{cnpj}` for all rows on page load. Fetch lazily on slide-over open only.
- **Passing user prop through to client component as full session object:** Pass only `role` — the client component does not need `userId` or `email` for this read-only page.
- **Using middleware for role guard:** Middleware checks session existence only, not role (confirmed in STATE.md). Must guard in page.tsx with `verifySession`.
- **Computing KPI sums from API:** KPI cards are computed client-side from the `rows` array. Do not add a second API call.
- **Querying cron_sync_log without source filter:** The table stores both leads and execucao sync events. Always filter `WHERE source = 'sync-execucao'` to get the correct freshness time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide-over animation | Custom CSS animation | `animate-slide-in-right` (tailwind.config.ts) | Already defined, consistent with LeadSlideOver |
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
**How to avoid:** Always wrap with `Number()` before arithmetic or display: `Number(row.total_desembolsado)`. The `formatCompactCurrency` function already accepts `string | number` so it handles this.
**Warning signs:** KPI sums showing "0" or NaN despite data being present.

### Pitfall 2: Missing sem-permissao Page
**What goes wrong:** Page.tsx calls `redirect('/sem-permissao')` for vendedor, but that page does not exist — Next.js returns 404 instead of a clear access-denied message.
**Why it happens:** The page has never been created. `distribuir/page.tsx` redirects to `/` (root) instead.
**How to avoid:** Plan 17-01 must create `web/src/app/sem-permissao/page.tsx` before testing the role guard.
**Warning signs:** Vendedor navigating to /execucao sees a 404 page.

### Pitfall 3: layout.tsx Hardcodes Role Type Without Coordenador
**What goes wrong:** `layout.tsx` line 25 casts session role as `'gestor' | 'vendedor' | 'visualizador'` — coordenador is missing from the union type.
**Why it happens:** layout.tsx was written before coordenador role was added.
**How to avoid:** When reading Sidebar props in layout.tsx, the type cast is for the Sidebar prop. The SidebarProps interface already includes `coordenador`. The cast on line 25 is technically wrong (TypeScript may warn) but functional — Sidebar.tsx handles all 4 roles. Do NOT change layout.tsx as part of this phase unless TypeScript errors occur; it's out of scope.
**Warning signs:** TypeScript error on `session.user.role as 'gestor' | 'vendedor' | 'visualizador'` if coordenador session user loads layout.

### Pitfall 4: pct_execucao Can Exceed 100
**What goes wrong:** Progress bar renders wider than its container or overflows layout.
**Why it happens:** `valor_desembolsado / valor_repasse * 100` can exceed 100 if disbursement exceeds repasse (data anomaly, confirmed possible by STATE.md context).
**How to avoid:** `Math.min(100, Number(convenio.pct_execucao) || 0)` — cap at 100 before setting `width` style.
**Warning signs:** Progress bar visually overflows its container.

### Pitfall 5: dias_ate_vencimento Can Be Negative
**What goes wrong:** "Urgency coloring" logic that only handles positive values renders nothing or wrong color for expired projects.
**Why it happens:** `data_fim_vigencia - NOW()` is negative for already-expired projects (fim vigencia in the past).
**How to avoid:** Handle `< 0` explicitly: `dias < 0 ? 'text-red-600 font-bold' : dias < 30 ? 'text-red-500' : dias < 90 ? 'text-amber-600' : 'text-gray-600'`.
**Warning signs:** Expired projects showing no urgency color.

### Pitfall 6: Slide-Over Stale Data on Re-Open
**What goes wrong:** Re-opening the slide-over for a different CNPJ shows previous CNPJ's data briefly.
**Why it happens:** `useEffect` fires asynchronously after render — if detail rows state is not cleared first, old data appears during loading.
**How to avoid:** Clear `detailRows` state when `cnpj` prop changes BEFORE the fetch completes: set to `[]` at the start of the fetch effect, or use a key prop to force unmount/remount.
**Warning signs:** Slide-over briefly shows wrong CNPJ's convenio list when switching rows.

### Pitfall 7: Search Debounce on Alert Toggle
**What goes wrong:** Applying 300ms debounce to the alert toggle checkbox makes the UI feel sluggish.
**Why it happens:** The debounce wrapper wraps all filter state changes including `alertOnly`.
**How to avoid:** Debounce only the `search` text input (300ms). UF dropdown and alert toggle should trigger re-fetch immediately (no debounce) — matches the pattern in `leads/page.tsx` where search is debounced but status filter is immediate.

---

## Code Examples

### API Response Type (from /api/execucao GET)
```typescript
// Source: web/src/app/api/execucao/route.ts — ExecucaoAggRow interface
interface ExecucaoAggRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  total_projetos: number
  total_repasse: string        // NUMERIC as string
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
  valor_global: string | null
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
  if (dias < 0) return 'text-red-600 font-bold'   // expired
  if (dias < 30) return 'text-red-500 font-medium'
  if (dias <= 90) return 'text-amber-600'
  return 'text-gray-600'
}
```

### Freshness Timestamp Fetch Pattern
```typescript
// Recommended: extend /api/execucao to return { rows, last_synced }
// In route.ts — add after main query:
const syncRows = await query(
  `SELECT ran_at FROM cron_sync_log WHERE source = 'sync-execucao' ORDER BY ran_at DESC LIMIT 1`
)
const last_synced = syncRows[0]?.ran_at ?? null
return NextResponse.json({ rows, last_synced })
// In client: display as "Dados atualizados em {formatDate(last_synced)}"
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| Client-side redirect for role guard | Server component + verifySession + redirect() | Phase 17 must use server component pattern — not client-side session check like distribuir/page.tsx |
| Manual debounce with setTimeout | useCallback + useEffect + clearTimeout | Pattern from leads/page.tsx lines 115-118 |

---

## Open Questions

1. **API shape for freshness timestamp**
   - What we know: `/api/execucao` currently returns a bare array. `cron_sync_log` has `source='sync-execucao'` rows.
   - What's unclear: Should the API response be changed to `{ rows, last_synced }` or should a separate fetch be made?
   - Recommendation: Change `/api/execucao` to return `{ rows, last_synced }`. Minimally invasive — the route already has access to the DB pool. The planner should explicitly include this API change in Plan 17-01 task actions.

2. **UF options for the dropdown filter**
   - What we know: The `uf` column in `projetos_execucao` contains Brazilian state codes (AC, AL, AM...). The API accepts `?uf=XX`.
   - What's unclear: Should the UF dropdown be populated from a static list of 27 Brazilian states, or from a `SELECT DISTINCT uf` query?
   - Recommendation: Static list of the 27 Brazilian state codes. Avoids an extra API call and UF values are fixed. This is consistent with how other pages handle UF filters.

---

## Sources

### Primary (HIGH confidence)
- `web/src/components/LeadSlideOver.tsx` — slide-over structural pattern, Escape key handler, panel CSS
- `web/src/components/Sidebar.tsx` — NavIcon switch pattern, role-based navItems array, nav link CSS
- `web/src/components/KPICard.tsx` + `KPIRow.tsx` — KPI card props interface, grid layout
- `web/src/app/leads/page.tsx` — debounced fetch pattern, table structure, loading state, slide-over state management
- `web/src/app/api/execucao/route.ts` — ExecucaoAggRow type, filter params, alert business rule
- `web/src/app/api/execucao/[cnpj]/route.ts` — ExecucaoDetailRow type, detail query
- `web/src/lib/dal.ts` — verifySession, getApiSession signatures and behavior
- `web/src/lib/format.ts` — formatCNPJ, formatCompactCurrency, formatDate signatures
- `web/tailwind.config.ts` — animate-slide-in-right defined, sigma color tokens
- `.planning/phases/17-ui-navigation/17-UI-SPEC.md` — approved design contract (copywriting, spacing, color, components)
- `.planning/STATE.md` — key decisions: role guard on page+API, object excluded from grouped response, alert condition valor_desembolsado=0

### Secondary (MEDIUM confidence)
- `web/src/app/distribuir/page.tsx` — client-side role redirect pattern (NOT recommended for /execucao — use server component instead)
- `web/src/lib/execucao-sync.ts` — `source='sync-execucao'` confirmed in cron_sync_log INSERT

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries and utilities verified directly from source code
- Architecture: HIGH — all patterns copied from existing verified source files in this codebase
- Pitfalls: HIGH — identified from direct code inspection (NUMERIC-as-string, missing sem-permissao page, layout.tsx type cast)
- API shape: MEDIUM — `last_synced` addition is a recommendation, not confirmed in existing code

**Research date:** 2026-03-18
**Valid until:** Indefinite — this is an internal codebase, not an external dependency
