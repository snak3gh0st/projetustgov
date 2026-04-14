# Email System Design — Resend Transactional Emails

**Date:** 2026-04-14
**Status:** Approved

## Overview

Implement a centralized email system using the existing Resend integration to support: admin-initiated password resets, welcome emails for new users, and real-time event notifications with strict CRM/TGov isolation.

## 1. Email Service (`web/src/lib/email-service.ts`)

Centralized service with typed functions for each email type. All calls are fire-and-forget (no await at the call site) — the daily digest serves as safety net for missed notifications.

### Functions

- `sendPasswordResetEmail(user, newPassword)` — admin resets password, user receives new password by email
- `sendWelcomeEmail(user, loginUrl)` — admin creates user, user receives welcome with login link
- `sendCommentNotification(recipients[], proposta, commenter, snippet)` — new comment on proposal
- `sendSituacaoChangeNotification(recipients[], proposta, oldStatus, newStatus)` — status change
- `sendAssignmentNotification(recipients[], proposta, assignee)` — technician assignment
- `sendParticipantAddedNotification(recipient, proposta)` — added as participant

### Isolation Rules

- **TGov events** (`/api/tgov/*`) notify only TGov roles: `adm_produto`, `csm`, `coord_aprovacao`, `assistente_aprovacao`, `projetista`, `coord_execucao`, `assistente_execucao`, `projetista_execucao`
- **CRM events** (`/api/leads/*`, etc.) notify only CRM roles: `vendedor`, `coordenador`, `gestor`, `admin`, `visualizador`, `gestor_vendedor`
- Filter applied inside email service before sending
- Users with `active = false` never receive emails

### Anti-spam

- Never email the user who performed the action
- Respect `active = true` filter

### Error Handling

- Silent log on failure (console.error)
- No retry — digest is the backup

## 2. Password Reset (Admin-only)

### Flow

1. Admin opens user management panel, clicks "Resetar Senha" on a user
2. Modal opens with a password input field for the admin to type the new password
3. Admin submits → `PATCH /api/usuarios/[id]/reset-password`
4. API validates (admin/gestor role required, password >= 6 chars), hashes with bcrypt, updates `password_hash` in `users` table
5. Sends `sendPasswordResetEmail()` with the new password to the user's email
6. Returns success → toast confirmation to admin

### Security

- Only `admin` and `gestor` roles can call the endpoint
- Password minimum 6 characters
- No self-service reset — admin-only

### UI

- "Resetar Senha" button in user list (visible only to admin/gestor)
- Modal with password input + confirm button
- Confirmation dialog before submitting
- Success/error toast

## 3. Welcome Email

### Flow

1. Admin creates a new user through the existing user creation flow
2. After successful creation, system fires `sendWelcomeEmail()` automatically (fire-and-forget)
3. Email contains: user name, login email, link to /login
4. Password is NOT included in the email — admin communicates it separately

### Template Content

- Header: Projetus branding (blue banner)
- Body: "Olá [nome], sua conta foi criada no Projetus"
- Info: "Seu email de acesso: [email]"
- CTA: "Acessar o sistema" button → /login
- Footer: SigmaIntel attribution

## 4. Real-time Event Notifications

### Events and Recipients

| Event | Recipients | World |
|-------|-----------|-------|
| New comment | Proposal participants (excluding commenter) | TGov |
| Situacao change | Proposal participants | TGov |
| Technician assignment | Assigned technician + participants | TGov |
| New participant | The added participant | TGov |
| Lead comment | Lead owner (vendedor) + coordenador | CRM |
| Lead status change | Lead owner + coordenador | CRM |

### "Participants"

Uses existing `tgov_proposta_participants` table — users who have interacted with the proposal.

### Integration Points (fire-and-forget)

- `POST /api/tgov/comments` → `sendCommentNotification()`
- Route that changes situacao → `sendSituacaoChangeNotification()`
- `PATCH /api/tgov/tecnico` → `sendAssignmentNotification()`
- Insert into `tgov_proposta_participants` → `sendParticipantAddedNotification()`
- CRM lead routes → equivalent CRM notification functions

## 5. Email Templates (`web/src/lib/email-templates.ts`)

### Base Layout

Function `buildEmailLayout(title: string, bodyHtml: string): string` that wraps content in the shared layout:
- Blue header banner with Projetus branding (same style as existing digest)
- Content area
- Footer with SigmaIntel attribution

Reuses visual style from existing `digest-email.ts`.

### Templates

1. **Welcome** — "Sua conta foi criada", login email, "Acessar o sistema" button
2. **Password Reset** — "Sua senha foi alterada", new password displayed, "Acessar o sistema" button
3. **New Comment** — "[Nome] comentou na proposta [NR] - [Título]", comment snippet, "Ver proposta" button
4. **Situacao Change** — "Proposta [NR] mudou de [Status A] para [Status B]", "Ver proposta" button
5. **Technician Assignment** — "Você foi atribuído à proposta [NR]" / "[Nome] foi atribuído", "Ver proposta" button
6. **New Participant** — "Você foi adicionado à proposta [NR]", "Ver proposta" button

### Sender

`noreply@projetus.com.br` (same as existing digest, via `DIGEST_FROM_EMAIL` env var or default)

### Style

All templates use inline CSS, table-based responsive layout, no external dependencies. Consistent with existing digest template.

## 6. Database Changes

No new tables required. All existing tables are sufficient:
- `users` — has `email`, `password_hash`, `role`, `active`
- `tgov_proposta_participants` — has participant tracking
- No `password_reset_tokens` table needed (admin-only flow, no tokens)

## 7. Files to Create/Modify

### New Files
- `web/src/lib/email-service.ts` — centralized email service
- `web/src/lib/email-templates.ts` — HTML email templates + base layout
- `web/src/app/api/usuarios/[id]/reset-password/route.ts` — reset password endpoint

### Modified Files
- `web/src/lib/auth-actions.ts` — add welcome email after user creation
- `web/src/app/api/tgov/comments/route.ts` — add comment notification
- `web/src/app/api/tgov/tecnico/route.ts` — add assignment notification
- Route that changes situacao — add situacao notification
- User management UI component — add "Resetar Senha" button + modal
- CRM lead routes — add CRM notification calls
