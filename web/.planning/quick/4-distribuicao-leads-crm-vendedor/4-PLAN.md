---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/leads/assign/route.ts
  - web/src/app/api/vendedores/route.ts
  - web/src/app/distribuir/page.tsx
  - web/src/app/leads/page.tsx
  - web/src/app/api/leads/[cnpj]/route.ts
autonomous: true

must_haves:
  truths:
    - "Gestor can view unassigned leads and assign them to vendedores"
    - "Gestor can select multiple leads and bulk assign to a vendedor"
    - "Vendedor sees only their assigned leads on /leads page"
    - "Vendedor can edit telefone, email, status_contato, observacoes on their leads"
    - "Leads show which vendedor they are assigned to"
  artifacts:
    - path: "web/src/app/api/leads/assign/route.ts"
      provides: "POST endpoint to assign leads to vendedor"
      exports: ["POST"]
    - path: "web/src/app/api/vendedores/route.ts"
      provides: "GET endpoint to list vendedores with lead counts"
      exports: ["GET"]
    - path: "web/src/app/distribuir/page.tsx"
      provides: "Gestor distribution UI with multi-select and vendedor dropdown"
      min_lines: 150
    - path: "web/src/app/leads/page.tsx"
      provides: "Leads list with vendedor filter and role-based filtering"
      contains: "vendedorFilter"
    - path: "web/src/app/api/leads/[cnpj]/route.ts"
      provides: "PATCH endpoint supporting telefone and email updates"
      contains: ["body.telefone", "body.email"]
  key_links:
    - from: "web/src/app/distribuir/page.tsx"
      to: "/api/leads/assign"
      via: "fetch POST with lead_ids and vendedor_id"
      pattern: "fetch.*api/leads/assign"
    - from: "web/src/app/distribuir/page.tsx"
      to: "/api/vendedores"
      via: "fetch GET to populate vendedor dropdown"
      pattern: "fetch.*api/vendedores"
    - from: "web/src/app/leads/page.tsx"
      to: "/api/leads"
      via: "fetch with vendedor filter param if gestor"
      pattern: "vendedor_id.*params"
---

<objective>
Build lead distribution system for gestor and CRM field editing for vendedores.

Purpose: Enable gestor to assign unassigned leads to specific vendedores, and allow vendedores to edit contact information and status on their assigned leads.

Output: Working distribution page at /distribuir, updated /leads page with role-based filtering and vendedor filter, API endpoints for assignment and vendedor listing, expanded PATCH endpoint for telefone/email updates.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/.planning/STATE.md
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/api/leads/route.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/api/leads/[cnpj]/route.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/leads/page.tsx
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/lib/dal.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/middleware.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create assignment and vendedores API endpoints</name>
  <files>
    web/src/app/api/leads/assign/route.ts
    web/src/app/api/vendedores/route.ts
    web/src/app/api/leads/[cnpj]/route.ts
  </files>
  <action>
Create POST /api/leads/assign endpoint:
- Extract session using getApiSession from @/lib/dal
- Return 401 if no session or role !== 'gestor' (only gestor can assign)
- Accept body: { lead_ids: number[], vendedor_id: string }
- Validate lead_ids is non-empty array and vendedor_id is valid UUID
- Execute UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW() WHERE id = ANY($2)
- Return { success: true, assigned_count: N }

Create GET /api/vendedores endpoint:
- Extract session using getApiSession
- Return 401 if no session
- Query: SELECT u.id, u.nome, u.email, COUNT(vp.id) as lead_count FROM users u LEFT JOIN vendedor_projetos vp ON u.id = vp.vendedor_id WHERE u.role = 'vendedor' AND u.active = true GROUP BY u.id, u.nome, u.email ORDER BY u.nome
- Return array of vendedor objects with lead_count

Update PATCH /api/leads/[cnpj]/route.ts:
- Add telefone and email to updatable fields (alongside existing status_contato and observacoes)
- Add to updates array: if (body.telefone !== undefined) updates.push(`telefone = $${paramIndex++}`); values.push(body.telefone)
- Add to updates array: if (body.email !== undefined) updates.push(`email = $${paramIndex++}`); values.push(body.email)
- Preserve existing vendedor role check (vendedor can only update their own leads)
  </action>
  <verify>
curl -X POST http://localhost:3000/api/leads/assign -H "Content-Type: application/json" -d '{"lead_ids": [1,2], "vendedor_id": "uuid-here"}' returns success (after auth)
curl http://localhost:3000/api/vendedores returns array with nome, email, lead_count
curl -X PATCH http://localhost:3000/api/leads/[cnpj] -d '{"id": 1, "telefone": "123", "email": "test@test.com"}' succeeds
  </verify>
  <done>
Assignment endpoint updates vendedor_projetos.vendedor_id for given lead_ids.
Vendedores endpoint returns list with aggregated lead counts.
PATCH endpoint accepts telefone and email updates.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /distribuir page for gestor lead assignment</name>
  <files>
    web/src/app/distribuir/page.tsx
  </files>
  <action>
Create new page at web/src/app/distribuir/page.tsx (gestor-only):
- 'use client' directive
- Call verifySession from @/lib/dal, redirect if role !== 'gestor'
- State: leads (VendedorProjeto[]), vendedores (from /api/vendedores), selectedLeadIds (Set<number>), selectedVendedorId (string), search (string), ufFilter (string), loading (boolean)
- Fetch unassigned leads: GET /api/leads with no vendedor filter, then filter client-side for vendedor_id IS NULL
- Fetch vendedores: GET /api/vendedores on mount
- Table with columns: Checkbox (multi-select), CNPJ, Nome, Programa, Valor Global, UF, Municipio
- "Select all visible" checkbox in table header (toggles all filtered leads)
- Individual row checkboxes (add/remove from selectedLeadIds Set)
- Search input filters by CNPJ or nome (client-side)
- UF dropdown filter (client-side)
- Sidebar or header card showing vendedor list with lead counts from /api/vendedores
- Bottom action bar (sticky or fixed): Vendedor dropdown (populated from vendedores state), "Atribuir X leads" button (disabled if no selection or no vendedor)
- On "Atribuir" click: POST to /api/leads/assign with { lead_ids: Array.from(selectedLeadIds), vendedor_id: selectedVendedorId }, show toast on success, refresh leads
- Sigma dark theme: bg-gray-950, glassmorphic cards, neon cyan accents (#06b6d4), table with border-white/5
- Badge or tag showing vendedor name if lead has vendedor_id (shouldn't appear on this page since filtering for NULL, but handle in UI code)
  </action>
  <verify>
Visit http://localhost:3000/distribuir as gestor
Table shows only unassigned leads (vendedor_id IS NULL)
Select multiple leads, choose vendedor from dropdown, click "Atribuir"
Leads disappear from unassigned list (or page refreshes)
curl GET /api/leads?vendedor_id={uuid} shows newly assigned leads
  </verify>
  <done>
/distribuir page loads and displays unassigned leads in table.
Multi-select checkboxes work (individual and bulk).
Vendedor dropdown populated from /api/vendedores.
"Atribuir" button assigns selected leads and refreshes UI.
Gestor-only access enforced via verifySession.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update /leads page with vendedor filter and inline CRM editing</name>
  <files>
    web/src/app/leads/page.tsx
  </files>
  <action>
Update existing web/src/app/leads/page.tsx:
- Add state: vendedorFilter (string), vendedores (array from /api/vendedores)
- Fetch vendedores on mount: GET /api/vendedores, store in state
- Add vendedorFilter dropdown next to existing statusFilter (only show if session.role === 'gestor')
- If session.role === 'vendedor': automatically pass vendedor_id={session.userId} to /api/leads (done server-side in route.ts, but confirm it's working)
- If session.role === 'gestor' and vendedorFilter set: pass vendedor_id={vendedorFilter} to /api/leads
- Update table to show vendedor_nome column (already in table, confirm it's visible)
- Make telefone and email cells editable inline (similar to existing observacoes input pattern):
  - Replace static text with input fields (type="text" for telefone, type="email" for email)
  - Use defaultValue={lead.telefone || ''} and onBlur to detect changes
  - On blur: if value changed, call updateLead(lead.id, 'telefone', value) or updateLead(lead.id, 'email', value)
  - updateLead function already exists, just add 'telefone' and 'email' as valid fields
- Add "Unassigned" option to vendedor filter dropdown for gestor to see unassigned leads
- Visual: Use Sigma dark theme colors, maintain existing table hover effects and neon border on hover

Implementation notes:
- The /api/leads route already filters by vendedor for vendedor role (lines 25-27 in route.ts)
- PATCH /api/leads/[cnpj] now accepts telefone and email (added in Task 1)
- Status dropdown already exists and works (lines 135-142)
- Observacoes input already exists and works (lines 148-159)
- Pattern to follow for telefone/email: same onBlur + updateLead approach
  </action>
  <verify>
Login as vendedor: /leads page shows only their assigned leads
Login as gestor: /leads page shows all leads
Gestor can filter by vendedor using dropdown
Gestor can filter by "Unassigned" to see vendedor_id IS NULL leads
Click into telefone or email cell, edit value, blur → PATCH request updates DB
Refresh page → edited values persist
  </verify>
  <done>
Vendedor role sees only their leads (existing behavior confirmed).
Gestor can filter by vendedor or view unassigned leads.
Telefone and email are inline-editable in table.
Changes persist via PATCH to /api/leads/[cnpj].
Vendedor filter dropdown populated from /api/vendedores.
  </done>
</task>

</tasks>

<verification>
- Visit /distribuir as gestor, select unassigned leads, assign to vendedor
- Visit /leads as vendedor, confirm only assigned leads visible
- Visit /leads as gestor, filter by vendedor, confirm correct filtering
- Edit telefone and email inline on /leads table, confirm persistence
- Check database: SELECT * FROM vendedor_projetos WHERE vendedor_id = '...' shows assigned leads
- Check /api/vendedores returns correct lead_count for each vendedor
</verification>

<success_criteria>
- POST /api/leads/assign updates vendedor_projetos.vendedor_id for multiple lead_ids
- GET /api/vendedores returns vendedor list with aggregated lead counts
- PATCH /api/leads/[cnpj] accepts telefone and email updates
- /distribuir page allows gestor to multi-select and assign unassigned leads
- /leads page filters by vendedor_id based on role (vendedor sees only theirs, gestor can filter)
- Telefone and email are inline-editable on /leads table
- All UI follows Sigma dark theme (bg-gray-950, neon cyan #06b6d4, glassmorphism)
</success_criteria>

<output>
After completion, create `web/.planning/quick/4-distribuicao-leads-crm-vendedor/4-SUMMARY.md`
</output>
