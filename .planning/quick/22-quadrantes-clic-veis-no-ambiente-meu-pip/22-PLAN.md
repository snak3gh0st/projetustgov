---
phase: quick-22
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/page.tsx
  - web/src/app/leads/page.tsx
autonomous: true
requirements:
  - QUICK-22
must_haves:
  truths:
    - "Vendedor can click any pipeline status card on Meu Pipeline and land on Leads filtered to that status"
    - "Vendedor can click the top stats cards (Total Leads, Valor Emendas, Comissão, Taxa Fechamento) and land on Leads pre-filtered"
    - "Leads page reads the status_contato URL param on mount and pre-populates the status filter dropdown"
  artifacts:
    - path: "web/src/app/page.tsx"
      provides: "Clickable top stats cards for vendedor + pipeline status cards already clickable"
    - path: "web/src/app/leads/page.tsx"
      provides: "useSearchParams hook pre-populates statusFilter state from URL on mount"
  key_links:
    - from: "web/src/app/page.tsx"
      to: "/leads?status_contato=..."
      via: "window.location.href on onClick"
      pattern: "onClick.*leads.*status_contato"
    - from: "web/src/app/leads/page.tsx"
      to: "statusFilter state"
      via: "useSearchParams on mount"
      pattern: "useSearchParams.*status_contato"
---

<objective>
Make the quadrantes (stat cards + pipeline funnel cards) on the MEU PIPELINE view clickable, navigating to /leads pre-filtered by the relevant status. Also fix the leads page to actually read the URL param on mount so the filter takes effect.

Purpose: Vendedores need one-click navigation from dashboard overview to the specific subset of leads they want to work on.
Output: Clickable dashboard cards + URL-param-aware leads page.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/page.tsx
@web/src/app/leads/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make leads page read status_contato from URL params on mount</name>
  <files>web/src/app/leads/page.tsx</files>
  <action>
    Add `useSearchParams` from `next/navigation` to the imports at the top of the file.

    Inside the component, add:
    ```
    const searchParams = useSearchParams()
    ```

    Change the `statusFilter` useState initialization to read from URL:
    ```
    const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status_contato') || '')
    ```

    This ensures when the page loads with `/leads?status_contato=Proposta`, the filter dropdown starts pre-populated with 'Proposta' and the API call is made immediately with that filter.

    NOTE: `useSearchParams` requires the component to be wrapped in a Suspense boundary or the page itself uses it — in Next.js 14 App Router with 'use client', this is fine directly in the component. No Suspense wrapper needed since the whole file is already 'use client'.

    Do NOT change any other logic. The `fetchLeads` callback already uses `statusFilter` as a dependency, so it will fire correctly on mount with the pre-populated value.
  </action>
  <verify>
    Navigate to `http://localhost:3000/leads?status_contato=Proposta` — the status dropdown should show "Proposta" selected and the table should show only Proposta leads without manual interaction.
  </verify>
  <done>URL param status_contato pre-populates the filter on page load; all other filter behavior unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Make top stats cards clickable for vendedor view in Meu Pipeline</name>
  <files>web/src/app/page.tsx</files>
  <action>
    In the "Global stats cards" section (section 2, around line 170), the cards currently have no click behavior. Add `onClick` and cursor-pointer + hover styles to the cards that are meaningful for vendedores.

    For the **"Total Leads"** card (shown to all roles): wrap or add onClick to navigate to `/leads` (no filter — shows all their leads).

    For the **"Valor em Emendas"** card (shown to all roles): wrap or add onClick to navigate to `/leads` (shows all leads sorted by valor — no specific filter needed, just navigate to /leads).

    For the **vendedor-only "Comissão Vendas"** card: onClick navigates to `/comissoes` (the commissions page).

    For the **vendedor-only "Taxa Fechamento"** card: onClick navigates to `/leads?status_contato=Fechado`.

    Implementation pattern — add `role="button"`, `onClick`, and hover classes to each card div:
    ```tsx
    <div
      role="button"
      onClick={() => { window.location.href = '/leads' }}
      className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
    >
    ```

    The pipeline funnel cards in STATUS_ORDER.map already have onClick to `/leads?status_contato=${status}` — verify they work for vendedor too (they do, since the `isVendedor` check only affects visual content inside the card, not the click handler). No change needed for those cards.

    Also add a small arrow icon or "→" hint to the "Total Leads" and "Valor em Emendas" cards to signal they are clickable. Keep the visual change minimal — just `hover:shadow-md` and `cursor-pointer` are sufficient signals alongside the role="button".

    For the **gestor-only** "Atribuidos" and "Nao Atribuidos" cards: add onClick to `/leads` and `/leads` respectively (gestor can also benefit). These are wrapped in `{!isVendedor && ...}` already.
  </action>
  <verify>
    In vendedor session: click "Total Leads" card → /leads opens. Click "Taxa Fechamento" card → /leads?status_contato=Fechado opens with Fechado leads pre-filtered. Click "Comissão Vendas" card → /comissoes opens. Click any pipeline status card (e.g. "Proposta") → /leads?status_contato=Proposta opens with Proposta leads.
  </verify>
  <done>All quadrantes in Meu Pipeline are clickable and navigate to the correct filtered view. Pipeline cards navigate with status filter; top stat cards navigate to relevant pages. Leads page pre-populates filter from URL param.</done>
</task>

</tasks>

<verification>
1. Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — no TypeScript errors.
2. Log in as a vendedor, visit the home page (Meu Pipeline), click each pipeline status card — verify /leads opens with the correct status pre-filtered.
3. Click "Total Leads" top card — /leads opens showing all leads.
4. Click "Taxa Fechamento" top card — /leads opens filtered to Fechado.
5. Click "Comissão Vendas" card — /comissoes opens.
</verification>

<success_criteria>
All quadrantes (top stat cards + pipeline funnel cards) in the MEU PIPELINE view are clickable. Clicking a status card navigates to /leads with the status pre-selected in the filter dropdown and the table pre-filtered — no extra click required.
</success_criteria>

<output>
After completion, create `.planning/quick/22-quadrantes-clic-veis-no-ambiente-meu-pip/22-SUMMARY.md`
</output>
