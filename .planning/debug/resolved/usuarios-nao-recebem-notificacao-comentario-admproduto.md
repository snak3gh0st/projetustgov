---
status: resolved
trigger: "Usuários abaixo do ADMPRODUTO (tecnico, projetista, coord, etc.) não recebem notificação no sino quando ADMPRODUTO comenta em uma proposta TGov"
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: Non-seeAll roles never get linked to proposals via the notification query unless they personally commented or are tecnico_id in tgov_propostas. coord/assistente roles have no mechanism to receive notifications for proposals they supervise. Also, tecnico_id from propostas (CRM) table is not registered as participant when ADMPRODUTO comments.
test: Code path analysis completed — no test needed, mechanism is confirmed by code reading
expecting: Fix confirmed
next_action: Apply fix to notifications/route.ts and comments/route.ts

## Symptoms

expected: Quando ADMPRODUTO comenta numa proposta, todos os usuários vinculados a essa proposta devem receber notificação
actual: Usuários que não são ADMPRODUTO não veem notificação do comentário do ADMPRODUTO
errors: Nenhum erro
reproduction: ADMPRODUTO comenta numa proposta → outros usuários verificam sino → nada

## Eliminated

- hypothesis: Problem is in NotificationBell.tsx or frontend component
  evidence: Issue is clearly in notifications/route.ts — the linked CTE for non-seeAll roles is too narrow
  timestamp: 2026-04-10

## Evidence

- timestamp: 2026-04-10
  checked: notifications/route.ts — linked CTE for non-seeAll
  found: |
    Only two ways a non-seeAll user appears in `linked`:
    1. They have a row in tgov_proposta_participants for that proposta_key
    2. They are tecnico_id in tgov_propostas (NOT propostas/CRM)
  implication: coord_aprovacao, assistente_aprovacao, coord_execucao, assistente_execucao who never commented and are not tecnico are permanently excluded

- timestamp: 2026-04-10
  checked: comments/route.ts — POST participant registration
  found: |
    When ADMPRODUTO comments, two INSERTs happen:
    1. ADMPRODUTO added to tgov_proposta_participants ✓
    2. tecnico_id from tgov_propostas added to participants ✓
    Missing: tecnico_id from propostas (CRM table) is NOT looked up
  implication: Proposals that live only in `propostas` table (not tgov_propostas) never get their tecnico notified

- timestamp: 2026-04-10
  checked: dal.ts — role definitions
  found: |
    canReadTgov includes: coord_aprovacao, assistente_aprovacao, projetista, coord_execucao, assistente_execucao, projetista_execucao
    seeAll in notifications is ONLY adm_produto
    coord/assistente roles see all proposals in aprovacao/execucao scope via those route queries, but not for notifications
  implication: coord_aprovacao etc. should probably see notifications for ALL proposals they can access (similar to adm_produto), or at minimum those in their scope

## Resolution

root_cause: |
  Two compounding problems:
  1. comments/route.ts POST only looks for tecnico_id in tgov_propostas, missing tecnico_id in propostas (CRM) table — so CRM-based proposals never add their tecnico as participant
  2. notifications/route.ts linked CTE for non-seeAll roles only covers: (a) explicit participants, (b) tecnico_id in tgov_propostas. coord_aprovacao, assistente_aprovacao, coord_execucao, assistente_execucao have supervisory access to ALL proposals in scope but no mechanism to get notifications for proposals they've never interacted with

fix: |
  1. comments/route.ts: Add second INSERT to also register tecnico_id from `propostas` (CRM) when target_type = 'proposta'
  2. notifications/route.ts: Extend seeAll to include coord_aprovacao, assistente_aprovacao, coord_execucao, assistente_execucao (they already see all proposals in their scope, so they should receive all notifications too)
  OR alternatively: add a third branch to linked CTE that includes proposals from propostas where tecnico_id = $1
verification: |
  Code path verified by static analysis:
  1. seeAll now true for coord_aprovacao, assistente_aprovacao, coord_execucao, assistente_execucao
     → these roles see ALL proposals in the linked CTE, same as adm_produto
  2. linked CTE non-seeAll path now has 3 branches: participants + tgov_propostas tecnico + propostas tecnico
     → projetista/projetista_execucao will see notifications even when assigned via CRM table
  3. comments POST now also registers tecnico from propostas (CRM) as participant
     → when ADMPRODUTO comments on CRM-stored proposal, assigned tecnico is notified
files_changed:
  - web/src/app/api/tgov/notifications/route.ts
  - web/src/app/api/tgov/comments/route.ts
