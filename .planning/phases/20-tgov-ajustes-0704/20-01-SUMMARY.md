---
phase: 20-tgov-ajustes-0704
plan: 01
subsystem: database
tags: [postgres, supabase, typescript, next-auth, rls, tgov, migrations]

requires:
  - phase: 19-tgov-dashboard
    provides: tgov_propostas / tgov_projetos_execucao tables and TGov row types
provides:
  - tecnico_id (UUID FK -> users.id) on propostas, tgov_propostas, projetos_execucao, tgov_projetos_execucao
  - tgov_comments table (append-only) with RLS enabled
  - 'csm' role added to next-auth role union
  - TGovExecucaoTableRow / TGovAprovacaoTableRow extended with tecnicoId/tecnicoNome
  - Defensive ensureTgovTables coverage for tecnico_id and tgov_comments
affects: [20-02, 20-03, 20-04]

tech-stack:
  added: []
  patterns:
    - "Migrations idempotentes (IF NOT EXISTS) + defensive runtime DDL paralelo em ensureTgovTables"
    - "FK ON DELETE SET NULL para designações de técnico (preserva histórico ao desligar usuário)"

key-files:
  created:
    - migrations/add_tgov_tecnico_columns.sql
    - migrations/create_tgov_comments.sql
  modified:
    - web/src/types/next-auth.d.ts
    - web/src/lib/tgov.ts
    - web/src/lib/tgov-tables.ts

key-decisions:
  - "users.id é UUID, não INT — todas as FKs tecnico_id e tgov_comments.author_id usam UUID"
  - "tecnicoId tipado como string|null no TGov row types (UUID serializado)"
  - "tgov_comments append-only v1 (sem update/delete); RLS habilitado por consistência mas app conecta como postgres (bypass)"

patterns-established:
  - "Designação manual de técnico via FK nullable nas 4 tabelas que alimentam CTEs TGov"
  - "Defensive runtime DDL em tgov-tables.ts espelha migrations one-time"

requirements-completed: [TGOV-AJU-01-MIG, TGOV-AJU-01-TYPES]

duration: ~25min
completed: 2026-04-07
---

# Phase 20 Plan 01: Fundação SQL + Tipos TGov Summary

**Colunas tecnico_id (UUID FK) em 4 tabelas TGov, tabela tgov_comments append-only com RLS, role 'csm' no next-auth e tipos TGov estendidos com técnico**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-07
- **Tasks:** 6 (5 auto + 1 human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- 2 migrations SQL idempotentes criadas e aplicadas no Supabase com sucesso
- Coluna tecnico_id presente nas 4 tabelas (propostas, tgov_propostas, projetos_execucao, tgov_projetos_execucao), todas como UUID FK -> users(id) ON DELETE SET NULL
- Tabela tgov_comments criada (append-only, 0 rows, RLS habilitado)
- Role 'csm' aceita em todo o app via next-auth.d.ts union
- Tipos TGovExecucaoTableRow / TGovAprovacaoTableRow agora expõem tecnicoId/tecnicoNome
- ensureTgovTables atualizado com cobertura defensiva para tecnico_id e tgov_comments

## Task Commits

1. **Task 1: SQL migration add_tgov_tecnico_columns.sql** — `7e39ce6` (feat)
2. **Task 2: SQL migration create_tgov_comments.sql** — `7e39ce6` (feat, mesmo commit)
3. **Task 3: 'csm' no role union** — `7ee6bf5` (feat)
4. **Task 4: Tipos TGov com tecnicoId/tecnicoNome** — `3645795` (feat)
5. **Task 5: ensureTgovTables defensivo** — `8cc5729` (feat)
6. **Task 6: Aplicar migrations no Supabase** — verificado pelo usuário; correção UUID em `fe6501b` (fix)

## Files Created/Modified

- `migrations/add_tgov_tecnico_columns.sql` — 4 ALTER TABLE + 4 indexes parciais (UUID FK)
- `migrations/create_tgov_comments.sql` — CREATE TABLE tgov_comments + 2 indexes + ENABLE RLS (author_id UUID)
- `web/src/types/next-auth.d.ts` — adicionado `'csm'` nas 3 declarações de union
- `web/src/lib/tgov.ts` — `tecnicoId: string | null` e `tecnicoNome: string | null` em TGovExecucaoTableRow / TGovAprovacaoTableRow
- `web/src/lib/tgov-tables.ts` — ALTER TABLE defensivo para tecnico_id em tgov_propostas/tgov_projetos_execucao + CREATE TABLE tgov_comments

## Decisions Made

- **users.id é UUID, não INT (descoberto na verificação):** Todas as FKs (tecnico_id em 4 tabelas + tgov_comments.author_id) foram convertidas para UUID. Tipo TS de tecnicoId mudado de `number` para `string`.
- Append-only para tgov_comments na v1: edição/deleção ficam fora de escopo (deferido).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] users.id é UUID, não INT — corrigido tipo das FKs e do TS**
- **Found during:** Task 6 (verificação manual no Supabase)
- **Issue:** Plano assumia `users.id INT`. Schema real é UUID — aplicar a migration original teria falhado com type mismatch na FK.
- **Fix:**
  - `migrations/add_tgov_tecnico_columns.sql`: trocado `INT REFERENCES users(id)` por `UUID REFERENCES users(id)` nas 4 ALTER TABLE.
  - `migrations/create_tgov_comments.sql`: `author_id UUID NOT NULL REFERENCES users(id)`.
  - `web/src/lib/tgov.ts`: `tecnicoId: string | null` (UUID serializa como string).
  - `web/src/lib/tgov-tables.ts`: `tecnico_id UUID` e `author_id UUID` no DDL defensivo.
- **Files modified:** migrations/add_tgov_tecnico_columns.sql, migrations/create_tgov_comments.sql, web/src/lib/tgov.ts, web/src/lib/tgov-tables.ts
- **Verification:** Migrations rodaram sem erro; query `information_schema.columns` retornou as 4 colunas tecnico_id; `SELECT COUNT(*) FROM tgov_comments` retornou 0.
- **Committed in:** `fe6501b`

---

**Total deviations:** 1 auto-fixed (Rule 1 — schema mismatch)
**Impact on plan:** Fix essencial — sem ele as migrations falhariam. Sem scope creep. Plans 02/03/04 devem assumir `tecnicoId: string` (UUID).

## Issues Encountered

- Schema real do `users.id` (UUID) divergia da suposição do plano (INT). Resolvido inline na verificação humana antes de aplicar as migrations.

## Next Phase Readiness

- Plans 02 (RBAC helpers + 'csm'), 03 (endpoints com join de técnico) e 04 (UI sidecard com comments + designação) podem prosseguir.
- **Importante para Plan 03:** o JOIN em `users` deve usar UUID; o endpoint deve serializar `tecnico_id` como string.
- **Importante para Plan 02:** helpers RBAC podem assumir role 'csm' tipado.

## Self-Check: PASSED

- migrations/add_tgov_tecnico_columns.sql: FOUND
- migrations/create_tgov_comments.sql: FOUND
- web/src/types/next-auth.d.ts: FOUND
- web/src/lib/tgov.ts: FOUND
- web/src/lib/tgov-tables.ts: FOUND
- Commits 7e39ce6, 7ee6bf5, 3645795, 8cc5729, fe6501b: FOUND

---
*Phase: 20-tgov-ajustes-0704*
*Completed: 2026-04-07*
