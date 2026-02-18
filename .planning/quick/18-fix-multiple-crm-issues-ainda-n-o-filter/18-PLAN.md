---
phase: quick-18
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/leads/page.tsx
  - web/src/app/page.tsx
  - web/src/app/comissoes/page.tsx
  - web/src/components/ContactNotesTimeline.tsx
  - web/src/app/api/leads/[cnpj]/notes/route.ts
  - web/src/app/api/monitorar-cnpj/route.ts
  - web/src/app/distribuir/page.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Não Contatado status has a visually distinct color from Retorno in filter dropdown and per-row badge"
    - "Commission tab percentages are computed against only 'Não Contatado' leads, not total pipeline"
    - "Cascade parent row shows the sum of only its sub-rows' individual emenda values, not double-counted"
    - "Gestor can add a CNPJ directly to Paulo Gabriel's pipeline from the distribuir page"
    - "Pipeline quadrant cards on MEU PIPELINE are clickable and navigate to /leads filtered by that status"
    - "User can edit an existing contact note (tipo + observacao) in ContactNotesTimeline"
  artifacts:
    - path: "web/src/app/leads/page.tsx"
      provides: "Status colors with distinct AINDA NAO/Não Contatado styling"
    - path: "web/src/app/page.tsx"
      provides: "Clickable pipeline quadrant cards with navigation"
    - path: "web/src/app/comissoes/page.tsx"
      provides: "Percentages based on Não Contatado count only"
    - path: "web/src/components/ContactNotesTimeline.tsx"
      provides: "Edit mode for existing contact notes"
    - path: "web/src/app/api/leads/[cnpj]/notes/route.ts"
      provides: "PATCH endpoint to update a contact note"
    - path: "web/src/app/api/monitorar-cnpj/route.ts"
      provides: "POST endpoint to add CNPJ directly to Paulo's pipeline"
  key_links:
    - from: "web/src/app/page.tsx STATUS cards"
      to: "/leads?status_contato={status}"
      via: "onClick router.push or window.location.href"
    - from: "ContactNotesTimeline edit button"
      to: "/api/leads/[cnpj]/notes PATCH"
      via: "fetch PATCH with note id + updated fields"
    - from: "distribuir page CNPJ form"
      to: "/api/monitorar-cnpj POST"
      via: "fetch POST with cnpj + assign to Paulo's user id"
---

<objective>
Fix 6 CRM issues: distinct color for "Não Contatado" status, commission percentages calculated against pipeline-only leads, cascade value double-counting, gestor CNPJ direct-to-Paulo assignment, clickable pipeline quadrant cards, and editable contact notes.

Purpose: Polish core CRM workflows to match user expectations after rapid feature development.
Output: Updated pages/components/API routes with all 6 issues resolved.
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
  <name>Task 1: Fix status colors + cascade double-counting + clickable pipeline cards</name>
  <files>
    web/src/app/leads/page.tsx
    web/src/app/page.tsx
    web/src/app/comissoes/page.tsx
  </files>
  <action>
**Fix 1 — Distinct "Não Contatado" color in leads/page.tsx:**
In the `STATUS_COLORS` record (line 11), change `'Não Contatado'` from `'bg-red-50 text-red-500'` to `'bg-orange-50 text-orange-600'` so it stands out visually from the error-red used elsewhere. This applies to the filter dropdown options AND the per-row status badge select.

**Fix 2 — Cascade double-counting in leads/page.tsx:**
The parent row value display (line 394) currently uses `total_valor_emendas || valor_emenda`. The bug: `total_valor_emendas` may already include the sum while `valor_emenda` on the parent is also the top emenda's individual value, causing double presentation confusion. The correct behavior: parent row should show the SUM of all sub-lead `valor_emenda` values computed client-side from `subLeads`. Replace the value expression in the parent `<td>` (around line 394) with:
```tsx
{formatCompactCurrency(
  hasMultipleEmendas
    ? lead.subLeads.reduce((sum, sub) => sum + (Number(sub.valor_emenda) || 0), 0)
    : Number(lead.valor_emenda) || 0
)}
```
Remove the `total_valor_emendas` reference entirely in this display. Also update the sort case for `'valor'` (around line 132) to use the same sum: `va = lead.subLeads ? lead.subLeads.reduce((s, sub) => s + (Number(sub.valor_emenda) || 0), 0) : Number(a.valor_emenda) || 0`.

**Fix 3 — Clickable pipeline quadrant cards in page.tsx:**
In the `STATUS_ORDER.map(...)` section (around line 229), the `<div>` cards currently have `hover:shadow-md transition-shadow` but no click handler. Add `cursor-pointer` class and an `onClick` that navigates to the leads page filtered by that status:
```tsx
onClick={() => { window.location.href = `/leads?status_contato=${encodeURIComponent(status)}` }}
```
Add this to the outer card `<div>`. Also add `role="button"` for accessibility.

**Fix 4 — Commission percentages in page.tsx (MEU PIPELINE pipeline section):**
The variable `totalForPipeline` (line 150) is computed as the sum of ALL statuses including Fechado. This makes the percentage bar of "Não Contatado" appear small even when most leads are uncontacted. Change the denominator to use only "Não Contatado" + "Retorno" + "Proposta" + "Aguardando Closer" (i.e., active pipeline leads only, excluding Fechado):
```tsx
const totalForPipeline = (
  (g.by_status['Não Contatado'] || 0) +
  (g.by_status['Retorno'] || 0) +
  (g.by_status['Proposta'] || 0) +
  (g.by_status['Aguardando Closer'] || 0)
) || 1
```
Note: Keep "Fechado" card rendering unchanged; it just won't count in the denominator for %. This makes the percentage show "share of active pipeline" which is the meaningful metric.

**Note on STATUS_CONFIG in page.tsx:** Also add "Aguardando Closer" and "Telefone Invalido" to STATUS_CONFIG so the recent_activity feed and stale_leads list render correctly for these statuses (currently falls back to 'Não Contatado' config). Add:
```tsx
'Aguardando Closer': { color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', bar: 'bg-purple-500', label: 'Aguardando Closer' },
'Telefone Invalido': { color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', bar: 'bg-gray-400', label: 'Telefone Invalido' },
```
Also expand STATUS_ORDER to include 'Aguardando Closer' between 'Proposta' and 'Fechado' in the pipeline funnel cards, since it's a real pipeline stage.
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npm run build 2>&1 | tail -20`
  </verify>
  <done>
    - Build passes with no TypeScript errors
    - "Não Contatado" badge is orange (not red) in STATUS_COLORS
    - Pipeline cards have cursor-pointer and onClick
    - totalForPipeline excludes Fechado from denominator
    - Cascade parent shows sum of subLeads values
  </done>
</task>

<task type="auto">
  <name>Task 2: Edit contact notes (PATCH API + timeline edit UI)</name>
  <files>
    web/src/app/api/leads/[cnpj]/notes/route.ts
    web/src/components/ContactNotesTimeline.tsx
  </files>
  <action>
**API: Add PATCH to notes route.ts:**
Add a `PATCH` handler after the existing `POST` handler in `/api/leads/[cnpj]/notes/route.ts`. The PATCH accepts `{ note_id: string, tipo?: string, observacao?: string }` in the body.

Authorization: Only the original author OR gestor can edit. Check: `SELECT vendedor_id FROM contact_notes WHERE id = $1` then verify `session.userId === vendedor_id OR session.role === 'gestor'`.

SQL update:
```sql
UPDATE contact_notes
SET tipo = COALESCE($2, tipo),
    observacao = COALESCE($3, observacao),
    updated_at = NOW()
WHERE id = $1
RETURNING *
```

Also add DELETE handler (note_id in body, same auth check) so users can delete individual notes without gestor:
```sql
DELETE FROM contact_notes WHERE id = $1 AND (vendedor_id = $2 OR $3 = 'gestor')
```
Return 200 with `{ success: true }`.

**UI: Edit mode in ContactNotesTimeline.tsx:**
Add state: `const [editingNoteId, setEditingNoteId] = useState<string | null>(null)` and `const [editForm, setEditForm] = useState({ tipo: '', observacao: '' })`.

In each note row, when `canModify` is true, show a small "Editar" button (pencil icon or text) next to the note. Clicking it:
- Sets `editingNoteId` to the note's id
- Sets `editForm` to `{ tipo: note.tipo, observacao: note.observacao || '' }`
- Hides normal note content, shows an inline edit form in its place

Inline edit form shows:
- `<select>` for tipo (same options as create form)
- `<textarea>` for observacao (pre-filled)
- "Salvar" button that calls `PATCH /api/leads/${cnpj}/notes` with `{ note_id, tipo, observacao }` then calls `fetchNotes()` and clears `editingNoteId`
- "Cancelar" button that just clears `editingNoteId`

Keep the existing delete behavior (which currently uses a separate delete mechanism — check if it exists; if not, add a "Excluir" button that calls DELETE on the same route). Style inline edit form to match the existing create form aesthetic.
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npm run build 2>&1 | tail -20`
  </verify>
  <done>
    - Build passes with no TypeScript errors
    - PATCH handler exists in notes/route.ts and validates author ownership
    - ContactNotesTimeline shows "Editar" button on each note when canModify
    - Clicking Editar shows inline edit form with pre-filled values
    - Saving calls PATCH and refreshes notes list
  </done>
</task>

<task type="auto">
  <name>Task 3: Gestor UI to add monitored CNPJ directly to Paulo's pipeline</name>
  <files>
    web/src/app/api/monitorar-cnpj/route.ts
    web/src/app/distribuir/page.tsx
  </files>
  <action>
**API: Create /api/monitorar-cnpj/route.ts:**
New file. POST handler only (gestor-only endpoint).

```ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'gestor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { cnpj } = await request.json()
  if (!cnpj || typeof cnpj !== 'string') {
    return NextResponse.json({ error: 'cnpj is required' }, { status: 400 })
  }
  const cleanCnpj = cnpj.replace(/\D/g, '')
  if (cleanCnpj.length !== 14) {
    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
  }

  // Look up Paulo Gabriel's user id
  const pauloRows = await query(
    "SELECT id FROM users WHERE email = 'paulo@projetus.org' AND active = true LIMIT 1"
  )
  const pauloId = pauloRows[0]?.id
  if (!pauloId) return NextResponse.json({ error: 'Paulo Gabriel não encontrado no sistema' }, { status: 404 })

  // Check if CNPJ exists in vendedor_projetos
  const existingLeads = await query(
    `SELECT id, cnpj, nome, vendedor_id FROM vendedor_projetos WHERE cnpj = $1 LIMIT 10`,
    [cleanCnpj]
  )

  if (existingLeads.length === 0) {
    return NextResponse.json({ error: `CNPJ ${cleanCnpj} não encontrado na base de leads` }, { status: 404 })
  }

  // Check if already assigned to someone else
  const alreadyAssigned = existingLeads.find(l => l.vendedor_id && l.vendedor_id !== pauloId)
  if (alreadyAssigned) {
    return NextResponse.json({
      error: `CNPJ já está atribuído a outro vendedor`,
      current_vendedor_id: alreadyAssigned.vendedor_id
    }, { status: 409 })
  }

  // Assign all rows for this CNPJ to Paulo (tipo_vendedor = 'Exclusivo')
  await query(
    `UPDATE vendedor_projetos
     SET vendedor_id = $1, tipo_vendedor = 'Exclusivo', updated_at = NOW()
     WHERE cnpj = $2`,
    [pauloId, cleanCnpj]
  )

  const nomeLead = existingLeads[0]?.nome || cleanCnpj
  return NextResponse.json({
    success: true,
    message: `${nomeLead} atribuído a Paulo Gabriel como Exclusivo`,
    cnpj: cleanCnpj,
    nome: nomeLead,
    rows_updated: existingLeads.length,
  })
}
```

**UI: Add "Adicionar CNPJ Monitorado" section to distribuir/page.tsx:**
Add a new collapsible section at the TOP of the distribuir page (above the tabs), visible only to gestor. Show a compact card titled "Adicionar CNPJ Monitorado (Paulo Gabriel)" with:
- A text input for CNPJ (accepts raw or formatted input, auto-strips non-digits)
- A "Atribuir a Paulo" button
- On success: show green toast "CNPJ atribuído a Paulo Gabriel como Exclusivo"
- On error: show red inline error message (e.g., "CNPJ não encontrado" or "já atribuído a outro vendedor")
- On 409 conflict: show warning "CNPJ já atribuído a outro vendedor — confirmar reatribuição?" with a Force button that calls the same API again with `{ cnpj, force: true }` (add force param handling in API to skip the conflict check)

Add state:
```ts
const [monitorCnpj, setMonitorCnpj] = useState('')
const [monitorLoading, setMonitorLoading] = useState(false)
const [monitorResult, setMonitorResult] = useState<{ type: 'success' | 'error' | 'conflict'; message: string } | null>(null)
```

Style: white card with `border border-amber-200 bg-amber-50` to visually separate it from the main distribution UI. Keep it compact — single row input + button.
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npm run build 2>&1 | tail -20`
  </verify>
  <done>
    - Build passes with no TypeScript errors
    - /api/monitorar-cnpj/route.ts exists and handles POST
    - distribuir/page.tsx has CNPJ monitoring section at top (gestor-only)
    - Form validates CNPJ format, shows success/error feedback
    - Successful assignment sets tipo_vendedor = 'Exclusivo' and vendedor_id = Paulo's id
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `npm run build` passes with zero TypeScript errors
2. Status badges: "Não Contatado" uses orange color, not red
3. Pipeline cards on home page have cursor-pointer and navigate to /leads on click
4. Commission % bars show share of active pipeline (Fechado excluded from denominator)
5. Cascade rows: parent shows sum of sub-row values, sub-rows show individual values (no double count)
6. Contact note "Editar" button opens inline edit form; saving PATCH updates note
7. Distribuir page has CNPJ monitoring form that assigns to Paulo Gabriel's pipeline
</verification>

<success_criteria>
- All 6 issues resolved and testable in the browser
- Build passes — no TypeScript errors introduced
- No regressions to existing lead status management, commission locking, or cascade expand behavior
</success_criteria>

<output>
After completion, create `.planning/quick/18-fix-multiple-crm-issues-ainda-n-o-filter/18-SUMMARY.md` following the summary template.
</output>
