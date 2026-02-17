---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/setup-crm/route.ts
  - web/src/app/api/leads/[cnpj]/contacts/route.ts
  - web/src/components/LeadContacts.tsx
  - web/src/app/lead/[cnpj]/page.tsx
  - web/src/lib/types.ts
autonomous: true
requirements: [CONTACTS-01, CONTACTS-02, CONTACTS-03]

must_haves:
  truths:
    - "Vendedor can see all contacts for a lead in the lead detail page"
    - "Vendedor can add a new contact with nome, cargo, telefone, email"
    - "Vendedor can mark a contact's telefone as invalido/nao_atende/valido"
    - "Vendedor can mark one contact as principal"
    - "Vendedor can edit and delete contacts they created"
    - "Existing vendedor_projetos telefone/email is migrated as the first principal contact"
    - "'Telefone Invalido' appears as a 5th status_contato option on emendas"
  artifacts:
    - path: "web/src/app/api/setup-crm/route.ts"
      provides: "lead_contacts table creation + migration of existing data"
      contains: "CREATE TABLE IF NOT EXISTS lead_contacts"
    - path: "web/src/app/api/leads/[cnpj]/contacts/route.ts"
      provides: "CRUD API for lead contacts"
      exports: ["GET", "POST", "PATCH", "DELETE"]
    - path: "web/src/components/LeadContacts.tsx"
      provides: "Multi-contact UI component with inline CRUD"
      min_lines: 100
    - path: "web/src/lib/types.ts"
      provides: "LeadContact interface"
      contains: "interface LeadContact"
  key_links:
    - from: "web/src/components/LeadContacts.tsx"
      to: "/api/leads/[cnpj]/contacts"
      via: "fetch calls for CRUD"
      pattern: "fetch.*api/leads.*contacts"
    - from: "web/src/app/lead/[cnpj]/page.tsx"
      to: "web/src/components/LeadContacts.tsx"
      via: "component import between contact info card and emendas"
      pattern: "LeadContacts"
    - from: "web/src/app/api/setup-crm/route.ts"
      to: "lead_contacts table"
      via: "CREATE TABLE + migration INSERT"
      pattern: "lead_contacts"
---

<objective>
Add multi-contact support per lead: create `lead_contacts` table, CRUD API, contacts UI section in lead detail page, telefone_status tracking, and 'Telefone Invalido' as a 5th status_contato option.

Purpose: Wellington requested (1) flagging bad phone numbers for gestor data quality tracking, and (2) storing multiple human contacts per lead (nome, cargo, telefone, email) discovered by vendedores during outreach.

Output: Working multi-contact feature accessible from the lead detail page.
</objective>

<context>
@web/src/app/lead/[cnpj]/page.tsx
@web/src/app/api/leads/[cnpj]/route.ts
@web/src/app/api/leads/[cnpj]/notes/route.ts
@web/src/app/api/setup-crm/route.ts
@web/src/components/ContactNotesTimeline.tsx
@web/src/lib/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create lead_contacts table + type + CRUD API</name>
  <files>
    web/src/app/api/setup-crm/route.ts
    web/src/lib/types.ts
    web/src/app/api/leads/[cnpj]/contacts/route.ts
  </files>
  <action>
**1a. Add LeadContact type to `web/src/lib/types.ts`:**

```typescript
export type TelefoneStatus = 'valido' | 'invalido' | 'nao_atende' | 'desconhecido'

export interface LeadContact {
  id: number
  lead_cnpj: string
  nome_pessoa: string | null
  cargo: string | null
  telefone: string | null
  email: string | null
  telefone_status: TelefoneStatus
  principal: boolean
  created_by: string | null
  created_by_nome?: string | null
  created_at: string
}
```

**1b. Add lead_contacts table creation to `web/src/app/api/setup-crm/route.ts`:**

Add AFTER the contact_notes table creation (after step 6, around line 199). Use a new step number (e.g., step 11):

```sql
CREATE TABLE IF NOT EXISTS lead_contacts (
  id SERIAL PRIMARY KEY,
  lead_cnpj VARCHAR(20) NOT NULL,
  nome_pessoa VARCHAR(255),
  cargo VARCHAR(255),
  telefone VARCHAR(100),
  email VARCHAR(500),
  telefone_status VARCHAR(20) DEFAULT 'desconhecido' CHECK (telefone_status IN ('valido', 'invalido', 'nao_atende', 'desconhecido')),
  principal BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Add indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_lead_contacts_cnpj ON lead_contacts(lead_cnpj);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_principal ON lead_contacts(lead_cnpj, principal);
```

Then add a migration step that copies existing vendedor_projetos telefone/email into lead_contacts as the first "principal" contact for each CNPJ (only if no lead_contacts row exists yet for that CNPJ):

```sql
INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
SELECT DISTINCT ON (cnpj)
  cnpj,
  NULLIF(telefone, ''),
  NULLIF(email, ''),
  true,
  'desconhecido'
FROM vendedor_projetos
WHERE (telefone IS NOT NULL AND telefone != '') OR (email IS NOT NULL AND email != '')
  AND NOT EXISTS (SELECT 1 FROM lead_contacts WHERE lead_cnpj = vendedor_projetos.cnpj)
ON CONFLICT DO NOTHING;
```

Wrap the INSERT in a `.catch(() => {})` since ON CONFLICT DO NOTHING handles duplicates and the table may not have a unique constraint on lead_cnpj. The INSERT uses `DISTINCT ON (cnpj)` to pick one row per CNPJ.

IMPORTANT: Do NOT modify any existing SQL statements in setup-crm. Only ADD new steps at the end (before the summary diagnostics section around line 411).

**1c. Create CRUD API at `web/src/app/api/leads/[cnpj]/contacts/route.ts`:**

Follow the exact same pattern as `notes/route.ts` — use `getApiSession`, `verifyLeadAccess`, `canModifyData` from `@/lib/dal`, and `query` from `@/lib/db`.

**GET** `/api/leads/[cnpj]/contacts`:
- Auth + access check (same pattern as notes)
- Query: `SELECT lc.*, u.nome as created_by_nome FROM lead_contacts lc LEFT JOIN users u ON lc.created_by = u.id WHERE lc.lead_cnpj = $1 ORDER BY lc.principal DESC, lc.created_at ASC`
- Return JSON array

**POST** `/api/leads/[cnpj]/contacts`:
- Auth + canModifyData + access check
- Accept body: `{ nome_pessoa, cargo, telefone, email, telefone_status?, principal? }`
- Validate at least one of telefone or email is provided (return 400 otherwise)
- If `principal: true`, first set all other contacts for this CNPJ to `principal = false`
- INSERT into lead_contacts with `created_by = session.userId`
- Return created row with status 201

**PATCH** `/api/leads/[cnpj]/contacts`:
- Auth + canModifyData + access check
- Accept body: `{ id, nome_pessoa?, cargo?, telefone?, email?, telefone_status?, principal? }`
- Require `id` (return 400 if missing)
- Build dynamic UPDATE (same pattern as the `[cnpj]/route.ts` PATCH)
- If `principal: true` is being set, first set all other contacts for this CNPJ to `principal = false`
- Run UPDATE with `WHERE id = $N AND lead_cnpj = $M` (use decoded cnpj for safety)
- Return `{ success: true }`

**DELETE** `/api/leads/[cnpj]/contacts`:
- Auth + canModifyData + access check
- Accept body: `{ id }`
- Require `id` (return 400 if missing)
- DELETE WHERE id = $1 AND lead_cnpj = $2
- Return `{ success: true }`
  </action>
  <verify>
Run `npx tsc --noEmit` from web/ to verify no TypeScript errors. Manually verify the new route file exists at `web/src/app/api/leads/[cnpj]/contacts/route.ts`.
  </verify>
  <done>
LeadContact type exists in types.ts. lead_contacts table creation + migration added to setup-crm. CRUD API at /api/leads/[cnpj]/contacts with GET/POST/PATCH/DELETE, following the same auth/access patterns as the notes route. TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: LeadContacts UI component + integration into lead detail page</name>
  <files>
    web/src/components/LeadContacts.tsx
    web/src/app/lead/[cnpj]/page.tsx
  </files>
  <action>
**2a. Create `web/src/components/LeadContacts.tsx`:**

Props: `{ cnpj: string, canModify: boolean }`

The component should follow the visual style of `ContactNotesTimeline.tsx` — white card with border, header with title + action button, list of items.

**State:**
- `contacts: LeadContact[]` — loaded from GET /api/leads/[cnpj]/contacts
- `loading: boolean`
- `showForm: boolean` — toggle add-contact form
- `editingId: number | null` — which contact is being inline-edited
- `formData: { nome_pessoa, cargo, telefone, email }` — for add form

**Layout (card style matching existing page):**

Header row: "Contatos" title with count badge + "+ Novo Contato" button (only if canModify)

Add form (shown when showForm=true, inside the card below header):
- 4 fields in a 2-col grid (responsive: 1-col on mobile):
  - Nome da Pessoa (text input, placeholder "Ex: João Silva")
  - Cargo (text input, placeholder "Ex: Prefeito, Secretário")
  - Telefone (text input, placeholder "(XX) XXXXX-XXXX")
  - Email (text input, placeholder "email@exemplo.com")
- Save + Cancel buttons row

Contact list:
- Each contact is a row/card inside the card, separated by `divide-y divide-gray-200`
- Show: nome_pessoa (bold) | cargo (gray, smaller) | telefone (with WhatsApp link like existing) | email (mailto link) | telefone_status badge | principal badge
- telefone_status badges:
  - 'valido': green badge "Valido"
  - 'invalido': red badge "Invalido"
  - 'nao_atende': amber badge "Nao Atende"
  - 'desconhecido': gray badge "Desconhecido"
- If `canModify`:
  - telefone_status is a small `<select>` dropdown (not just a badge) so vendedor can change it inline
  - Show a small "Principal" toggle/checkbox
  - Show edit (pencil) and delete (X) icons
  - Edit mode: same fields as add form, inline in the row, with Save/Cancel
  - Delete: `confirm('Remover este contato?')` before DELETE call
- If no contacts: "Nenhum contato cadastrado" empty state

**Color scheme:** Use the same palette as existing page — `#0072F7` for primary actions, gray-50/200 borders, gray-900/600/500 text hierarchy. Do NOT use cyan/neon colors for this section.

**Mobile:** Stack contact fields vertically on small screens. Use `grid grid-cols-1 sm:grid-cols-2` patterns.

**2b. Integrate into lead detail page `web/src/app/lead/[cnpj]/page.tsx`:**

1. Import LeadContacts component at the top
2. Add `<LeadContacts cnpj={cnpj} canModify={canModify} />` BETWEEN the contact info card (the `flex flex-wrap gap-6` div around line 266) and the Emendas table (the `overflow-hidden` div around line 387). This is exactly where the planning context specified: "between the contact info card and emendas table".

3. Add 'Telefone Invalido' as 5th status option:
   - Update `STATUS_OPTIONS` array (line 11): add `'Telefone Invalido'` after 'Fechado'
   - Update `STATUS_COLORS` (line 12): add `'Telefone Invalido': 'bg-gray-500/20 text-gray-600'`

IMPORTANT: Do NOT change any other logic in page.tsx. The existing inline telefone/email editing, commission display, emendas table, ContactNotesTimeline — all must remain untouched. Only ADD the import, the component placement, and the status option.
  </action>
  <verify>
Run `npx tsc --noEmit` from web/ to verify no TypeScript errors. Run `npm run build` from web/ to confirm the build succeeds. Visually confirm LeadContacts appears between contact info and emendas by checking the JSX order in page.tsx.
  </verify>
  <done>
LeadContacts.tsx component renders contacts list with inline CRUD (add, edit, delete, telefone_status dropdown, principal toggle). Component is mounted in lead detail page between contact info card and emendas table. 'Telefone Invalido' is the 5th status_contato option with gray styling. Build passes with no errors.
  </done>
</task>

</tasks>

<verification>
1. `cd web && npx tsc --noEmit` — zero TypeScript errors
2. `cd web && npm run build` — build succeeds
3. Visit `/api/setup-crm` as gestor to run table creation + migration
4. Navigate to any lead detail page — LeadContacts section appears between contact info and emendas
5. Add a contact (nome, cargo, telefone, email) — appears in list
6. Change telefone_status via dropdown — persists on reload
7. Toggle principal — only one contact is principal at a time
8. Edit a contact — changes persist
9. Delete a contact — removed from list
10. 'Telefone Invalido' appears in emendas status dropdown
11. Existing inline telefone/email editing still works
12. Commission logic unaffected (test Fechado flow)
</verification>

<success_criteria>
- lead_contacts table created via setup-crm with correct schema and indexes
- Existing vendedor_projetos telefone/email migrated as principal contacts
- CRUD API at /api/leads/[cnpj]/contacts working (GET/POST/PATCH/DELETE)
- LeadContacts component renders in lead detail page with full inline CRUD
- telefone_status selectable per contact (valido/invalido/nao_atende/desconhecido)
- Principal toggle works (only one principal per CNPJ)
- 'Telefone Invalido' is a 5th status_contato option on emendas
- No regressions: existing telefone/email edit, status changes, commission logic all intact
- Mobile-friendly layout
</success_criteria>

<output>
After completion, create `.planning/quick/9-lead-contacts-table-multi-contact-ui-tel/9-SUMMARY.md`
</output>
