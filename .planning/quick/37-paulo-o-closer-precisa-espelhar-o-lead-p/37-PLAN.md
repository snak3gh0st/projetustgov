---
phase: quick-37
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/leads/page.tsx
autonomous: true
requirements: [QUICK-37]

must_haves:
  truths:
    - "Paulo (gestor_vendedor) sees SDR leads with status 'Aguardando Closer' in his /leads list"
    - "Paulo can identify WHICH SDR sent each mirrored lead via a visible vendedor column"
    - "Mirrored leads (closer_id = Paulo, status = Aguardando Closer) have a visual badge distinguishing them from Paulo's own leads"
    - "Paulo's dashboard pipeline count for 'Aguardando Closer' matches what he sees in /leads"
  artifacts:
    - path: "web/src/app/leads/page.tsx"
      provides: "Leads list with SDR column visible for gestor_vendedor + mirrored lead badge"
      contains: "gestor_vendedor"
  key_links:
    - from: "web/src/app/leads/page.tsx"
      to: "/api/leads"
      via: "fetch with no extra params (gestor_vendedor filter is server-side)"
      pattern: "fetch.*api/leads"
---

<objective>
Surface mirrored SDR leads properly for Paulo (closer, role = gestor_vendedor) in the leads list.

Purpose: When an SDR marks a lead "Aguardando Closer", the backend already sets closer_id = Paulo and the API already returns those leads to him. The gap is purely in the UI: the leads page hides the vendedor (SDR) column from gestor_vendedor, so Paulo cannot tell who sent the lead or visually distinguish his own leads from mirrored ones.

Output: Leads page updated so Paulo sees the SDR name + a "CLOSER" badge on mirrored leads.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/leads/page.tsx
@web/src/app/api/leads/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Show SDR column and mirrored-lead badge for gestor_vendedor in leads list</name>
  <files>web/src/app/leads/page.tsx</files>
  <action>
In `web/src/app/leads/page.tsx`, make the following changes:

1. **Page subtitle** (line ~282): Change the ternary so gestor_vendedor gets a specific label:
   ```tsx
   {sessionUser?.role === 'vendedor'
     ? 'Seus leads atribuídos'
     : sessionUser?.role === 'gestor_vendedor'
     ? 'Seus leads + leads aguardando seu fechamento'
     : 'Todos os projetos dos vendedores'}
   ```

2. **Table header** — add "SDR" column header visible to gestor_vendedor (same block as gestor, line ~332):
   Change the condition `sessionUser?.role === 'gestor'` to `sessionUser?.role === 'gestor' || sessionUser?.role === 'gestor_vendedor'` on the `<th>` for the vendedor column. Rename the column label from "Vendedor" to "SDR" when role is gestor_vendedor:
   ```tsx
   {(sessionUser?.role === 'gestor' || sessionUser?.role === 'gestor_vendedor') && (
     <th onClick={() => handleSort('vendedor')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">
       {sessionUser?.role === 'gestor_vendedor' ? 'SDR' : 'Vendedor'}
       <SortIcon col="vendedor" />
     </th>
   )}
   ```

3. **Table body row** — show vendor cell for gestor_vendedor too (line ~461). Change the condition on the `<td>` that shows vendedor_nome from `sessionUser?.role === 'gestor'` to `sessionUser?.role === 'gestor' || sessionUser?.role === 'gestor_vendedor'`.

   For gestor_vendedor, show a simpler cell (no assignment button, just the SDR name + a purple "CLOSER" badge when the lead has closer_id set and status is "Aguardando Closer"):
   ```tsx
   {(sessionUser?.role === 'gestor' || sessionUser?.role === 'gestor_vendedor') && (
     <td className="px-4 py-3">
       {sessionUser?.role === 'gestor' ? (
         // existing gestor cell with assignment button (unchanged)
         <div className="flex items-center gap-2">
           <span className="text-xs text-gray-500">{lead.vendedor_nome || '-'}</span>
           <button
             onClick={(e) => {
               e.stopPropagation()
               setAssignmentModal({
                 cnpj: lead.cnpj,
                 nome: lead.nome,
                 currentVendedor: lead.vendedor_nome || null
               })
             }}
             className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-[#0072F7] transition-colors"
           >
             {lead.vendedor_nome ? '↻' : '+'}
           </button>
         </div>
       ) : (
         // gestor_vendedor: show SDR name + CLOSER badge for mirrored leads
         <div className="flex items-center gap-1.5">
           <span className="text-xs text-gray-500">{lead.vendedor_nome || '-'}</span>
           {lead.closer_id && lead.status_contato === 'Aguardando Closer' && (
             <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200 font-semibold">
               CLOSER
             </span>
           )}
         </div>
       )}
     </td>
   )}
   ```

4. **colSpan fix** in cascade sub-rows (line ~506): The sub-row uses `colSpan={sessionUser?.role === 'gestor' ? 5 : 4}`. Update to `colSpan={sessionUser?.role === 'gestor' || sessionUser?.role === 'gestor_vendedor' ? 5 : 4}`.
  </action>
  <verify>
    1. Log in as Paulo (paulo@projetus.org, role gestor_vendedor).
    2. Navigate to /leads.
    3. Confirm subtitle reads "Seus leads + leads aguardando seu fechamento".
    4. Confirm a "SDR" column is visible in the table header.
    5. For any lead with status "Aguardando Closer", confirm the SDR name is shown and a purple "CLOSER" badge appears.
    6. For Paulo's own leads (not "Aguardando Closer"), confirm just the SDR name shows (no badge).
    7. Run `npm run build` in web/ — no TypeScript errors.
  </verify>
  <done>
    Paulo sees mirrored SDR leads in his list with the SDR's name and a "CLOSER" badge, visually distinguishing them from his own direct leads. No assignment button is shown (he can't reassign SDR leads). Build passes with no errors.
  </done>
</task>

</tasks>

<verification>
- `npm run build` in web/ passes with no errors
- gestor_vendedor role: leads page shows "SDR" column header
- "Aguardando Closer" leads show vendedor_nome (SDR name) + "CLOSER" badge
- gestor role: leads page unchanged (still shows "Vendedor" column with assignment button)
- vendedor role: leads page unchanged (no SDR/Vendedor column)
</verification>

<success_criteria>
Paulo can open /leads, see the SDR column, and for any "Aguardando Closer" lead instantly know which SDR sent it (vendedor_nome) and that he is the assigned closer (CLOSER badge). The backend already surfaces these leads to him — this fix makes them legible.
</success_criteria>

<output>
After completion, create `.planning/quick/37-paulo-o-closer-precisa-espelhar-o-lead-p/37-SUMMARY.md`
</output>
