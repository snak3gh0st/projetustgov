---
phase: quick-48
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/types/next-auth.d.ts
  - web/src/lib/types.ts
  - web/src/lib/auth.ts
  - web/src/lib/dal.ts
  - web/src/app/api/setup-crm/route.ts
  - web/src/app/api/vendedores/route.ts
  - web/src/app/api/leads/route.ts
  - web/src/app/api/leads/[cnpj]/route.ts
  - web/src/app/api/comissoes/route.ts
  - web/src/app/api/dashboard-crm/route.ts
  - web/src/app/api/usuarios/[id]/role/route.ts
  - web/src/app/api/bi/route.ts
  - web/src/app/api/debug-sync/route.ts
  - web/src/app/leads/page.tsx
  - web/src/app/distribuir/page.tsx
  - web/src/app/comissoes/page.tsx
  - web/src/app/cadastro-vendedor/page.tsx
  - web/src/app/bi/page.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Paulo login shows 'Coordenador' label everywhere (not Gestor Vendedor)"
    - "Paulo's view of leads and commissions works exactly as before (own leads + closer + 1% coordinator commission)"
    - "Tito (gestor) can be assigned leads in /distribuir"
    - "Leads assigned to Tito show comissao_percentual = 0, comissao_valor = 0 — no commission earned"
    - "Tito can see his own leads in his dashboard (Meu Pipeline tab when he has assigned leads)"
  artifacts:
    - path: "web/src/lib/types.ts"
      provides: "UserRole union includes 'coordenador'"
    - path: "web/src/app/api/setup-crm/route.ts"
      provides: "DB constraint includes 'coordenador', Paulo seed uses 'coordenador'"
  key_links:
    - from: "web/src/app/api/comissoes/route.ts"
      to: "vendedor_projetos.comissao_valor"
      via: "role check: gestor role forces 0 commission"
      pattern: "session\\.role === 'gestor'"
---

<objective>
Hotfix de roles: renomear `gestor_vendedor` para `coordenador` (Paulo), e permitir que o Tito (gestor) seja atribuído a leads com comissão sempre 0 (é sócio, não recebe comissão).

Purpose: Clarificar papéis — Paulo é coordenador da equipe de vendas. Tito é sócio/gestor que pode vender mas não gera custo de comissão.
Output: Paulo com role `coordenador` (mesma visão de hoje), Tito pode ser assignado leads com comissão zero.
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
  <name>Task 1: Rename gestor_vendedor → coordenador in types, auth, and all API routes</name>
  <files>
    web/src/types/next-auth.d.ts
    web/src/lib/types.ts
    web/src/lib/auth.ts
    web/src/lib/dal.ts
    web/src/app/api/setup-crm/route.ts
    web/src/app/api/vendedores/route.ts
    web/src/app/api/leads/route.ts
    web/src/app/api/leads/[cnpj]/route.ts
    web/src/app/api/comissoes/route.ts
    web/src/app/api/dashboard-crm/route.ts
    web/src/app/api/usuarios/[id]/role/route.ts
    web/src/app/api/bi/route.ts
    web/src/app/api/debug-sync/route.ts
  </files>
  <action>
**Step A — Types (web/src/lib/types.ts and web/src/types/next-auth.d.ts):**
- Change `UserRole = 'gestor' | 'vendedor' | 'visualizador' | 'gestor_vendedor'` to include `'coordenador'` instead of `'gestor_vendedor'`.
- Update both `types.ts` and `next-auth.d.ts` (Session, User, JWT interfaces) to use `'coordenador'` instead of `'gestor_vendedor'`.

**Step B — Auth callbacks (web/src/lib/auth.ts):**
- In jwt/session callbacks, replace `'gestor_vendedor'` literal in the type cast with `'coordenador'`.

**Step C — DAL helpers (web/src/lib/dal.ts):**
- `isSeller()`: change `role === 'gestor_vendedor'` → `role === 'coordenador'`
- `buildVendedorFilter()`: change `gestor_vendedor` → `coordenador`
- `canModifyData()`: change `gestor_vendedor` → `coordenador`
- `verifyLeadAccess()`: change `gestor_vendedor` → `coordenador`
- All role type annotations: add `'coordenador'` to union, remove `'gestor_vendedor'`

**Step D — setup-crm API (web/src/app/api/setup-crm/route.ts):**
- DB constraint: change `CHECK (role IN ('gestor', 'vendedor', 'visualizador', 'gestor_vendedor'))` to include `'coordenador'` instead of `'gestor_vendedor'` (add both for migration safety, or add `'coordenador'` alongside `'gestor_vendedor'` so existing rows keep working until migrated).
  - Pattern: `CHECK (role IN ('gestor', 'vendedor', 'visualizador', 'gestor_vendedor', 'coordenador'))`
- After the constraint update block, add a migration step:
  ```sql
  UPDATE users SET role = 'coordenador' WHERE role = 'gestor_vendedor';
  ```
  Wrap in a DO $$ ... $$ block with `.catch(() => {})` for idempotency.
- Seed user for Paulo: change `role: 'gestor_vendedor'` → `role: 'coordenador'`.

**Step E — vendedores API (web/src/app/api/vendedores/route.ts):**
- Change `WHERE u.role IN ('vendedor', 'gestor_vendedor')` → `WHERE u.role IN ('vendedor', 'coordenador')`.
- Also add `'gestor'` to this IN clause so that Tito (gestor) appears in the vendedor dropdown for lead assignment (needed for Task 2).
  - New: `WHERE u.role IN ('vendedor', 'coordenador', 'gestor') AND u.active = true`

**Step F — leads API (web/src/app/api/leads/route.ts):**
- All `session.role === 'gestor_vendedor'` checks → `session.role === 'coordenador'`
- The `excludeExisting` check: `session.role !== 'vendedor' && session.role !== 'gestor_vendedor'` → `session.role !== 'vendedor' && session.role !== 'coordenador'`

**Step G — leads/[cnpj] API (web/src/app/api/leads/[cnpj]/route.ts):**
- All `gestor_vendedor` references → `coordenador`

**Step H — comissoes API (web/src/app/api/comissoes/route.ts):**
- All `gestor_vendedor` references → `coordenador`
- In the `isPauloView` check: `session.role === 'gestor_vendedor' || session.role === 'gestor'` stays as `session.role === 'coordenador' || session.role === 'gestor'`
- ADD: After the main `leadsRows` mapping, for any lead where `vendedor_id` belongs to a gestor (Tito), force `comissao_valor = 0`, `comissao_bonus = 0`, `closer_comissao_valor = 0`. Do this by enriching the leads query to join `users.role` on `vendedor_id`:
  - In the main SELECT, add: `u.role as vendedor_role`
  - In the `mappedLeads` map, add a check: `if (lead.vendedor_role === 'gestor') { comissao_valor = 0; comissao_bonus = 0; }` (use the mapped object assignment)
  - This ensures gestor-sold leads show R$0 commission everywhere.

**Step I — dashboard-crm API (web/src/app/api/dashboard-crm/route.ts):**
- All `gestor_vendedor` references → `coordenador`

**Step J — usuarios/[id]/role API (web/src/app/api/usuarios/[id]/role/route.ts):**
- `ALLOWED_ROLES`: change `['vendedor', 'visualizador', 'gestor_vendedor']` → `['vendedor', 'visualizador', 'coordenador']`
- The guard `if (targetRows[0].role === 'gestor')` prevents changing gestors — keep this.

**Step K — bi API (web/src/app/api/bi/route.ts):**
- All `gestor_vendedor` references → `coordenador`

**Step L — debug-sync API (web/src/app/api/debug-sync/route.ts):**
- All `gestor_vendedor` references → `coordenador`
  </action>
  <verify>
Run `npx tsc --noEmit` from `web/` directory — should produce no TypeScript errors related to role literals.
Search for any remaining `gestor_vendedor` in `web/src/`: `grep -r "gestor_vendedor" web/src/` — should return 0 matches (only constraint migration SQL may retain both for safety).
  </verify>
  <done>
All TypeScript files use `coordenador` instead of `gestor_vendedor`. DB migration step in setup-crm updates Paulo's row. No TS errors. Paulo's behavior is functionally identical (same filtering logic, same commission breakdown, just renamed role string).
  </done>
</task>

<task type="auto">
  <name>Task 2: Update UI labels and allow Tito (gestor) to sell leads with 0 commission</name>
  <files>
    web/src/app/leads/page.tsx
    web/src/app/distribuir/page.tsx
    web/src/app/comissoes/page.tsx
    web/src/app/cadastro-vendedor/page.tsx
    web/src/app/bi/page.tsx
  </files>
  <action>
**Step A — UI label updates (cadastro-vendedor/page.tsx):**
- Change display label `gestor_vendedor: 'Gestor Vendedor'` → `coordenador: 'Coordenador'`
- Change color classes from `gestor_vendedor: ...` → `coordenador: ...` (keep same indigo color scheme)
- Change `<option value="gestor_vendedor">Gestor Vendedor</option>` → `<option value="coordenador">Coordenador</option>` in both role dropdowns

**Step B — leads page (web/src/app/leads/page.tsx):**
- All `sessionUser?.role === 'gestor_vendedor'` → `sessionUser?.role === 'coordenador'`
- SDR column header label: the check `sessionUser?.role === 'gestor_vendedor' ? 'SDR' : 'Vendedor'` → `sessionUser?.role === 'coordenador' ? 'SDR' : 'Vendedor'`

**Step C — distribuir page (web/src/app/distribuir/page.tsx):**
- All `gestor_vendedor` checks → `coordenador`
- The vendedores dropdown in distribuir is populated from `/api/vendedores` — which now returns gestors too (Task 1, Step E). The UI already renders whatever the API returns, so Tito will appear as an assignable user automatically.
- Confirm no hardcoded role filter in the distribuir page front-end that would exclude gestors.

**Step D — comissoes page (web/src/app/comissoes/page.tsx):**
- All `gestor_vendedor` role checks → `coordenador`
- The `coordenador` breakdown section already exists (named `coordenador` in the data structure) — keep as-is, it now maps correctly since `data.role` will be `'coordenador'` for Paulo.
- Note: `data.role === 'gestor_vendedor'` check at line ~327 → `data.role === 'coordenador'`
- Tito (gestor) — the existing gestor view of comissoes shows all vendedores' commissions. Tito's own leads will show R$0 commission (enforced in API, Task 1 Step H), which is correct.

**Step E — bi page (web/src/app/bi/page.tsx):**
- `const isVendedor = role === 'vendedor' || role === 'gestor_vendedor'` → `role === 'vendedor' || role === 'coordenador'`

**Step F — Tito's personal pipeline in gestor dashboard:**
The gestor dashboard (`/`) shows a global CRM view. For Tito to see his own leads, no special UI change is needed — the /leads page with no filter already shows all leads for gestor. However, to make it easy for Tito to see his own assigned leads, update the dashboard CRM API response: gestors already see all leads, and the per-vendedor breakdown table on the gestor dashboard will include Tito's row once he has leads assigned. No additional UI needed — his name will appear in the team breakdown table with 0 commission.

**Verification:** After deploying, run `/api/setup-crm` in production to:
1. Update the DB constraint to include `coordenador`
2. Migrate Paulo's row from `gestor_vendedor` to `coordenador`
  </action>
  <verify>
1. Log in as Paulo — badge/label should show "Coordenador" not "Gestor Vendedor"
2. In /cadastro-vendedor, role dropdown shows "Coordenador" option
3. Paulo's leads page, comissoes page, dashboard all load without errors
4. In /distribuir, Tito's name appears in the vendedor dropdown for assignment
5. Assign a test lead to Tito — verify comissao_percentual = 0, comissao_valor = 0 in the DB or via API response
  </verify>
  <done>
Paulo sees "Coordenador" label throughout the UI. His entire workflow (leads, commissions, closer, distribuir) works identically to before. Tito can be selected as a vendedor in /distribuir to receive lead assignments. Leads assigned to Tito show R$0 commission in /comissoes (both gestor view and API response).
  </done>
</task>

</tasks>

<verification>
- `grep -r "gestor_vendedor" web/src/` returns 0 results (all migrated to `coordenador`)
- Paulo can log in and sees all his leads, comissoes with coordinator breakdown, /distribuir access
- Tito appears in the vendedor dropdown in /distribuir
- TypeScript compiles cleanly: `cd web && npx tsc --noEmit`
</verification>

<success_criteria>
- Paulo's role in DB is `coordenador`, all UI shows "Coordenador"
- Paulo's full workflow unchanged (leads view, closer assignments, 1% coordinator commission)
- Tito (gestor) appears as assignable user in /distribuir
- Leads assigned to Tito have comissao_valor = 0 in the comissoes API response
- No TypeScript errors, no runtime errors on any page
</success_criteria>

<output>
After completion, create `.planning/quick/48-hotfix-de-roles-paulo-coordernador-e-man/48-SUMMARY.md`
</output>
