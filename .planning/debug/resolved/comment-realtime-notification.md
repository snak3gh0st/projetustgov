---
status: resolved
trigger: "Comentários em propostas TGov não disparam notificação de email em tempo real para os participantes."
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — Bootstrapping problem in tgov_proposta_participants: when first commenter posts, they are the only participant, so the filter (exclude commenter) yields 0 recipients. Additionally, canReadTgov excludes projetista_execucao breaking notification visibility.
test: Code trace complete.
expecting: Fix is to query actual TGov users scoped to the proposal rather than relying solely on participants.
next_action: Apply fix to sendCommentNotification to broaden notification scope

## Symptoms

expected: Quando um usuário posta um comentário numa proposta TGov, todos os participantes deveriam receber um email imediatamente (real-time, fire-and-forget) via Resend.
actual: Os comentários são salvos corretamente, mas o email de notificação não chega para os participantes.
errors: Nenhum erro visível. Comportamento silencioso.
reproduction: Postar um comentário em qualquer proposta TGov como qualquer usuário. Participantes não recebem email.
started: Não confirmado — possivelmente nunca funcionou.

## Eliminated

- hypothesis: RLS blocking queries on tgov_proposta_participants
  evidence: enable_rls_all_tables.sql confirms app connects as postgres superuser which bypasses RLS. No policies defined, but superuser is exempt.
  timestamp: 2026-04-16

- hypothesis: Fire-and-forget killed by Vercel before completing
  evidence: Next.js App Router on Node.js runtime keeps lambda alive until I/O completes. No edge runtime config on this route. Not the issue.
  timestamp: 2026-04-16

- hypothesis: Type mismatch on tgov_comments.author_id (INT vs UUID) blocking comment save
  evidence: Production DB was created from migrations/create_tgov_comments.sql which correctly defines author_id as UUID. The in-code DDL in tgov-tables.ts has INT but never applies (table already exists). Comments save correctly.
  timestamp: 2026-04-16

- hypothesis: RESEND_API_KEY or sender domain invalid
  evidence: Digest email (cron) IS working and sends successfully. Same Resend instance, same FROM address.
  timestamp: 2026-04-16

## Evidence

- timestamp: 2026-04-16
  checked: web/src/app/api/tgov/comments/route.ts POST handler
  found: sendCommentNotification is called fire-and-forget with recipientIds = all users in tgov_proposta_participants for the proposta_key. Commenter is inserted into participants BEFORE the SELECT. Tecnico is also auto-inserted if assigned.
  implication: Flow is correct IF there are other participants. The bug is that often there are none.

- timestamp: 2026-04-16
  checked: tgov_proposta_participants population sources
  found: Only 3 paths register a participant: (1) posting a comment auto-registers commenter, (2) assigning tecnico auto-registers assigner + tecnico, (3) first commenter triggers tecnico auto-insert. The /api/tgov/seen route does NOT register participants — it only updates tgov_proposta_seen.
  implication: On a fresh proposal with no tecnico assigned, posting the first comment results in participants = [commenter]. After filtering out the commenter, recipients = []. Zero emails sent.

- timestamp: 2026-04-16
  checked: email-service.ts sendCommentNotification
  found: Line 99: recipientIds.filter(id => id !== params.commenterId) then filterTgov(). If only participant IS the commenter, list becomes empty. No DB error, no log output — silent failure.
  implication: Root cause confirmed. The bootstrapping gap means notifications never fire for first comment on unassigned proposals.

- timestamp: 2026-04-16
  checked: tgov-tables.ts vs migrations/create_tgov_comments.sql
  found: tgov-tables.ts DDL has author_id INT NOT NULL. Migration has author_id UUID. This is schema drift. Since CREATE TABLE IF NOT EXISTS skips if table exists, production schema is UUID (correct). But in-code DDL is wrong.
  implication: Bug #2 — if table were ever recreated from tgov-tables.ts, author_id would be INT and INSERT would fail with type error.

- timestamp: 2026-04-16
  checked: dal.ts canReadTgov vs TGOV_ROLES in email-service.ts
  found: projetista_execucao is in TGOV_ROLES (would receive emails) but NOT in canReadTgov (cannot access TGov pages/APIs). Minor inconsistency but not the cause of the bug.
  implication: projetista_execucao would receive email notifications but couldn't view the proposals. Not critical for this bug.

## Resolution

root_cause: Bootstrapping problem in participant registration. When a user posts the first comment on a proposal with no tecnico assigned, they become the only participant. The commenter is excluded from the notification recipient list, resulting in 0 emails sent. The system was designed assuming participants exist BEFORE comments, but no mechanism registers users as participants when they first ACCESS (read) a proposal — only when they WRITE (comment) or are ASSIGNED.

fix: Modified comments route POST handler to query ALL active supervisory TGov users (adm_produto, coord_aprovacao, assistente_aprovacao, coord_execucao, assistente_execucao, gestor, admin) as additional recipients alongside tgov_proposta_participants. Uses Promise.all for parallel queries, deduplicates with Set, then passes combined list to sendCommentNotification. Also fixed schema drift: tgov-tables.ts now declares author_id as UUID NOT NULL REFERENCES users(id) matching the production migration.

verification: TypeScript type check passes (tsc --noEmit, 0 errors). Logic trace confirms: after fix, even a first comment on an unassigned proposal will notify all active supervisory users. Commenter is still excluded by sendCommentNotification line 99 filter. filterTgov() in email-service.ts passes all SQL-queried roles (all are in TGOV_ROLES).

files_changed:
  - web/src/app/api/tgov/comments/route.ts — broadened recipient collection
  - web/src/lib/tgov-tables.ts — fix author_id INT → UUID schema drift
