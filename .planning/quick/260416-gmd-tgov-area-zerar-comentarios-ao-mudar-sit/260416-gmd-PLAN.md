---
phase: quick
plan: 260416-gmd
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/tgov-only-sync.ts
  - web/src/app/tgov/TGovDashboardClient.tsx
  - web/src/types/next-auth.d.ts
  - web/src/lib/dal.ts
  - web/src/lib/tgov.ts
  - web/src/lib/email-service.ts
  - web/src/lib/email-templates.ts
  - web/src/app/api/tgov/aprovacao/route.ts
autonomous: true
requirements: [GMD-01, GMD-02, GMD-03, GMD-04]

must_haves:
  truths:
    - "When a TGov proposal changes situacao from aprovacao->execucao or execucao->prestacao de contas during sync, tgov_comments for that proposal are deleted"
    - "The aprovacao table last column header shows 'Tecnico' and displays tecnicoNome instead of comment count"
    - "The roles coord_prestacao and assistente_prestacao exist in the type system and RBAC helpers"
    - "A diligencia email template exists with proposal number, ministry, proponente, CNPJ, situacao, and comment/obs fields"
  artifacts:
    - path: "web/src/lib/tgov-only-sync.ts"
      provides: "Comment clearing on situacao transition"
    - path: "web/src/app/tgov/TGovDashboardClient.tsx"
      provides: "Tecnico Responsavel column replacing Comments column"
    - path: "web/src/lib/email-templates.ts"
      provides: "diligenciaEmail template function"
  key_links:
    - from: "web/src/lib/tgov-only-sync.ts"
      to: "tgov_comments table"
      via: "DELETE FROM tgov_comments WHERE target_key = $1"
      pattern: "DELETE.*tgov_comments"
---

<objective>
Four TGov area changes: (1) clear comments when situacao transitions between major phases, (2) replace "Coments." column with "Tecnico Responsavel" in aprovacao table, (3) add PC Coordenacao roles, (4) create diligencia email template with proposal details.

Purpose: Business process improvements for TGov workflow — comments reset on phase transitions, better visibility of responsible technician, new roles for Prestacao de Contas coordination, and structured diligence email.
Output: Updated sync logic, UI column, role definitions, and email template.
</objective>

<context>
@web/src/lib/tgov-only-sync.ts
@web/src/app/tgov/TGovDashboardClient.tsx
@web/src/types/next-auth.d.ts
@web/src/lib/dal.ts
@web/src/lib/tgov.ts
@web/src/lib/email-service.ts
@web/src/lib/email-templates.ts
@web/src/app/api/tgov/aprovacao/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clear comments on situacao change + replace Coments column with Tecnico</name>
  <files>
    web/src/lib/tgov-only-sync.ts
    web/src/app/tgov/TGovDashboardClient.tsx
  </files>
  <action>
**1a) tgov-only-sync.ts — Clear tgov_comments when situacao transitions between major phases:**

In the sync loop (around line 420 where `situacaoChanges` are processed), add a DELETE query for comments when the transition is specifically:
- From any "aprovacao" situacao (containing "Aprovado", "Aguardando Análise", "Em Análise", "Aguardando Envio", "Reprovado", "Complementação") to any "execucao" situacao (containing "Em Execução")
- From "Em Execução" to any "Prestação de Contas" situacao (containing "Prestação de Contas" or "Aguardando Prestação")

After the existing `situacaoChanges` loop (line ~420-442), add within the same loop:
```sql
DELETE FROM tgov_comments WHERE target_key = $1 AND target_type = 'proposta'
```
where $1 is the `change.nrProposta`. This runs AFTER notifications are sent (so the notification still references the old comments context).

Also clear the `obs` field in `tgov_interactions` for the same proposal:
```sql
UPDATE tgov_interactions SET obs = NULL WHERE item_key = $1
```

Use a helper function `isMajorPhaseTransition(oldSituacao: string, newSituacao: string): boolean` that normalizes to lowercase and checks:
- old matches aprovacao-phase keywords AND new matches execucao-phase keywords
- old matches execucao-phase keywords AND new matches prestacao-phase keywords

Log: `[tgov-only-sync] cleared comments for ${nrProposta} (${oldSituacao} -> ${newSituacao})`

**1b) TGovDashboardClient.tsx — Replace "Coments." column with "Tecnico" in aprovacao table:**

In the AprovacaoTable component (around line 1258):
- Change the header from `<th ...>Coments.</th>` to `<SortableTh label="Tecnico" col="tecnicoNome" className="text-left px-3" {...thProps} />`
- In the tbody row (around line 1297-1310), replace the entire commentCount cell with:
  ```tsx
  <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[120px]">
    {row.tecnicoNome || <span className="text-gray-300">—</span>}
  </td>
  ```
- Remove the old comment count SVG icon and badge entirely from the table row.
- Keep SkeletonRows cols count correct (still 7 columns).
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Verify aprovacao table shows "Tecnico" column with technician names instead of comment counts</manual>
  </verify>
  <done>Sync clears comments on major phase transitions; aprovacao table shows tecnico name in last data column</done>
</task>

<task type="auto">
  <name>Task 2: Add PC Coordenacao roles + diligencia email template</name>
  <files>
    web/src/types/next-auth.d.ts
    web/src/lib/dal.ts
    web/src/lib/tgov.ts
    web/src/lib/email-templates.ts
    web/src/lib/email-service.ts
    web/src/app/tgov/TGovDashboardClient.tsx
  </files>
  <action>
**2a) Add roles `coord_prestacao` and `assistente_prestacao` to the type system:**

In `web/src/types/next-auth.d.ts`:
- Add `'coord_prestacao' | 'assistente_prestacao'` to all three role union types (Session.user.role, User.role, JWT.role).

In `web/src/lib/dal.ts`:
- Add `|| role === 'coord_prestacao' || role === 'assistente_prestacao'` to `canReadTgov()`, `canWriteTgov()`, and `canCommentTgov()`.

In `web/src/lib/tgov.ts`:
- Add a new constant: `export const PRESTACAO_ONLY_ROLES = ['coord_prestacao', 'assistente_prestacao'] as const`
- These roles should initialize on the `prestacao_contas` tab (similar to how EXECUCAO_ONLY_ROLES initialize on execucao).

In `web/src/app/tgov/TGovDashboardClient.tsx`:
- Import `PRESTACAO_ONLY_ROLES` from `@/lib/tgov`.
- In the `initialTab` computation (search for `EXECUCAO_ONLY_ROLES.includes`), add a third branch: if `PRESTACAO_ONLY_ROLES.includes(userRole)` then initialTab = `'prestacao_contas'`.
- In the tab visibility logic, ensure `coord_prestacao`/`assistente_prestacao` can ONLY see the prestacao_contas tab (hide aprovacao and execucao tabs), mirroring the pattern used for APROVACAO_ONLY_ROLES and EXECUCAO_ONLY_ROLES.

In `web/src/lib/email-service.ts`:
- Add `'coord_prestacao'` and `'assistente_prestacao'` to the `TGOV_ROLES` array.

**2b) Create diligencia email template:**

In `web/src/lib/email-templates.ts`, add a new exported function:

```typescript
export function diligenciaEmail(opts: {
  nome: string           // recipient name
  numeroProposta: string // Column 1 — NR Proposta
  ministerio: string     // Ministry (orgao_superior or orgao_vinculado)
  proponente: string     // Column 4 — proponente name
  cnpj: string           // Column 3 — CNPJ
  situacao: string       // Column 5 — current situacao
  comentario: string     // The obs/comment associated with vencimento
  propostaUrl: string    // Link to /tgov?nr=...
}): { subject: string; html: string }
```

Template structure:
- heading: "Diligencia"
- paragraph: "Ola {nome}, uma proposta requer a sua atencao."
- Use the existing `propostaCard()` helper for numeroProposta + titulo (pass null for titulo since we have proponente)
- Info rows using the existing `infoRow()` helper:
  - "Numero da Proposta" -> numeroProposta
  - "Ministerio" -> ministerio
  - "Proponente" -> proponente
  - "CNPJ" -> cnpj (format with dots/slashes if 14-digit)
  - "Situacao" -> situacao
  - "Comentario" -> comentario
- CTA button: "Ver proposta" -> propostaUrl
- Subject: `Projetus — Diligencia (${opts.numeroProposta})`
- Wrap in `baseLayout('Diligencia', body)`

In `web/src/lib/email-service.ts`, add a new public function:

```typescript
export async function sendDiligenciaEmail(params: {
  recipientIds: string[]
  numeroProposta: string
  ministerio: string
  proponente: string
  cnpj: string
  situacao: string
  comentario: string
}): Promise<void>
```

This loads users by recipientIds, filters by TGOV, and sends the diligencia email to each.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Check that new roles compile and diligenciaEmail function exists in email-templates.ts</manual>
  </verify>
  <done>coord_prestacao and assistente_prestacao roles exist in type system and RBAC; diligencia email template renders proposal number, ministry, proponente, CNPJ, situacao, and comentario</done>
</task>

</tasks>

<verification>
- `cd web && npx tsc --noEmit` passes with zero errors
- `grep -n 'coord_prestacao' web/src/types/next-auth.d.ts` shows the role in all three union types
- `grep -n 'diligenciaEmail' web/src/lib/email-templates.ts` shows the exported function
- `grep -n 'DELETE FROM tgov_comments' web/src/lib/tgov-only-sync.ts` shows comment clearing logic
- `grep -n 'Tecnico' web/src/app/tgov/TGovDashboardClient.tsx` shows the new column header
</verification>

<success_criteria>
1. TypeScript compiles without errors
2. Aprovacao table shows "Tecnico" column with tecnicoNome values instead of comment count
3. tgov-only-sync clears tgov_comments when proposal transitions between major phases
4. Roles coord_prestacao and assistente_prestacao are recognized in RBAC and tab isolation
5. diligenciaEmail template generates HTML with all 6 required fields
</success_criteria>
