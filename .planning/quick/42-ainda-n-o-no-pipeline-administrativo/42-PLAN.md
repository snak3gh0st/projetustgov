---
phase: quick-42
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/dashboard-crm/route.ts
  - web/src/app/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Gestor pipeline funnel shows AINDA NÃO as a distinct status card with count"
    - "AINDA NÃO count in by_status reflects leads with status_contato = 'AINDA NÃO' in DB"
    - "Vendedor pipeline also shows AINDA NÃO card if any of their leads have that status"
  artifacts:
    - path: "web/src/app/api/dashboard-crm/route.ts"
      provides: "status_ainda_nao count in SQL + by_status response"
      contains: "status_contato = 'AINDA NÃO'"
    - path: "web/src/app/page.tsx"
      provides: "AINDA NÃO in STATUS_ORDER pipeline funnel"
      contains: "'AINDA NÃO'"
  key_links:
    - from: "web/src/app/api/dashboard-crm/route.ts"
      to: "by_status['AINDA NÃO']"
      via: "status_ainda_nao SQL COUNT"
      pattern: "status_contato = 'AINDA NÃO'"
    - from: "web/src/app/page.tsx"
      to: "STATUS_ORDER"
      via: "array element 'AINDA NÃO'"
      pattern: "AINDA NÃO"
---

<objective>
Add "AINDA NÃO" as a visible stage in the administrative pipeline funnel on the CRM dashboard.

Purpose: Leads with status "AINDA NÃO" (rose color, distinct from orange "Não Contatado") are invisible in the pipeline because the API does not return their count and STATUS_ORDER does not include the status. Gestor and vendedores cannot see how many leads are in this state.

Output: Dashboard pipeline shows AINDA NÃO card with correct count between "Não Contatado" and "Retorno".
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add AINDA NÃO count to dashboard-crm API</name>
  <files>web/src/app/api/dashboard-crm/route.ts</files>
  <action>
    In the global stats SQL query (query #1), add a new CASE for AINDA NÃO:

    ```sql
    COUNT(DISTINCT CASE WHEN status_contato = 'AINDA NÃO' THEN cnpj END)::int as status_ainda_nao,
    ```

    Place it between status_nao_contatado and status_retorno lines.

    In the JSON response's `by_status` object, add:
    ```ts
    'AINDA NÃO': Number(g.status_ainda_nao) || 0,
    ```

    Also update the StatusCounts TypeScript interface in page.tsx to include `'AINDA NÃO'?: number` — but this is already covered by the `[key: string]: number | undefined` index signature, so no change needed there.

    Important: Do NOT merge "AINDA NÃO" into the "Não Contatado" bucket. They are distinct statuses with different colors (orange vs rose).
  </action>
  <verify>
    curl (or browser dev tools) GET /api/dashboard-crm → response.global.by_status should contain key 'AINDA NÃO' with a number value (0 if no leads have that status).
  </verify>
  <done>API returns by_status with 'AINDA NÃO' key alongside other statuses.</done>
</task>

<task type="auto">
  <name>Task 2: Add AINDA NÃO to STATUS_ORDER in pipeline funnel UI</name>
  <files>web/src/app/page.tsx</files>
  <action>
    Change STATUS_ORDER from:
    ```ts
    const STATUS_ORDER = ['Não Contatado', 'Retorno', 'Proposta', 'Aguardando Closer', 'Fechado'] as const
    ```
    To:
    ```ts
    const STATUS_ORDER = ['Não Contatado', 'AINDA NÃO', 'Retorno', 'Proposta', 'Aguardando Closer', 'Fechado'] as const
    ```

    "AINDA NÃO" goes between "Não Contatado" and "Retorno" — it represents leads that were contacted but didn't answer (still early stage, before "Retorno" which implies active follow-up engagement).

    The STATUS_CONFIG entry for 'AINDA NÃO' already exists with rose color scheme:
    ```ts
    'AINDA NÃO': { color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', bar: 'bg-rose-500', label: 'AINDA NÃO' },
    ```

    No other changes needed in the UI — the pipeline map over STATUS_ORDER will automatically render the new card using existing STATUS_CONFIG.

    Also update the grid layout for the pipeline funnel to accommodate 6 columns. Change:
    ```tsx
    className="grid grid-cols-2 md:grid-cols-5 gap-3"
    ```
    To:
    ```tsx
    className="grid grid-cols-2 md:grid-cols-6 gap-3"
    ```

    Similarly update the flow bar grid if it uses a fixed columns class (check the hidden md:flex bar — it uses flex so no change needed there).
  </action>
  <verify>
    npm run build (in web/) passes with no type errors. Load the dashboard — pipeline funnel shows 6 cards: Não Contatado, AINDA NÃO (rose), Retorno, Proposta, Aguardando Closer, Fechado.
  </verify>
  <done>Pipeline funnel renders AINDA NÃO card in rose color scheme with correct lead count from API.</done>
</task>

</tasks>

<verification>
1. `cd web && npm run build` — no TypeScript or build errors
2. Dashboard at / shows pipeline with AINDA NÃO card in rose color between Não Contatado and Retorno
3. Clicking AINDA NÃO card navigates to /leads?status_contato=AINDA%20N%C3%83O (the existing onClick handler handles this automatically)
4. Count on card matches actual leads with status_contato = 'AINDA NÃO' in DB
</verification>

<success_criteria>
- AINDA NÃO appears as 3rd stage in the 6-card pipeline funnel
- Card uses rose color scheme (text-rose-600, bg-rose-50, bg-rose-500 bar)
- Count reflects actual DB records with status_contato = 'AINDA NÃO'
- No build errors, no regressions to other pipeline stages
</success_criteria>

<output>
After completion, create `.planning/quick/42-ainda-n-o-no-pipeline-administrativo/42-SUMMARY.md` with what was changed, files modified, and outcome.
</output>
