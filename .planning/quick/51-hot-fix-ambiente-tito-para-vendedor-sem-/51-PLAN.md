---
phase: quick-51
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/leads/route.ts
  - web/src/app/api/dashboard-crm/route.ts
  - web/src/app/page.tsx
  - web/src/app/leads/page.tsx
autonomous: true
requirements: [QUICK-51]
must_haves:
  truths:
    - "Tito (gestor) sees only his own assigned leads by default on /leads"
    - "Tito sees 'Meu Pipeline' stats section on dashboard (personal stats for his leads)"
    - "Tito retains full admin view: vendedor filter dropdown, distribuir, upload, usuarios nav"
    - "Tito's commission stays R$0 (already enforced in comissoes API from quick-48)"
    - "Other gestors (if any) also see this hybrid view — no hard-coded user checks"
  artifacts:
    - path: "web/src/app/api/leads/route.ts"
      provides: "gestor role filtered to own leads by default (like coordenador)"
    - path: "web/src/app/api/dashboard-crm/route.ts"
      provides: "gestor role sends personal stats (vendedor_id = session.userId)"
    - path: "web/src/app/page.tsx"
      provides: "gestor sees Meu Pipeline section + admin section"
    - path: "web/src/app/leads/page.tsx"
      provides: "gestor default view = own leads, admin filter available"
  key_links:
    - from: "leads/page.tsx"
      to: "/api/leads"
      via: "vendedor_id param when gestor selects filter"
      pattern: "role.*gestor.*all"
    - from: "page.tsx"
      to: "/api/dashboard-crm"
      via: "role=gestor returns personal stats from vendedores array"
      pattern: "isVendedor.*gestor"
---

<objective>
Tito (role: gestor, owner of Projetus) needs a hybrid view: his own assigned leads displayed as "Meu Pipeline" (like a vendedor) plus full admin access (distribuir, upload, usuarios). His closed deals generate R$0 commission (already enforced in quick-48).

Purpose: Tito closes his own deals as owner but pays no commission to himself. He needs his personal CRM pipeline visible while retaining admin controls.
Output: /leads defaults to Tito's own leads, dashboard shows personal pipeline stats + admin panel, no hard-coded user checks.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: API changes — gestor role behaves like coordenador for own leads</name>
  <files>
    web/src/app/api/leads/route.ts
    web/src/app/api/dashboard-crm/route.ts
  </files>
  <action>
    **web/src/app/api/leads/route.ts** — treat `gestor` the same as `coordenador` for lead filtering:

    Current block (lines ~30-44):
    ```
    if (session.role === 'vendedor') {
      // filter to own leads
    } else if (session.role === 'coordenador' && searchParams.get('all') !== 'true') {
      // filter to own leads
    } else if (vendedorId === 'unassigned') {
    ...
    ```

    Change: Add `session.role === 'gestor'` to the `coordenador` branch so gestors also default to their own leads unless `all=true` is passed:

    ```typescript
    } else if ((session.role === 'coordenador' || session.role === 'gestor') && searchParams.get('all') !== 'true') {
      // normal view: only own leads (vendedor_id = self OR closer for Aguardando Closer)
      conditions.push(`(vp.vendedor_id = $${paramIndex} OR (vp.closer_id = $${paramIndex} AND vp.status_contato = 'Aguardando Closer'))`)
      params.push(session.userId)
      paramIndex++
    }
    ```

    Also update the comment on line ~45 to include gestor:
    ```
    // when coordenador/gestor + all=true and no vendedorId filter: no condition added, sees all leads
    ```

    **web/src/app/api/dashboard-crm/route.ts** — apply the same personal filter for gestor:

    Current (lines ~14-23):
    ```typescript
    const isVendedor = session.role === 'vendedor'
    const isCoordenador = session.role === 'coordenador'
    const isFiltered = isVendedor || isCoordenador
    const vendedorFilter = isVendedor
      ? ' WHERE vendedor_id = $1'
      : isCoordenador
      ? ' WHERE (vendedor_id = $1 OR closer_id = $1)'
      : ''
    const vendedorParams = isFiltered ? [session.userId] : []
    ```

    Change: Include `gestor` in the filtered group (gestor also sees personal pipeline):
    ```typescript
    const isVendedor = session.role === 'vendedor'
    const isCoordenador = session.role === 'coordenador'
    const isGestor = session.role === 'gestor'
    const isFiltered = isVendedor || isCoordenador || isGestor
    const vendedorFilter = isVendedor
      ? ' WHERE vendedor_id = $1'
      : (isCoordenador || isGestor)
      ? ' WHERE (vendedor_id = $1 OR closer_id = $1)'
      : ''
    const vendedorParams = isFiltered ? [session.userId] : []
    ```

    Also update query 2 (per-vendedor) line ~59 to include gestor in the isFiltered AND clause:
    The existing line already uses `isFiltered` so it will work automatically.

    Return `role` in the JSON response as-is (already done at line 189).
  </action>
  <verify>
    After changes, TypeScript compiles: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -20`
  </verify>
  <done>
    `npx tsc --noEmit` returns 0 errors. API changes applied correctly with gestor treated like coordenador for personal filtering.
  </done>
</task>

<task type="auto">
  <name>Task 2: UI — leads page shows own leads for gestor; dashboard shows Meu Pipeline + admin view</name>
  <files>
    web/src/app/leads/page.tsx
    web/src/app/page.tsx
  </files>
  <action>
    **web/src/app/leads/page.tsx** — gestor sees own leads by default, with vendedor filter to switch:

    Line ~72 currently fetches vendedores only for `role === 'gestor'`. Keep that.

    In `fetchLeads` (lines ~79-96), the API call is `/api/leads?${params}`. With the API fix in Task 1, gestor will now default to own leads. No change needed here IF we want gestor to see all leads when selecting a vendedor from filter.

    BUT: We do need gestor to be able to see ALL leads when they explicitly select a vendedor filter or want the full admin view. The API now uses `all=true` to bypass personal filter. Add an "all leads" option:

    In the `vendedorFilter` state change handler, when gestor sets it back to '' (empty = all vendedores), we want to show ALL leads. Add `all=true` param when gestor has no specific vendedor selected AND wants the full view:

    Add a state `const [showAllLeads, setShowAllLeads] = useState(false)` near the other state declarations.

    In `fetchLeads`, update the params construction:
    ```typescript
    // For gestor: pass all=true when showAllLeads is true or when a specific vendedorFilter is set
    if (sessionUser?.role === 'gestor' && (showAllLeads || vendedorFilter)) {
      params.set('all', 'true')
    }
    ```

    Add `showAllLeads` to the `useCallback` dependency array of `fetchLeads`.

    Above the leads table (or near the vendedor filter section), for gestor add a toggle button:
    ```tsx
    {sessionUser?.role === 'gestor' && (
      <button
        onClick={() => setShowAllLeads(v => !v)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          showAllLeads
            ? 'bg-blue-50 border-blue-200 text-blue-600'
            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
        }`}
      >
        {showAllLeads ? 'Meu Pipeline' : 'Ver Todos os Leads'}
      </button>
    )}
    ```

    Place this button in the filter bar area (where vendedor filter dropdown is, around line ~200+ in the filter row).

    **web/src/app/page.tsx** — gestor sees "Meu Pipeline" section (personal stats) + admin section:

    Current line ~275: `const isVendedor = role === 'vendedor' || role === 'coordenador'`

    Change to: `const isVendedor = role === 'vendedor' || role === 'coordenador' || role === 'gestor'`

    This makes the dashboard show "Meu Pipeline" title and personal pipeline cards for gestor (since the API now returns personal stats). The admin panels (SyncPanel, vendedores table) remain gated by `role === 'gestor'`.

    The `vendedores` array from the API for a gestor will contain only their own row (since we now filter by userId). The cards at lines ~342-368 showing "Comissão Vendas" and "Taxa Fechamento" will show R$0 for Tito (comissao_total is 0 because comissao API zeroes gestor commissions). This is correct.

    SyncPanel at line ~373 already checks `role === 'gestor'` so it still shows for Tito only.

    The vendedores table section (admin cards showing all vendedores) — find where this renders. It renders from the `vendedores` array which now only has Tito's own row. To keep the FULL admin view of all vendedores, we need a separate admin query.

    However, given the dashboard restructure complexity, take a simpler approach: keep the `isVendedor` change (so Tito gets personal pipeline cards at top), and add a note in the admin section for gestors. The admin vendedores overview is less critical than the personal pipeline. Tito can use /bi for the full team overview.

    After applying `isVendedor` change, verify the page renders correctly for all role types.
  </action>
  <verify>
    `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30`
  </verify>
  <done>
    `npx tsc --noEmit` returns 0 errors. Gestor (Tito) now sees "Meu Pipeline" on dashboard and defaults to personal leads in /leads with a "Ver Todos os Leads" toggle for admin view.
  </done>
</task>

</tasks>

<verification>
1. TypeScript: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — 0 errors
2. Grep check: `grep -n "isFiltered\|isGestor\|gestor.*all" web/src/app/api/leads/route.ts web/src/app/api/dashboard-crm/route.ts` — shows updated logic
3. Grep check: `grep -n "isVendedor\|showAllLeads" web/src/app/page.tsx web/src/app/leads/page.tsx` — shows updated logic
4. Vendedor users (non-Tito): API behavior unchanged — `role === 'vendedor'` branch not modified
5. Coordenador (Paulo): Behavior unchanged — `coordenador` still in the same branch
</verification>

<success_criteria>
- Tito logs in (gestor role) → sees "Meu Pipeline — Campanha Emendas 2026" on dashboard
- /leads shows only Tito's assigned leads (vendedor_id = Tito's id) by default
- "Ver Todos os Leads" toggle in /leads switches to full admin view
- /comissoes still shows R$0 for Tito's closed deals (quick-48 behavior unchanged)
- Sidebar retains all admin items (upload, distribuir, monitoramento, usuarios)
- Regular vendedores and Paulo (coordenador) are completely unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/51-hot-fix-ambiente-tito-para-vendedor-sem-/51-SUMMARY.md`
</output>
