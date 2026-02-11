---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/components/LeadSlideOver.tsx
  - web/src/app/leads/page.tsx
autonomous: true
must_haves:
  truths:
    - "Clicking a lead row opens a slide-over panel with lead details"
    - "Panel shows nome, CNPJ, saldo, UF, vendedor, telefone, email, status, observacoes"
    - "Quick action buttons for WhatsApp, Email, and Ver Detalhes work correctly"
    - "Clicking outside or X closes the panel"
    - "Panel has premium glassmorphic dark theme styling"
  artifacts:
    - path: "web/src/components/LeadSlideOver.tsx"
      provides: "Slide-over panel component"
    - path: "web/src/app/leads/page.tsx"
      provides: "Updated leads page with slide-over integration"
  key_links:
    - from: "web/src/app/leads/page.tsx"
      to: "web/src/components/LeadSlideOver.tsx"
      via: "selectedLead state + onClick handler"
      pattern: "setSelectedLead"
---

<objective>
Add a premium slide-over panel to the leads table. Clicking any row opens a right-side panel showing lead quick info with glassmorphic styling and quick action buttons (WhatsApp, Email, Ver Detalhes).

Purpose: Let users preview lead info without leaving the list, with one-click actions.
Output: LeadSlideOver component + updated leads page.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/app/leads/page.tsx
@web/src/lib/types.ts
@web/src/lib/format.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create LeadSlideOver component</name>
  <files>web/src/components/LeadSlideOver.tsx</files>
  <action>
Create a 'use client' slide-over panel component that receives `lead: VendedorProjeto | null` and `onClose: () => void` props.

Layout (right-side slide-over, 420px wide):
- Backdrop: fixed inset-0, bg-black/50 backdrop-blur-sm, onClick closes
- Panel: fixed right-0 top-0 h-full, bg-sigma-navy-card/95 backdrop-blur-xl, border-l border-white/10, shadow-2xl
- Animate with transition-transform (translate-x-full when closed, translate-x-0 when open)
- Use conditional rendering: if lead is null, don't render

Header section:
- Close button (X icon, top-right) with hover:text-sigma-neon
- Lead nome as h2 (text-xl font-bold text-white)
- CNPJ formatted below (font-mono text-sm text-gray-400) using formatCNPJ
- Status badge using same STATUS_COLORS map: PROPOSTA (amber), AINDA NAO (gray), RETORNO (purple)

Info grid (2-col grid with glassmorphic cards bg-white/5 rounded-xl p-3 border border-white/5):
- Saldo: large text-sigma-neon font-bold
- UF / Municipio
- Vendedor
- Orgao Concedente
- % Executado (with a small progress bar, sigma-neon bg)
- Nr Convenio

Contact section:
- Telefone (if exists, with phone icon)
- Email (if exists, with mail icon)

Observacoes section:
- If exists, show in a bg-white/5 rounded-xl p-3 block, italic text-gray-400

Quick actions bar (bottom, sticky, flex gap-3, p-4 border-t border-white/5):
- WhatsApp button: green gradient (bg-green-600 hover:bg-green-500), icon + "WhatsApp". Opens `https://wa.me/55${telefone}` in new tab (strip non-digits from telefone). Disabled/gray if no telefone.
- Email button: border border-white/10 hover:bg-white/5, icon + "Email". Opens `mailto:${email}`. Disabled if no email.
- Ver Detalhes button: bg-sigma-neon text-sigma-navy-dark font-semibold. Navigates to `/lead/${encodeURIComponent(cnpj)}`.

Use simple inline SVG icons (no icon library needed) - small 16x16 icons for phone, mail, external-link, X close.

Add a subtle gradient glow at top: a div with bg-gradient-to-b from-sigma-neon/5 to-transparent h-32 absolute top-0 pointer-events-none.
  </action>
  <verify>TypeScript compiles: cd web && npx tsc --noEmit --strict false 2>&1 | head -20</verify>
  <done>LeadSlideOver.tsx exists, renders slide-over with all info fields and action buttons</done>
</task>

<task type="auto">
  <name>Task 2: Integrate slide-over into leads page</name>
  <files>web/src/app/leads/page.tsx</files>
  <action>
In LeadsPage component:

1. Add state: `const [selectedLead, setSelectedLead] = useState<VendedorProjeto | null>(null)`

2. Import LeadSlideOver from '@/components/LeadSlideOver'

3. Change the table row `<tr>` onClick: instead of navigating, call `setSelectedLead(lead)`.
   - Remove the CNPJ button that does router.push - make the CNPJ cell just a styled span like the other cells
   - Add `cursor-pointer` to tr (already has it)
   - Add a subtle left-border highlight on hover: `hover:border-l-2 hover:border-l-sigma-neon`

4. Render LeadSlideOver at the bottom of the JSX:
   `<LeadSlideOver lead={selectedLead} onClose={() => setSelectedLead(null)} />`

5. Keep the router import - it's still used if user wants to navigate from the slide-over's "Ver Detalhes" button. Actually, remove router from this page since navigation now happens inside LeadSlideOver. Clean up unused imports.

6. Keep the inline editing for status_categoria select and observacoes input. These should still work without opening the slide-over. Use e.stopPropagation() on the select and input to prevent row click from firing when interacting with these elements.
  </action>
  <verify>cd web && npx tsc --noEmit --strict false 2>&1 | head -20 && echo "OK"</verify>
  <done>Clicking a lead row opens slide-over. Status select and obs input still work inline without opening panel. Panel close works via X button or backdrop click.</done>
</task>

</tasks>

<verification>
- `cd web && npm run build` succeeds
- Navigate to /leads, click any row -> slide-over opens on right
- Panel shows all lead info fields
- WhatsApp/Email buttons link correctly (or show disabled if no data)
- Ver Detalhes navigates to /lead/[cnpj]
- Clicking backdrop or X closes panel
- Inline status select and obs input still work without opening panel
</verification>

<success_criteria>
Lead rows are clickable and open a premium glassmorphic slide-over panel with complete lead info and working quick action buttons.
</success_criteria>

<output>
After completion, create `.planning/quick/2-leads-clic-veis-com-card-de-info-r-pida-/2-SUMMARY.md`
</output>
