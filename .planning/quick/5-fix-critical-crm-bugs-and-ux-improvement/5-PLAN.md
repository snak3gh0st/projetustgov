---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/leads/page.tsx
  - web/src/app/lead/[cnpj]/page.tsx
  - web/src/components/LeadSlideOver.tsx
  - web/src/app/api/leads/[cnpj]/route.ts
  - web/src/app/page.tsx
autonomous: false
must_haves:
  truths:
    - "Lead detail page (/lead/[cnpj]) loads without errors"
    - "Clicking a lead row in leads table opens slide-over without error"
    - "Leads tab shows 'Atribuir' button only for unassigned leads (not infinite loading for assigned ones)"
    - "Vendedor view shows 'detalhes' field (observacoes) in slide-over and detail page"
    - "Setting status to 'Fechado' shows sale value input field for commission calculation"
    - "Truncated columns in leads table show full content on hover or have adequate min-width"
    - "Max priority leads show subtle red highlight on entire row instead of just a red dot"
    - "Ministerio (orgao_concedente) column displays correctly in leads table"
    - "Pipeline vendedor view separates commission line from closing fee (R$50)"
  artifacts:
    - path: "web/src/app/leads/page.tsx"
      provides: "Fixed leads table with UX improvements"
    - path: "web/src/app/lead/[cnpj]/page.tsx"
      provides: "Fixed lead detail page"
    - path: "web/src/components/LeadSlideOver.tsx"
      provides: "Fixed slide-over with detalhes field"
    - path: "web/src/app/api/leads/[cnpj]/route.ts"
      provides: "PATCH endpoint supporting valor_venda field"
    - path: "web/src/app/page.tsx"
      provides: "Pipeline with separated commission/closing fee"
  key_links:
    - from: "web/src/app/leads/page.tsx"
      to: "web/src/components/LeadSlideOver.tsx"
      via: "selectedLead state"
      pattern: "setSelectedLead"
    - from: "web/src/app/leads/page.tsx"
      to: "/api/leads/[cnpj]"
      via: "PATCH for status and valor_venda"
      pattern: "fetch.*api/leads"
---

<objective>
Fix critical CRM bugs affecting both admin (gestor) and vendedor views, plus UX improvements for the leads table and pipeline.

Purpose: Users are hitting errors on lead detail pages, seeing infinite "Atribuir" loading states, missing fields, and truncated content. These bugs block daily CRM usage.
Output: Working leads table, lead detail page, slide-over, and pipeline with all reported issues resolved.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@web/src/app/leads/page.tsx
@web/src/app/lead/[cnpj]/page.tsx
@web/src/components/LeadSlideOver.tsx
@web/src/app/api/leads/[cnpj]/route.ts
@web/src/app/page.tsx
@web/src/lib/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix lead detail page error, leads table bugs, and column readability</name>
  <files>
    web/src/app/lead/[cnpj]/page.tsx
    web/src/app/leads/page.tsx
    web/src/components/LeadSlideOver.tsx
  </files>
  <action>
**Lead detail page (`lead/[cnpj]/page.tsx`):**
- The `updateContact` function references `first` which is defined AFTER the early returns (line 103) but used inside the function defined at line 72. This causes a runtime error when `first` is not yet available. Fix by moving `updateContact` definition AFTER `const first = projetos[0]` (line 103), or by using `projetos[0]` directly inside the function.
- This is the "Ao clicar no detalhamento do lead da erro" bug.

**Leads table (`leads/page.tsx`):**
- The "Atribuir" button shows for ALL leads when user is gestor, even already-assigned ones. The button text always says "Atribuir" with no indication the lead is already assigned. Fix: show "Reatribuir" when `lead.vendedor_nome` exists, and show the vendedor name next to the button. This fixes the "Aba leads com atribuir infinito" perception.
- **Red dot to row highlight UX change:** Replace the small `w-2 h-2 rounded-full bg-red-500 animate-pulse` dot (line 205-209) with a subtle red background highlight on the entire `<tr>`. Apply `bg-red-500/10 border-l-2 border-l-red-500` class to the row when `lead.is_max_priority` is true. Remove the separate `<td>` column for the dot entirely (and the corresponding `<th>`).
- **Truncated columns fix:** The `truncate max-w-[180px]` and `max-w-[140px]` classes cut content. Add `title={value}` attributes to truncated cells so hovering reveals full content. Specifically for: Nome (line 217), Parlamentar (line 231), Ministerio (line 247), Municipio (line 249). Also increase Nome max-w to `max-w-[250px]` and Ministerio to `max-w-[180px]`.
- **Ministerio not readable:** The `orgao_concedente` column IS present (line 247) but may be truncated. The title tooltip fix above addresses this. Also ensure it's not hidden on small screens.

**Slide-over (`LeadSlideOver.tsx`):**
- Add "Detalhes" (observacoes) section that is always visible and editable when `canModify=true`, not just when `lead.observacoes` has content (currently line 256 only shows if truthy). Make the section always render with an editable textarea when canModify is true.
  </action>
  <verify>
    - `cd web && npx next build` completes without TypeScript errors
    - No runtime errors: the `first` variable reference in lead detail page is properly scoped
  </verify>
  <done>
    - Lead detail page loads without error when clicking any lead
    - Leads table shows "Reatribuir" for assigned leads, "Atribuir" for unassigned
    - Max priority leads have subtle red row highlight instead of dot
    - Truncated columns show full content on hover via title attribute
    - Observacoes/detalhes field is always visible and editable in slide-over
  </done>
</task>

<task type="auto">
  <name>Task 2: Add sale value input on "Fechado" status and separate commission/closing fee in pipeline</name>
  <files>
    web/src/app/leads/page.tsx
    web/src/app/lead/[cnpj]/page.tsx
    web/src/components/LeadSlideOver.tsx
    web/src/app/api/leads/[cnpj]/route.ts
    web/src/app/page.tsx
    web/src/lib/types.ts
  </files>
  <action>
**Sale value input on "Fechado" status:**
- Add `valor_venda` field to `VendedorProjeto` type in `types.ts` (nullable number).
- In the PATCH API route (`api/leads/[cnpj]/route.ts`), add support for `valor_venda` field update (same pattern as other fields, line 29-44).
- In leads table (`leads/page.tsx`): When a lead's status_contato is changed to "Fechado" via the select dropdown, show an inline input field (or modal prompt) asking for `valor_venda` (sale value in R$). Use a simple `window.prompt('Valor da venda (R$):')` approach - if the user enters a value, send both `status_contato: 'Fechado'` and `valor_venda: parsedNumber` in the PATCH. If cancelled, still update status without valor_venda.
- In lead detail page: Same behavior - when status select changes to "Fechado", prompt for valor_venda.
- In slide-over: When lead status is "Fechado", show the valor_venda if it exists, along with commission info.

**Pipeline vendedor view separation (`page.tsx` - dashboard):**
- In the vendedor pipeline view (isVendedor=true), currently shows a single "Comissao Total" card. Split into two separate displays:
  1. "Comissao Vendas" - the commission percentage on valor_venda (existing comissao_valor)
  2. "Taxa Fechamento" - show count of "Fechado" leads times R$50 (a fixed fee per closed deal)
- In the status pipeline bar, add annotation below "Fechado" count showing the closing fee subtotal: `{fechadoCount} x R$50 = R${fechadoCount * 50}`.
- The API already returns `fechado` count per vendedor, so this is purely frontend calculation.
  </action>
  <verify>
    - `cd web && npx next build` compiles without errors
    - The `valor_venda` field is accepted by the PATCH endpoint
  </verify>
  <done>
    - Changing status to "Fechado" prompts for sale value input
    - Vendedor pipeline shows commission and closing fee (R$50/deal) separately
    - valor_venda is persisted via API when provided
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Fixed all critical CRM bugs: lead detail page errors, leads table "Atribuir" infinite state, red row highlight UX, truncated columns, missing detalhes field, sale value on Fechado, and separated commission/closing fee in pipeline.</what-built>
  <how-to-verify>
    1. **Admin view - Leads tab:** Open /leads as gestor. Verify:
       - Assigned leads show "Reatribuir" (not "Atribuir")
       - Max priority leads have red row highlight (not just a dot)
       - Hover over truncated columns to see full content
       - Ministerio column is readable
    2. **Lead detail:** Click any lead row to open slide-over, then click "Ver Detalhes". Verify no error occurs.
    3. **Detalhes field:** In slide-over, verify "Observacoes" section is visible and editable even when empty.
    4. **Fechado + valor_venda:** Change a lead status to "Fechado" - verify it prompts for sale value.
    5. **Vendedor pipeline:** Log in as vendedor, check dashboard shows commission and closing fee (R$50) separately.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues to fix</resume-signal>
</task>

</tasks>

<verification>
- `cd /Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web && npx next build` succeeds
- No TypeScript errors in modified files
- Lead detail page loads without runtime errors
</verification>

<success_criteria>
- All 11 reported issues (6 admin + 5 vendedor) are addressed
- No new TypeScript or runtime errors introduced
- UX improvements match user descriptions
</success_criteria>

<output>
After completion, create `.planning/quick/5-fix-critical-crm-bugs-and-ux-improvement/5-SUMMARY.md`
</output>
