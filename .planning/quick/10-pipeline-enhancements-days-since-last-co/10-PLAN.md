---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/leads/route.ts
  - web/src/lib/types.ts
  - web/src/app/leads/page.tsx
  - web/src/components/LeadContacts.tsx
  - web/src/app/page.tsx
autonomous: true
requirements: [PIPE-01, PIPE-02, PIPE-03, PIPE-04]

must_haves:
  truths:
    - "Leads table shows color-coded days since last contact for each CNPJ row"
    - "Leads table shows phone validity icon for principal contact next to phone info"
    - "LeadContacts component visually highlights the principal contact with star icon and distinct background"
    - "Dashboard vendedor cards show commission lock count and leads table shows lock icon on Fechado leads"
  artifacts:
    - path: "web/src/app/api/leads/route.ts"
      provides: "days_since_last_contact, principal_telefone_status, comissao_locked subqueries"
      contains: "days_since_last_contact"
    - path: "web/src/lib/types.ts"
      provides: "Extended VendedorProjeto with new fields"
      contains: "days_since_last_contact"
    - path: "web/src/app/leads/page.tsx"
      provides: "Days column and phone validity icon in leads table"
      contains: "days_since_last_contact"
    - path: "web/src/components/LeadContacts.tsx"
      provides: "Principal contact visual emphasis"
      contains: "bg-blue-50"
    - path: "web/src/app/page.tsx"
      provides: "Commission lock visibility in vendedor cards"
      contains: "comissao_locked"
  key_links:
    - from: "web/src/app/api/leads/route.ts"
      to: "contact_notes table"
      via: "subquery for MAX(created_at)"
      pattern: "days_since_last_contact"
    - from: "web/src/app/api/leads/route.ts"
      to: "lead_contacts table"
      via: "subquery for principal contact telefone_status"
      pattern: "principal_telefone_status"
    - from: "web/src/app/leads/page.tsx"
      to: "web/src/app/api/leads/route.ts"
      via: "fetch /api/leads consumes new fields"
      pattern: "days_since_last_contact"
---

<objective>
Add 4 pipeline enhancement indicators to the CRM: days since last contact column in leads table, phone validity icon in leads table, principal contact visual emphasis in LeadContacts, and commission lock status visibility.

Purpose: Help vendedores prioritize follow-ups, identify valid phone numbers at a glance, quickly find principal contacts, and know which commissions are secured.
Output: Enhanced leads table with 2 new visual indicators, improved LeadContacts styling, and commission lock badges.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/app/api/leads/route.ts
@web/src/lib/types.ts
@web/src/app/leads/page.tsx
@web/src/components/LeadContacts.tsx
@web/src/app/page.tsx
@web/src/app/api/dashboard-crm/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend leads API with days_since_last_contact, principal_telefone_status, and comissao_locked</name>
  <files>web/src/app/api/leads/route.ts, web/src/lib/types.ts</files>
  <action>
1. In `web/src/lib/types.ts`, add these optional fields to the `VendedorProjeto` interface:
   - `days_since_last_contact?: number | null` — days since last contact_notes entry for this CNPJ (null = never contacted)
   - `principal_telefone_status?: 'valido' | 'invalido' | 'nao_atende' | 'desconhecido' | null` — telefone_status of the principal lead_contact (null = no contacts exist)
   - `comissao_locked?: boolean` — whether this lead's commission is locked

2. In `web/src/app/api/leads/route.ts`, add 3 subqueries to the existing SELECT statement:

   a) Days since last contact — use the contact_notes table, get the MAX(created_at) for each CNPJ, then compute EXTRACT(DAY FROM NOW() - max_date). If no notes exist, return NULL:
   ```sql
   (
     SELECT EXTRACT(DAY FROM NOW() - MAX(cn.created_at))::int
     FROM contact_notes cn
     WHERE cn.lead_cnpj = vp.cnpj
   ) as days_since_last_contact
   ```

   b) Principal contact telefone_status — get the telefone_status from lead_contacts where principal=true for this CNPJ. If no principal exists, get the first contact's status. If no contacts at all, NULL:
   ```sql
   (
     SELECT lc.telefone_status
     FROM lead_contacts lc
     WHERE lc.lead_cnpj = vp.cnpj
     ORDER BY lc.principal DESC, lc.created_at ASC
     LIMIT 1
   ) as principal_telefone_status
   ```

   c) comissao_locked is already a column on vendedor_projetos, so it's already available via `vp.*`. No additional subquery needed — it comes through automatically. Just verify it's included in the SELECT.

  These are correlated subqueries which is fine for the current dataset size. They run per-row but with proper indexes on contact_notes(lead_cnpj) and lead_contacts(lead_cnpj) they'll be fast.
  </action>
  <verify>
  Run `npx tsc --noEmit` from the web/ directory to confirm no type errors. Manually check the API response by reviewing the SQL structure.
  </verify>
  <done>
  The /api/leads endpoint returns days_since_last_contact (number|null), principal_telefone_status (string|null), and comissao_locked (boolean) for each lead row. VendedorProjeto type includes these fields.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add visual indicators to leads table, LeadContacts, and dashboard</name>
  <files>web/src/app/leads/page.tsx, web/src/components/LeadContacts.tsx, web/src/app/page.tsx</files>
  <action>

**A) Leads table — Days since last contact column (`web/src/app/leads/page.tsx`):**

1. Add a new sortable column header "Contato" (rename existing "Contato" to "Telefone/Email") — actually, add a NEW column called "Ultimo Contato" after the existing Contato column. Make it sortable via `handleSort('dias')`.

2. In the sort logic inside `displayLeads` useMemo, add a case for `'dias'`:
   ```
   case 'dias': va = a.days_since_last_contact ?? 9999; vb = b.days_since_last_contact ?? 9999; break
   ```
   (null/never = sorts last when ascending, i.e., most stale at bottom)

3. In each lead row, add a `<td>` for the new column. Render a color-coded badge:
   - `null` (never contacted): gray badge "Nunca", small text, `bg-gray-100 text-gray-500`
   - `0-2 days`: green badge showing "Xd" (e.g., "0d", "1d", "2d"), `bg-green-100 text-green-700`
   - `3-7 days`: yellow/amber badge showing "Xd", `bg-amber-100 text-amber-700`
   - `>7 days`: red badge showing "Xd", `bg-red-100 text-red-700`
   - Use `text-[10px] font-medium px-1.5 py-0.5 rounded-full` sizing to keep it compact.

4. Also add this column to the expanded sub-rows (keep it empty or dash for sub-rows since days_since_last_contact is per-CNPJ).

**B) Leads table — Phone validity icon (`web/src/app/leads/page.tsx`):**

In the existing Contato `<td>` cell, BEFORE the phone number text, add a small inline icon based on `lead.principal_telefone_status`:
- `'valido'`: small green circle (or checkmark) — use a `<span>` with `w-2 h-2 rounded-full bg-green-500 inline-block mr-1`
- `'invalido'`: small red circle — `w-2 h-2 rounded-full bg-red-500 inline-block mr-1`
- `'nao_atende'`: small amber circle — `w-2 h-2 rounded-full bg-amber-500 inline-block mr-1`
- `'desconhecido'` or `null`: no icon (don't clutter if unknown)

Add a `title` attribute on the icon for tooltip: "Telefone valido", "Telefone invalido", "Nao atende".

**C) LeadContacts principal emphasis (`web/src/components/LeadContacts.tsx`):**

The existing component already shows a "Principal" badge (line 271-274) and a star toggle button (lines 321-331). Enhance the visual distinction:

1. On the contact row `<div>` (line 210), add conditional classes when `contact.principal` is true:
   - Change from: `className="p-4 hover:bg-gray-50 transition-colors"`
   - Change to: `className={`p-4 transition-colors ${contact.principal ? 'bg-blue-50/50 border-l-2 border-l-[#0072F7]' : 'hover:bg-gray-50'}`}`

2. When `contact.principal` is true, show a filled star icon (instead of the outline toggle). Replace the star button for principal contacts with a filled star that's always visible:
   - If `contact.principal === true`: show a filled star icon in `text-[#0072F7]` (non-clickable, just decorative). Place it at the start of the contact info, before the name. Use an SVG star with `fill="currentColor"` instead of `fill="none"`.
   - Keep the existing outline star button for non-principal contacts (the toggle to SET principal).

3. Move the "Principal" badge to also appear at the START of the name line (it's already there at line 271 — just keep it, the combination of blue left border + blue bg + badge + filled star will make it very clear).

**D) Dashboard vendedor cards — Commission lock indicator (`web/src/app/page.tsx`):**

In the per-vendedor cards section (around line 293-355), the dashboard API already returns `comissao_total` but not `locked_count` per vendedor. The commission_breakdown in dashboard-crm API is global, not per-vendedor.

For a quick win, add a lock icon next to "Comissao Total" label in vendedor cards if the vendedor has any fechado leads. This requires adding locked commission data per vendedor to the dashboard API.

Actually, looking more carefully at the dashboard-crm API, the `commissionRows` query already gets `locked_count` but it's aggregated globally, not per-vendedor.

**Simpler approach for the dashboard** — Skip per-vendedor lock count in the dashboard API (would require a new query). Instead:
1. In the **commission_breakdown** section that already exists for vendedor view (lines 252-284), the `locked_count` is already displayed as "(X confirmadas)". This is already implemented! Just verify it renders correctly.
2. In the **leads table** (`web/src/app/leads/page.tsx`): For Fechado leads, show a small lock icon next to the commission value if `lead.comissao_locked` is true. In the Valor `<td>` where it shows commission for Fechado leads (lines 361-367), add after the comissao value:
   ```tsx
   {lead.comissao_locked && (
     <span className="inline-block ml-1 text-green-500" title="Comissao confirmada">
       <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v2H6V5z"/></svg>
     </span>
   )}
   ```
   Also below the "comissao" label text, if locked show "Confirmada" in green-500 text-[9px].

  </action>
  <verify>
  Run `npx tsc --noEmit` from the web/ directory. Then run `npm run build` to ensure the app compiles. Visually inspect by running `npm run dev` and checking:
  1. Leads table has "Ultimo Contato" column with color-coded badges
  2. Leads table shows colored dots next to phone numbers for valid/invalid
  3. LeadContacts component highlights principal contact with blue left border + background
  4. Fechado leads in the table show lock icon next to commission value when comissao_locked=true
  </verify>
  <done>
  - Leads table shows a new "Ultimo Contato" sortable column with color-coded day badges (green/yellow/red/gray)
  - Phone numbers in leads table have a colored dot indicator showing principal contact's telefone_status
  - Principal contact in LeadContacts has blue-50 background, blue left border, and filled star icon
  - Fechado leads with comissao_locked=true show a lock icon and "Confirmada" text next to their commission value
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no type errors
- `npm run build` completes successfully
- Leads table displays "Ultimo Contato" column with proper color coding
- Phone validity dots appear in Contato column
- LeadContacts principal contact has distinct visual styling
- Fechado leads show lock icon when commission is locked
</verification>

<success_criteria>
All 4 pipeline enhancement indicators are visible and functional: days since last contact column is sortable and color-coded, phone validity dots show next to phone numbers, principal contacts are visually emphasized in LeadContacts, and commission lock status is visible on Fechado leads.
</success_criteria>

<output>
After completion, create `.planning/quick/10-pipeline-enhancements-days-since-last-co/10-SUMMARY.md`
</output>
