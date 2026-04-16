---
phase: quick
plan: 260416-fep
type: execute
wave: 1
depends_on: []
files_modified:
  - migrations/add_tgov_interactions_vencimento.sql
  - web/src/app/api/tgov/interaction/[key]/route.ts
  - web/src/app/api/tgov/aprovacao/route.ts
  - web/src/app/tgov/TGovDashboardClient.tsx
  - web/src/lib/tgov.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Aprovacao sidecard CRM Interno section shows a date picker for Vencimento instead of status pill buttons"
    - "User can click the date picker and select a vencimento date which persists on save"
    - "Aprovacao table column shows Vencimento date and Vencida/Em tempo badge instead of Situacao column"
    - "Execucao tab CRM Interno section still shows status pill buttons as before (no change)"
  artifacts:
    - path: "migrations/add_tgov_interactions_vencimento.sql"
      provides: "vencimento DATE column on tgov_interactions"
      contains: "ALTER TABLE tgov_interactions"
    - path: "web/src/app/api/tgov/interaction/[key]/route.ts"
      provides: "GET/PATCH support for vencimento field"
    - path: "web/src/app/tgov/TGovDashboardClient.tsx"
      provides: "Date picker in aprovacao CRM Interno, Vencimento column in table"
  key_links:
    - from: "TGovDashboardClient.tsx TGovInteractionPanel"
      to: "/api/tgov/interaction/[key]"
      via: "fetch PATCH with vencimento field"
    - from: "/api/tgov/aprovacao"
      to: "tgov_interactions.vencimento"
      via: "LEFT JOIN to include vencimento in table response"
---

<objective>
Replace the "Situacao" (status pills) field in the CRM Interno section of TGov Aprovacao sidecards with a "Vencimento" date picker. The selected date determines if a proposal is expired (vencida) or not. The Aprovacao table column that currently shows Situacao should show the Vencimento date with a Vencida/Em tempo badge instead.

Purpose: Allow users to track proposal expiry dates in the TGOV Aprovacao workflow
Output: Working date picker in sidecard + vencimento column in aprovacao table
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/app/api/tgov/interaction/[key]/route.ts
@web/src/app/api/tgov/aprovacao/route.ts
@web/src/app/tgov/TGovDashboardClient.tsx
@web/src/lib/tgov.ts
@migrations/create_tgov_interactions.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add vencimento column to tgov_interactions and update API</name>
  <files>
    migrations/add_tgov_interactions_vencimento.sql
    web/src/app/api/tgov/interaction/[key]/route.ts
    web/src/app/api/tgov/aprovacao/route.ts
    web/src/lib/tgov.ts
  </files>
  <action>
    1. Create migration `migrations/add_tgov_interactions_vencimento.sql`:
       ```sql
       ALTER TABLE tgov_interactions ADD COLUMN IF NOT EXISTS vencimento DATE;
       ```

    2. Update `/api/tgov/interaction/[key]/route.ts`:
       - GET: Add `vencimento::text` to the SELECT query. Return `vencimento` in JSON response.
       - PATCH: Accept `vencimento` (string ISO date or null) in request body. Add `vencimento` to both INSERT and ON CONFLICT UPDATE. Validate that if provided, it's a valid date string. Return `vencimento` in response.

    3. Update `/api/tgov/aprovacao/route.ts`:
       - In the main table data query (the big SELECT at ~line 211), add a LEFT JOIN on `tgov_interactions` (already joined as `ti` at line 234) to also select `ti.vencimento::text AS vencimento`.
       - Note: the LEFT JOIN `tgov_interactions ti ON ti.item_key = p.nr_proposta AND ti.tab = 'aprovacao'` already exists at line 234. Just add `ti.vencimento::text` to the SELECT list.
       - Include `vencimento` in the response row mapping (around line 324-348). Add field: `vencimento: r.vencimento ?? null`

    4. Update `web/src/lib/tgov.ts`:
       - Add `vencimento?: string | null` to `TGovAprovacaoTableRow` interface (after commentCount field, ~line 134).
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>tgov_interactions has vencimento column, API reads/writes it, aprovacao route returns it in table rows, TypeScript compiles</done>
</task>

<task type="auto">
  <name>Task 2: Replace Situacao with Vencimento date picker in Aprovacao UI</name>
  <files>
    web/src/app/tgov/TGovDashboardClient.tsx
  </files>
  <action>
    1. **TGovInteractionPanel** (~line 114): When `tab === 'aprovacao'`, replace the status pill buttons section with a date picker for "Vencimento":
       - Add state: `const [vencimento, setVencimento] = useState<string>('')`
       - In the useEffect load function, also set `setVencimento(data.vencimento ?? '')`
       - When `tab === 'aprovacao'`: render a `<input type="date">` labeled "Vencimento" instead of the status pills. Style with the same Tailwind pattern as the obs textarea (border border-gray-200 rounded-lg px-3 py-2 text-sm). Below the date, if vencimento is set, show a badge: if date is in the past show red "Vencida" badge, if in the future show green "Em tempo" badge.
       - In `handleSave`, when `tab === 'aprovacao'`, send `vencimento` (or null if empty) instead of `status`. Keep sending `obs` as before.
       - When `tab !== 'aprovacao'` (i.e. execucao), keep the existing status pill buttons behavior unchanged.
       - The status pill buttons should still show for execucao tab, nothing changes there.

    2. **AprovacaoTable** (~line 1167): Replace the "Situacao" column with "Vencimento":
       - Change the `<SortableTh label="Situacao" col="situacao" ...>` at line 1196 to `<SortableTh label="Vencimento" col="vencimento" ...>`.
       - Replace `<td ...><SituacaoBadge situacao={row.situacao} /></td>` at line 1236 with a td that shows: the formatted vencimento date (DD/MM/YYYY) plus a small colored badge — red "Vencida" if date < today, green "Em tempo" if date >= today, gray dash if no vencimento set.

    3. **AprovacaoSidecard** (~line 1614): Replace `<SituacaoBadge situacao={row.situacao} />` at line 1664 with a vencimento display: if `row.vencimento` exists, show formatted date + Vencida/Em tempo badge (same logic as table). If null, show "Sem vencimento" in gray.

    Helper function for vencimento badge (create near top of file or inline):
    ```tsx
    function VencimentoBadge({ vencimento }: { vencimento: string | null | undefined }) {
      if (!vencimento) return <span className="text-xs text-gray-400">—</span>
      const today = new Date(); today.setHours(0,0,0,0)
      const vDate = new Date(vencimento + 'T00:00:00'); // parse as local
      const isVencida = vDate < today
      const formatted = vDate.toLocaleDateString('pt-BR')
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-xs text-gray-600">{formatted}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isVencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {isVencida ? 'Vencida' : 'Em tempo'}
          </span>
        </span>
      )
    }
    ```
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Open /tgov, go to Aprovacao tab. Click a row — sidecard CRM Interno section should show date picker instead of status pills. Select a date, save, reload — date persists. Table column shows Vencimento with badge.</manual>
  </verify>
  <done>Aprovacao sidecard shows date picker for Vencimento instead of status pills. Table shows Vencimento column with Vencida/Em tempo badge. Execucao tab unchanged.</done>
</task>

</tasks>

<verification>
1. `cd web && npx tsc --noEmit` — no type errors
2. Open /tgov Aprovacao tab — table shows "Vencimento" column instead of "Situacao"
3. Click a row — sidecard CRM Interno shows date picker, not status pills
4. Select a date, click Salvar — date persists on reload
5. Past dates show red "Vencida" badge, future dates show green "Em tempo"
6. Switch to Execucao tab — CRM Interno still shows status pills (unchanged)
</verification>

<success_criteria>
- Aprovacao table: Vencimento column with date + colored badge replaces Situacao column
- Aprovacao sidecard CRM Interno: date picker replaces status pill buttons
- Vencimento persists via /api/tgov/interaction/[key] PATCH
- Execucao tab behavior completely unchanged
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260416-fep-tgov-aprovacao-campo-vencimento-calendar/260416-fep-SUMMARY.md`
</output>
