---
phase: quick-45
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/components/Sidebar.tsx
  - web/src/app/distribuir/page.tsx
  - web/src/app/api/leads/route.ts
autonomous: true
requirements: [QUICK-45]

must_haves:
  truths:
    - "Paulo Gabriel (gestor_vendedor) sees Distribuir Leads in sidebar navigation"
    - "Paulo Gabriel can access /distribuir without being redirected away"
    - "Paulo Gabriel sees all leads (unassigned and assigned) on /distribuir"
    - "Paulo Gabriel can distribute/reassign leads on /distribuir"
    - "Paulo Gabriel can view commissions page with full data (read-only)"
    - "Paulo Gabriel cannot see the Editar button on commissions — already correct since isGestor guards it"
  artifacts:
    - path: "web/src/components/Sidebar.tsx"
      provides: "Distribuir Leads nav item for gestor_vendedor"
      contains: "distribuir"
    - path: "web/src/app/distribuir/page.tsx"
      provides: "Access for gestor_vendedor role"
      contains: "gestor_vendedor"
    - path: "web/src/app/api/leads/route.ts"
      provides: "Full lead list for gestor_vendedor on distribuir page"
  key_links:
    - from: "Sidebar.tsx"
      to: "/distribuir"
      via: "gestor_vendedor navItems array"
    - from: "distribuir/page.tsx"
      to: "/api/leads"
      via: "fetch with vendedor_id=unassigned"
    - from: "api/leads/route.ts"
      to: "vendedor_projetos"
      via: "SQL query without gestor_vendedor self-restriction when all=true"
---

<objective>
Enable Paulo Gabriel (role: gestor_vendedor) to access lead distribution and view all commissions read-only.

Purpose: Paulo is a coordinator who needs to distribute leads among the team and monitor all commissions, but must not edit commission values.
Output: Distribuir Leads accessible in nav + page works + leads API returns all leads for distribution context.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Distribuir Leads to gestor_vendedor sidebar and fix page role guard</name>
  <files>
    web/src/components/Sidebar.tsx
    web/src/app/distribuir/page.tsx
  </files>
  <action>
    In web/src/components/Sidebar.tsx:
    - Find the `gestor_vendedor` navItems array (line ~60-64). Currently it has BASE_NAV_ITEMS + Monitoramento.
    - Add `{ href: '/distribuir', label: 'Distribuir Leads', icon: 'distribuir' }` to this array, after Monitoramento.

    In web/src/app/distribuir/page.tsx:
    - The useEffect at line ~79-87 fetches session and redirects if role !== 'gestor'. Change the condition to allow both 'gestor' and 'gestor_vendedor':
      ```
      if (s?.user?.role !== 'gestor' && s?.user?.role !== 'gestor_vendedor') {
        window.location.href = '/'
      } else {
        setUserRole(s.user.role)
      }
      ```
    - The useEffect at line ~89-95 that triggers data fetching checks `if (userRole === 'gestor')`. Update it to:
      ```
      if (userRole === 'gestor' || userRole === 'gestor_vendedor') {
      ```
    - The early return at line ~335 checks `if (userRole !== 'gestor')`. Update it to:
      ```
      if (userRole !== 'gestor' && userRole !== 'gestor_vendedor') {
      ```
    - The CNPJ Monitoring section (the amber box, line ~353-392) is specifically for gestor assigning to Paulo Gabriel. Keep it visible only for gestor role. Wrap the amber box with a conditional: `{userRole === 'gestor' && ( ... amber box JSX ... )}`.
  </action>
  <verify>
    Login as Paulo Gabriel (gestor_vendedor), confirm sidebar shows "Distribuir Leads" link, click it and confirm the page loads without redirect.
  </verify>
  <done>
    gestor_vendedor role sees /distribuir in nav and can access the page. The CNPJ monitoring section (amber box) only shows for gestor.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix leads API so gestor_vendedor sees all leads for distribution</name>
  <files>
    web/src/app/api/leads/route.ts
  </files>
  <action>
    The current API code (line ~30-38) forces gestor_vendedor to only see their own leads:
    ```ts
    if (session.role === 'vendedor' || session.role === 'gestor_vendedor') {
      conditions.push(`(vp.vendedor_id = $${paramIndex} OR ...)`)
      params.push(session.userId)
      paramIndex++
    }
    ```

    Change this block to separate gestor_vendedor from vendedor and add an escape hatch via a query param `?all=true`:

    ```ts
    if (session.role === 'vendedor') {
      conditions.push(`(vp.vendedor_id = $${paramIndex} OR (vp.closer_id = $${paramIndex} AND vp.status_contato = 'Aguardando Closer'))`)
      params.push(session.userId)
      paramIndex++
    } else if (session.role === 'gestor_vendedor') {
      const showAll = searchParams.get('all') === 'true'
      if (!showAll) {
        conditions.push(`(vp.vendedor_id = $${paramIndex} OR (vp.closer_id = $${paramIndex} AND vp.status_contato = 'Aguardando Closer'))`)
        params.push(session.userId)
        paramIndex++
      }
      // if showAll=true, no filter — same as gestor, sees all leads
    } else if (vendedorId === 'unassigned') {
    ```

    Then in web/src/app/distribuir/page.tsx, update the fetch calls to pass `all=true`:
    - `fetchLeads`: change `fetch('/api/leads?vendedor_id=unassigned&limit=5000')` to `fetch('/api/leads?vendedor_id=unassigned&limit=5000&all=true')`
    - `fetchAssignedLeads`: change `fetch('/api/leads?limit=5000')` to `fetch('/api/leads?limit=5000&all=true')`

    Note: the `vendedor_id=unassigned` param in fetchLeads is handled by the `else if (vendedorId === 'unassigned')` branch in the API, which is only reached when role is gestor. After the fix, gestor_vendedor with `all=true` will skip the self-filter and hit the `vendedor_id=unassigned` branch from the next else-if. Wait — re-check: `vendedorId === 'unassigned'` check comes AFTER the role check, so for gestor_vendedor with showAll=true, we skip the role condition, then fall through to `else if (vendedorId === 'unassigned')` — but that is inside the else-if chain from the role check. Restructure so vendor_id filtering happens after the role-based ownership check:

    Final structure for the role-based ownership section:
    ```ts
    if (session.role === 'vendedor') {
      // restrict to own leads
      conditions.push(`(vp.vendedor_id = $${paramIndex} OR (vp.closer_id = $${paramIndex} AND vp.status_contato = 'Aguardando Closer'))`)
      params.push(session.userId)
      paramIndex++
    } else if (session.role === 'gestor_vendedor' && searchParams.get('all') !== 'true') {
      // normal view: only own leads
      conditions.push(`(vp.vendedor_id = $${paramIndex} OR (vp.closer_id = $${paramIndex} AND vp.status_contato = 'Aguardando Closer'))`)
      params.push(session.userId)
      paramIndex++
    } else if (vendedorId === 'unassigned') {
      conditions.push(`vp.vendedor_id IS NULL`)
    } else if (vendedorId) {
      conditions.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(vendedorId)
    }
    // when gestor_vendedor + all=true and no vendedorId filter: no condition added, sees all leads
    ```
  </action>
  <verify>
    As gestor_vendedor: visit /distribuir, both "Nao Atribuidos" and "Distribuidos" tabs should show all leads (not just Paulo's own). The /leads page (without all=true) should still show only Paulo's own leads (unchanged behavior).
  </verify>
  <done>
    gestor_vendedor with all=true sees all leads. Without all=true (e.g. /leads page), gestor_vendedor still sees only their own leads. Distribution assignments work correctly.
  </done>
</task>

</tasks>

<verification>
1. As gestor_vendedor: sidebar shows Distribuir Leads link
2. As gestor_vendedor: /distribuir loads, shows all unassigned leads in tab, shows all distributed leads in tab
3. As gestor_vendedor: can select leads and assign to vendedores
4. As gestor_vendedor: /leads page still shows only their own leads (unchanged)
5. As gestor_vendedor: /comissoes shows full read-only data, no Editar button visible (already correct — isGestor guards it)
6. The amber CNPJ monitoring box only appears for gestor role users
</verification>

<success_criteria>
Paulo Gabriel can navigate to /distribuir, see all leads across all sellers, distribute/reassign them. He can view /comissoes with full data but no edit controls. His /leads page behavior is unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/45-visualizacao-do-paulo-grabriel-precisa-t/45-SUMMARY.md`
</output>
