# Quick Plan 38: Paulo vê somente Aguardando Closer + leads próprios

## Problem
`closer_id = Paulo.id` persiste em leads com status != "Aguardando Closer" (ex: Wellington "Proposta").
GET /api/leads puxa todos onde `closer_id = Paulo` sem filtrar por status → Paulo vê leads de outros SDRs indevidamente.

## Root Cause
- Query atual: `(vendedor_id = $1 OR closer_id = $1)` — sem restrição de status no closer_id
- PATCH clear logic: só limpa `closer_id` quando `comissao_locked OR status_contato = 'Aguardando Closer'` — pode falhar em edge cases

## Fix

### Task 1: Fix GET /api/leads query
**File:** `web/src/app/api/leads/route.ts`

Change condition from:
```sql
(vp.vendedor_id = $1 OR vp.closer_id = $1)
```
To:
```sql
(vp.vendedor_id = $1 OR (vp.closer_id = $1 AND vp.status_contato = 'Aguardando Closer'))
```

### Task 2: Fix PATCH closer_id cleanup
**File:** `web/src/app/api/leads/[cnpj]/route.ts`

When status changes to anything other than "Aguardando Closer" or "Fechado":
- Always clear `closer_id` if the NEW status is not "Aguardando Closer" (not conditional on comissao_locked)

Change the clear UPDATE to remove the `comissao_locked` dependency:
```sql
UPDATE vendedor_projetos
SET comissao_locked = false, comissao_valor = NULL, comissao_percentual = NULL, comissao_bonus = NULL,
    closer_comissao_percentual = NULL, closer_comissao_valor = NULL,
    closer_id = NULL
WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL)
```

### Task 3: DB cleanup
Run SQL to clear `closer_id` for leads not in "Aguardando Closer" status:
```sql
UPDATE vendedor_projetos
SET closer_id = NULL,
    closer_comissao_percentual = NULL,
    closer_comissao_valor = NULL
WHERE closer_id IS NOT NULL
  AND status_contato != 'Aguardando Closer'
  AND comissao_locked = false;
```
