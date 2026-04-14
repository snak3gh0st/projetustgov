# Email System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centralized email system using Resend for password resets (admin-only), welcome emails, and real-time event notifications, with strict CRM/TGov role isolation.

**Architecture:** Fire-and-forget centralized `email-service.ts` with reusable HTML templates in `email-templates.ts`. Each event handler in existing API routes calls the service without awaiting (daily digest remains as safety net). Admin UI in existing user cadastro page adds a "Resetar Senha" button.

**Tech Stack:** Next.js 14+ (App Router), NextAuth v5, Resend SDK (already installed), bcryptjs, pg, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-14-email-system-design.md`

**Pre-flight notes:**
- No test infrastructure in project — verification via `npm run build` / `tsc --noEmit` + manual test via dev server
- Production DB: `sigmadb` (NOT Supabase — see memory)
- `RESEND_API_KEY` already in Vercel production env
- `DIGEST_FROM_EMAIL` defaults to `noreply@projetus.com.br`

---

## File Structure

**New files:**
- `web/src/lib/email-service.ts` — centralized send functions with role filtering
- `web/src/lib/email-templates.ts` — HTML templates + shared layout
- `web/src/app/api/usuarios/[id]/reset-password/route.ts` — admin reset endpoint

**Modified files:**
- `web/src/lib/auth-actions.ts` — call welcome email after user creation
- `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx` — add reset password button + modal
- `web/src/app/api/tgov/comments/route.ts` — fire comment notification
- `web/src/app/api/tgov/tecnico/route.ts` — fire assignment notification
- `web/src/app/api/tgov/aprovacao/route.ts` — fire situacao notification (and participant tracking)

**CRM events:** Deferred to Wave 5 — CRM lead comment/status routes TBD once TGov waves prove the pattern works.

---

## Wave 1 — Email Foundation

### Task 1: Create email templates module

**Files:**
- Create: `web/src/lib/email-templates.ts`

- [ ] **Step 1: Create the templates file**

```typescript
// web/src/lib/email-templates.ts
// Shared HTML email layout + template builders.
// All styles inline for email client compatibility.

const BRAND_BLUE = '#2563eb'
const TEXT_DARK = '#111827'
const TEXT_MUTED = '#6b7280'
const BORDER = '#e5e7eb'

function baseLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:${TEXT_DARK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
          <tr>
            <td style="background:${BRAND_BLUE};padding:20px 24px;color:#ffffff;font-size:18px;font-weight:600;">
              Projetus
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:14px;line-height:1.6;color:${TEXT_DARK};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid ${BORDER};font-size:12px;color:${TEXT_MUTED};text-align:center;">
              SigmaIntel — Projetus CRM &amp; TGov
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${escapeHtml(href)}" style="background:${BRAND_BLUE};color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
      ${escapeHtml(label)}
    </a>
  </p>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ——— Template: Welcome ———
export function welcomeEmail(opts: { nome: string; email: string; loginUrl: string }): { subject: string; html: string } {
  const body = `
    <p>Olá ${escapeHtml(opts.nome)},</p>
    <p>Sua conta no Projetus foi criada.</p>
    <p><strong>Seu email de acesso:</strong> ${escapeHtml(opts.email)}</p>
    <p>A senha foi definida pelo administrador e deve ter sido comunicada separadamente.</p>
    ${button(opts.loginUrl, 'Acessar o sistema')}
  `
  return { subject: 'Projetus — Sua conta foi criada', html: baseLayout('Bem-vindo ao Projetus', body) }
}

// ——— Template: Password Reset ———
export function passwordResetEmail(opts: { nome: string; newPassword: string; loginUrl: string }): { subject: string; html: string } {
  const body = `
    <p>Olá ${escapeHtml(opts.nome)},</p>
    <p>Sua senha no Projetus foi alterada por um administrador.</p>
    <p><strong>Nova senha:</strong> <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;font-family:monospace;">${escapeHtml(opts.newPassword)}</code></p>
    <p>Recomendamos que você faça login e troque para uma senha pessoal assim que possível.</p>
    ${button(opts.loginUrl, 'Acessar o sistema')}
  `
  return { subject: 'Projetus — Sua senha foi alterada', html: baseLayout('Senha alterada', body) }
}

// ——— Template: New Comment ———
export function commentNotificationEmail(opts: {
  nome: string
  commenterName: string
  propostaNr: string
  propostaTitulo: string | null
  snippet: string
  propostaUrl: string
}): { subject: string; html: string } {
  const titulo = opts.propostaTitulo ? ` — ${escapeHtml(opts.propostaTitulo)}` : ''
  const body = `
    <p>Olá ${escapeHtml(opts.nome)},</p>
    <p><strong>${escapeHtml(opts.commenterName)}</strong> comentou na proposta <strong>${escapeHtml(opts.propostaNr)}</strong>${titulo}:</p>
    <blockquote style="border-left:3px solid ${BRAND_BLUE};padding:8px 12px;margin:12px 0;color:${TEXT_MUTED};">
      ${escapeHtml(opts.snippet)}
    </blockquote>
    ${button(opts.propostaUrl, 'Ver proposta')}
  `
  return { subject: `Projetus — Novo comentário na proposta ${opts.propostaNr}`, html: baseLayout('Novo comentário', body) }
}

// ——— Template: Situacao Change ———
export function situacaoChangeEmail(opts: {
  nome: string
  propostaNr: string
  propostaTitulo: string | null
  oldStatus: string
  newStatus: string
  propostaUrl: string
}): { subject: string; html: string } {
  const titulo = opts.propostaTitulo ? ` — ${escapeHtml(opts.propostaTitulo)}` : ''
  const body = `
    <p>Olá ${escapeHtml(opts.nome)},</p>
    <p>A proposta <strong>${escapeHtml(opts.propostaNr)}</strong>${titulo} mudou de situação:</p>
    <p><strong>De:</strong> ${escapeHtml(opts.oldStatus)}<br><strong>Para:</strong> ${escapeHtml(opts.newStatus)}</p>
    ${button(opts.propostaUrl, 'Ver proposta')}
  `
  return { subject: `Projetus — Situação atualizada (${opts.propostaNr})`, html: baseLayout('Situação atualizada', body) }
}

// ——— Template: Assignment ———
export function assignmentEmail(opts: {
  nome: string
  assigneeName: string
  isAssignee: boolean
  propostaNr: string
  propostaTitulo: string | null
  propostaUrl: string
}): { subject: string; html: string } {
  const titulo = opts.propostaTitulo ? ` — ${escapeHtml(opts.propostaTitulo)}` : ''
  const lead = opts.isAssignee
    ? `Você foi atribuído à proposta <strong>${escapeHtml(opts.propostaNr)}</strong>${titulo}.`
    : `<strong>${escapeHtml(opts.assigneeName)}</strong> foi atribuído à proposta <strong>${escapeHtml(opts.propostaNr)}</strong>${titulo}.`
  const body = `
    <p>Olá ${escapeHtml(opts.nome)},</p>
    <p>${lead}</p>
    ${button(opts.propostaUrl, 'Ver proposta')}
  `
  return { subject: `Projetus — Técnico atribuído (${opts.propostaNr})`, html: baseLayout('Técnico atribuído', body) }
}

// ——— Template: Participant Added ———
export function participantAddedEmail(opts: {
  nome: string
  propostaNr: string
  propostaTitulo: string | null
  propostaUrl: string
}): { subject: string; html: string } {
  const titulo = opts.propostaTitulo ? ` — ${escapeHtml(opts.propostaTitulo)}` : ''
  const body = `
    <p>Olá ${escapeHtml(opts.nome)},</p>
    <p>Você foi adicionado como participante da proposta <strong>${escapeHtml(opts.propostaNr)}</strong>${titulo}.</p>
    <p>A partir de agora você receberá notificações sobre atualizações nessa proposta.</p>
    ${button(opts.propostaUrl, 'Ver proposta')}
  `
  return { subject: `Projetus — Você foi adicionado à proposta ${opts.propostaNr}`, html: baseLayout('Novo participante', body) }
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/lib/email-templates.ts
git commit -m "feat(email): add HTML email templates with shared layout"
```

---

### Task 2: Create email service

**Files:**
- Create: `web/src/lib/email-service.ts`

- [ ] **Step 1: Create the service file**

```typescript
// web/src/lib/email-service.ts
// Centralized email dispatcher. All sends are fire-and-forget from callers —
// failures are logged but do not block API responses. Daily digest is the safety net.

import { query } from './db'
import {
  welcomeEmail,
  passwordResetEmail,
  commentNotificationEmail,
  situacaoChangeEmail,
  assignmentEmail,
  participantAddedEmail,
} from './email-templates'

const FROM = process.env.DIGEST_FROM_EMAIL || 'noreply@projetus.com.br'

const TGOV_ROLES = [
  'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao',
  'projetista', 'coord_execucao', 'assistente_execucao', 'projetista_execucao',
  'gestor', 'admin', // gestor/admin see both worlds
]

const CRM_ROLES = [
  'vendedor', 'coordenador', 'visualizador', 'gestor_vendedor',
  'gestor', 'admin',
]

function appUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://projetus.sigmaintel.com.br'
}

async function getResend() {
  const { Resend } = await import('resend')
  return new Resend(process.env.RESEND_API_KEY)
}

async function sendOne(to: string, subject: string, html: string): Promise<void> {
  try {
    const resend = await getResend()
    await resend.emails.send({ from: FROM, to, subject, html })
  } catch (err) {
    console.error('[email-service] send failed', { to, subject, err })
  }
}

interface UserRow {
  id: string
  nome: string
  email: string
  role: string
  active: boolean
}

async function loadUsers(ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return []
  return query<UserRow>(
    `SELECT id, nome, email, role, active FROM users WHERE id = ANY($1::uuid[]) AND active = true AND email IS NOT NULL`,
    [ids],
  )
}

function filterTgov(users: UserRow[]): UserRow[] {
  return users.filter(u => TGOV_ROLES.includes(u.role))
}

function filterCrm(users: UserRow[]): UserRow[] {
  return users.filter(u => CRM_ROLES.includes(u.role))
}

// ——— Public API ———

export async function sendWelcomeEmail(params: { nome: string; email: string }): Promise<void> {
  const { subject, html } = welcomeEmail({
    nome: params.nome,
    email: params.email,
    loginUrl: `${appUrl()}/login`,
  })
  await sendOne(params.email, subject, html)
}

export async function sendPasswordResetEmail(params: { nome: string; email: string; newPassword: string }): Promise<void> {
  const { subject, html } = passwordResetEmail({
    nome: params.nome,
    newPassword: params.newPassword,
    loginUrl: `${appUrl()}/login`,
  })
  await sendOne(params.email, subject, html)
}

export async function sendCommentNotification(params: {
  recipientIds: string[]
  commenterId: string
  commenterName: string
  propostaNr: string
  propostaTitulo: string | null
  snippet: string
}): Promise<void> {
  const users = filterTgov(await loadUsers(params.recipientIds.filter(id => id !== params.commenterId)))
  const propostaUrl = `${appUrl()}/tgov?nr=${encodeURIComponent(params.propostaNr)}`
  const snippet = params.snippet.length > 200 ? params.snippet.slice(0, 200) + '…' : params.snippet

  for (const u of users) {
    const { subject, html } = commentNotificationEmail({
      nome: u.nome,
      commenterName: params.commenterName,
      propostaNr: params.propostaNr,
      propostaTitulo: params.propostaTitulo,
      snippet,
      propostaUrl,
    })
    await sendOne(u.email, subject, html)
  }
}

export async function sendSituacaoChangeNotification(params: {
  recipientIds: string[]
  actorId: string
  propostaNr: string
  propostaTitulo: string | null
  oldStatus: string
  newStatus: string
}): Promise<void> {
  const users = filterTgov(await loadUsers(params.recipientIds.filter(id => id !== params.actorId)))
  const propostaUrl = `${appUrl()}/tgov?nr=${encodeURIComponent(params.propostaNr)}`

  for (const u of users) {
    const { subject, html } = situacaoChangeEmail({
      nome: u.nome,
      propostaNr: params.propostaNr,
      propostaTitulo: params.propostaTitulo,
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      propostaUrl,
    })
    await sendOne(u.email, subject, html)
  }
}

export async function sendAssignmentNotification(params: {
  recipientIds: string[]
  actorId: string
  assigneeId: string
  assigneeName: string
  propostaNr: string
  propostaTitulo: string | null
}): Promise<void> {
  const users = filterTgov(await loadUsers(params.recipientIds.filter(id => id !== params.actorId)))
  const propostaUrl = `${appUrl()}/tgov?nr=${encodeURIComponent(params.propostaNr)}`

  for (const u of users) {
    const { subject, html } = assignmentEmail({
      nome: u.nome,
      assigneeName: params.assigneeName,
      isAssignee: u.id === params.assigneeId,
      propostaNr: params.propostaNr,
      propostaTitulo: params.propostaTitulo,
      propostaUrl,
    })
    await sendOne(u.email, subject, html)
  }
}

export async function sendParticipantAddedNotification(params: {
  recipientId: string
  actorId: string
  propostaNr: string
  propostaTitulo: string | null
}): Promise<void> {
  if (params.recipientId === params.actorId) return
  const users = filterTgov(await loadUsers([params.recipientId]))
  const u = users[0]
  if (!u) return
  const propostaUrl = `${appUrl()}/tgov?nr=${encodeURIComponent(params.propostaNr)}`
  const { subject, html } = participantAddedEmail({
    nome: u.nome,
    propostaNr: params.propostaNr,
    propostaTitulo: params.propostaTitulo,
    propostaUrl,
  })
  await sendOne(u.email, subject, html)
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/lib/email-service.ts
git commit -m "feat(email): add centralized email service with role isolation"
```

---

## Wave 2 — Password Reset (Admin-only)

### Task 3: Create reset-password API route

**Files:**
- Create: `web/src/app/api/usuarios/[id]/reset-password/route.ts`

- [ ] **Step 1: Inspect existing user role endpoint to follow same auth pattern**

Run: `cat web/src/app/api/usuarios/\[id\]/role/route.ts | head -40`
(Reference only — to match auth guard pattern.)

- [ ] **Step 2: Create the route**

```typescript
// web/src/app/api/usuarios/[id]/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { auth } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email-service'

export const dynamic = 'force-dynamic'

const ALLOWED_ACTOR_ROLES = ['admin', 'gestor']

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || !('role' in session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const actorRole = (session.user as { role?: string }).role
    if (!actorRole || !ALLOWED_ACTOR_ROLES.includes(actorRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await ctx.params
    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const { password } = payload as { password?: string }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Senha excede 200 caracteres' }, { status: 400 })
    }

    const users = await query<{ id: string; nome: string; email: string; active: boolean }>(
      `SELECT id, nome, email, active FROM users WHERE id = $1`,
      [id],
    )
    const target = users[0]
    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const hash = await bcrypt.hash(password, 10)
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, id])

    console.log('[reset-password] actor=%s target=%s', (session.user as { id?: string }).id, id)

    // Fire-and-forget email
    sendPasswordResetEmail({ nome: target.nome, email: target.email, newPassword: password })
      .catch(err => console.error('[reset-password] email failed', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reset-password] error', err)
    return NextResponse.json({ error: 'Falha ao resetar senha' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/app/api/usuarios/\[id\]/reset-password/route.ts
git commit -m "feat(usuarios): add admin-only reset-password API route"
```

---

### Task 4: Add "Resetar Senha" UI to cadastro-vendedor page

**Files:**
- Modify: `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx`

- [ ] **Step 1: Read the current usuarios list render**

Run: `grep -n "Usuario\|usuarios\|map\|button" web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx | head -40`

Locate where each user row renders its action buttons (digest toggle, role select). We'll add the "Resetar Senha" button alongside these, visible only when the current actor is admin or gestor.

- [ ] **Step 2: Add a reset-password modal component at the top of the same file**

Add this inside the same client file, above the main exported component:

```typescript
function ResetPasswordModal({
  user,
  onClose,
  onSuccess,
}: {
  user: { id: string; nome: string; email: string }
  onClose: () => void
  onSuccess: () => void
}) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres')
      return
    }
    if (!confirm(`Confirma resetar a senha de ${user.nome}? Um email com a nova senha será enviado.`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/usuarios/${user.id}/reset-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Falha ao resetar senha')
        setSubmitting(false)
        return
      }
      onSuccess()
    } catch (err) {
      setError('Erro de rede')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <form onSubmit={handleSubmit} style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 360, maxWidth: 480 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Resetar senha</h3>
        <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#6b7280' }}>
          Usuário: <strong>{user.nome}</strong> ({user.email})
        </p>
        <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Nova senha</label>
        <input
          type="text"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          autoFocus
          style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 14 }}
        />
        {error && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</p>}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={submitting} style={{ padding: '8px 16px', fontSize: 13 }}>Cancelar</button>
          <button type="submit" disabled={submitting || password.length < 6} style={{ padding: '8px 16px', fontSize: 13, background: '#2563eb', color: 'white', borderRadius: 6, border: 'none' }}>
            {submitting ? 'Enviando…' : 'Confirmar reset'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Add state + button in the main component**

Inside the main component function, add:

```typescript
const [resetTarget, setResetTarget] = useState<{ id: string; nome: string; email: string } | null>(null)
const [resetToast, setResetToast] = useState<string | null>(null)
```

Find the actor role detection (look for `is_self` or role-based logic). You need `currentActorRole` to gate the button. If the component already receives session info, use it. Otherwise add a prop or a fetch to `/api/auth/session`. For simplest integration, check if existing code already passes the actor role — if yes, reuse; if not, derive from `usuarios.find(u => u.is_self)?.role`.

Render the button within each user row's actions (adjacent to existing buttons), guarded by actor role:

```tsx
{(currentActorRole === 'admin' || currentActorRole === 'gestor') && !u.is_self && (
  <button
    type="button"
    onClick={() => setResetTarget({ id: u.id, nome: u.nome, email: u.email })}
    style={{ padding: '4px 8px', fontSize: 12, background: '#fef3c7', color: '#92400e', borderRadius: 4, border: '1px solid #fde68a' }}
  >
    Resetar senha
  </button>
)}
```

At the end of the component's return, before closing the wrapper:

```tsx
{resetTarget && (
  <ResetPasswordModal
    user={resetTarget}
    onClose={() => setResetTarget(null)}
    onSuccess={() => {
      setResetTarget(null)
      setResetToast(`Senha resetada. Email enviado para ${resetTarget.email}.`)
      setTimeout(() => setResetToast(null), 4000)
    }}
  />
)}
{resetToast && (
  <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#16a34a', color: 'white', padding: '10px 14px', borderRadius: 6, fontSize: 13, zIndex: 60 }}>
    {resetToast}
  </div>
)}
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual test via dev server**

Run: `cd web && npm run dev`
- Log in as `admin` or `gestor`
- Open `/cadastro-vendedor`
- Click "Resetar senha" on any other user
- Enter a test password (e.g., `test1234`) → confirm
- Verify toast appears, verify email arrived at user's inbox, verify user can log in with new password

- [ ] **Step 6: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx
git commit -m "feat(usuarios): add admin reset password button + modal"
```

---

## Wave 3 — Welcome Email

### Task 5: Fire welcome email after user creation

**Files:**
- Modify: `web/src/lib/auth-actions.ts`

- [ ] **Step 1: Import email service at top**

Add to imports block at top of `web/src/lib/auth-actions.ts`:

```typescript
import { sendWelcomeEmail } from './email-service'
```

- [ ] **Step 2: Fire welcome email in createVendedor**

In `createVendedor`, after the successful INSERT (right after line `[validatedData.nome, validatedData.email, passwordHash, 'vendedor']`), before `return { success: true }`, add:

```typescript
// Fire-and-forget welcome email
sendWelcomeEmail({ nome: validatedData.nome, email: validatedData.email })
  .catch(err => console.error('[createVendedor] welcome email failed', err))
```

- [ ] **Step 3: Fire welcome email in createUsuario**

In `createUsuario`, same location (after the INSERT, before `return { success: true }`), add:

```typescript
// Fire-and-forget welcome email
sendWelcomeEmail({ nome: validatedData.nome, email: validatedData.email })
  .catch(err => console.error('[createUsuario] welcome email failed', err))
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual test**

Run: `cd web && npm run dev`
- Log in as admin/gestor
- Create a new test user
- Verify welcome email arrives at the new user's email with login URL

- [ ] **Step 6: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/lib/auth-actions.ts
git commit -m "feat(email): send welcome email on user creation"
```

---

## Wave 4 — TGov Real-time Event Notifications

### Task 6: Comment notification

**Files:**
- Modify: `web/src/app/api/tgov/comments/route.ts`

- [ ] **Step 1: Import email service**

Add at top of file (after existing imports):

```typescript
import { sendCommentNotification } from '@/lib/email-service'
```

- [ ] **Step 2: After successful INSERT, fire the notification**

Locate the section after the author name is fetched (`const authorRows = await query...`) and before the final `return NextResponse.json(...)` for a successful POST.

Insert this block between the author lookup and the return:

```typescript
    // Gather recipients (participants + tecnico) — only for proposta comments
    if (target_type === 'proposta') {
      try {
        const participants = await query<{ user_id: string }>(
          `SELECT user_id FROM tgov_proposta_participants WHERE proposta_key = $1`,
          [target_key],
        )
        const propostaMeta = await query<{ titulo: string | null }>(
          `SELECT titulo FROM tgov_propostas WHERE nr_proposta = $1
           UNION ALL
           SELECT NULL AS titulo FROM propostas WHERE nr_proposta = $1
           LIMIT 1`,
          [target_key],
        )
        const recipientIds = participants.map(p => p.user_id)

        sendCommentNotification({
          recipientIds,
          commenterId: session.userId,
          commenterName: authorRows[0]?.nome ?? 'Alguém',
          propostaNr: target_key,
          propostaTitulo: propostaMeta[0]?.titulo ?? null,
          snippet: text.trim(),
        }).catch(err => console.error('[comments] notification failed', err))
      } catch (err) {
        console.error('[comments] recipient gather failed', err)
      }
    }
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual test**

Run: `cd web && npm run dev`
- Log in as a TGov user (e.g., `adm_produto`)
- Add a comment on a proposal that has other participants
- Verify other participants receive an email (not the commenter themselves)
- Verify CRM users do NOT receive emails even if accidentally in participants list

- [ ] **Step 5: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/app/api/tgov/comments/route.ts
git commit -m "feat(tgov/comments): send email notification on new comment"
```

---

### Task 7: Technician assignment notification

**Files:**
- Modify: `web/src/app/api/tgov/tecnico/route.ts`

- [ ] **Step 1: Read the full route to understand the update flow**

Run: `cat web/src/app/api/tgov/tecnico/route.ts`

Identify where the UPDATE sets `tecnico_id` (and `tecnico_assigned_at`). We fire the notification after the UPDATE succeeds and before the response is returned.

- [ ] **Step 2: Import email service**

Add at top of file:

```typescript
import { sendAssignmentNotification } from '@/lib/email-service'
```

- [ ] **Step 3: Fire notification after successful assignment**

After the UPDATE that sets `tecnico_id` (and before the return), add:

```typescript
    if (tecnicoIdValue && target_type === 'proposta') {
      try {
        const assignees = await query<{ nome: string }>(
          `SELECT nome FROM users WHERE id = $1`,
          [tecnicoIdValue],
        )
        const participants = await query<{ user_id: string }>(
          `SELECT user_id FROM tgov_proposta_participants WHERE proposta_key = $1`,
          [target_key],
        )
        const propostaMeta = await query<{ titulo: string | null }>(
          `SELECT titulo FROM tgov_propostas WHERE nr_proposta = $1 LIMIT 1`,
          [target_key],
        )
        const recipientIds = Array.from(new Set([tecnicoIdValue, ...participants.map(p => p.user_id)]))

        sendAssignmentNotification({
          recipientIds,
          actorId: session.userId,
          assigneeId: tecnicoIdValue,
          assigneeName: assignees[0]?.nome ?? 'Técnico',
          propostaNr: target_key,
          propostaTitulo: propostaMeta[0]?.titulo ?? null,
        }).catch(err => console.error('[tecnico] notification failed', err))
      } catch (err) {
        console.error('[tecnico] recipient gather failed', err)
      }
    }
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual test**

Run: `cd web && npm run dev`
- Log in as `adm_produto`
- Assign a technician to a proposal
- Verify: assigned technician receives an email (with "Você foi atribuído")
- Verify: other participants receive an email (with "[Nome] foi atribuído")
- Verify: actor does not receive email

- [ ] **Step 6: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/app/api/tgov/tecnico/route.ts
git commit -m "feat(tgov/tecnico): send email notification on technician assignment"
```

---

### Task 8: Situacao change notification

**Files:**
- Modify: `web/src/app/api/tgov/aprovacao/route.ts`

- [ ] **Step 1: Read the full route and find the situacao update**

Run: `cat web/src/app/api/tgov/aprovacao/route.ts`

Locate the UPDATE statement that changes `situacao` (and sets `situacao_changed_at`). We need to:
1. Capture the OLD situacao value before the UPDATE
2. Fire the notification AFTER the UPDATE succeeds

If the route has multiple code paths that change situacao, instrument each one.

- [ ] **Step 2: Import email service**

Add at top of file:

```typescript
import { sendSituacaoChangeNotification } from '@/lib/email-service'
```

- [ ] **Step 3: Wrap situacao change with before/after capture**

For each code path that updates `situacao`:

```typescript
    // Before UPDATE: capture old situacao
    const before = await query<{ situacao: string | null; titulo: string | null; nr_proposta: string }>(
      `SELECT situacao, titulo, nr_proposta FROM tgov_propostas WHERE nr_proposta = $1 LIMIT 1`,
      [propostaKey], // replace with the actual variable name used in the route
    )
    const oldSituacao = before[0]?.situacao ?? '—'
    const titulo = before[0]?.titulo ?? null

    // ... existing UPDATE statement ...

    // After UPDATE: fire notification if situacao actually changed
    if (newSituacao && newSituacao !== oldSituacao) {
      try {
        const participants = await query<{ user_id: string }>(
          `SELECT user_id FROM tgov_proposta_participants WHERE proposta_key = $1`,
          [propostaKey],
        )
        sendSituacaoChangeNotification({
          recipientIds: participants.map(p => p.user_id),
          actorId: session.userId,
          propostaNr: propostaKey,
          propostaTitulo: titulo,
          oldStatus: oldSituacao,
          newStatus: newSituacao,
        }).catch(err => console.error('[aprovacao] notification failed', err))
      } catch (err) {
        console.error('[aprovacao] recipient gather failed', err)
      }
    }
```

**Note:** The exact variable names (`propostaKey`, `newSituacao`, `session.userId`) must match what the route already uses. Read the file first and adapt.

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual test**

Run: `cd web && npm run dev`
- Log in as `coord_aprovacao`
- Change the situation of a proposal
- Verify participants receive an email with old and new status
- Change to the same status: verify NO email is sent

- [ ] **Step 6: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/app/api/tgov/aprovacao/route.ts
git commit -m "feat(tgov/aprovacao): send email notification on situacao change"
```

---

### Task 9: Participant added notification

**Files:**
- Modify: `web/src/app/api/tgov/comments/route.ts` (participant inserts happen here)
- Modify: `web/src/app/api/tgov/tecnico/route.ts` (tecnico assignment also creates participant)

- [ ] **Step 1: Identify where new participants are inserted**

The comments route auto-registers commenter + tecnico as participants. The tecnico route assignment also effectively makes the tecnico a participant.

We want to notify ONLY when someone is added as a participant **by another user's action** — not when they register themselves.

In `web/src/app/api/tgov/comments/route.ts`, the tecnico auto-registration in the `if (target_type === 'proposta')` block is the case. Wrap the INSERT to capture when a new row was inserted (use `RETURNING` + check row count) and fire the notification.

- [ ] **Step 2: Replace the participant inserts with RETURNING**

In `web/src/app/api/tgov/comments/route.ts`, replace the two existing participant INSERTs (for `tgov_propostas` and `propostas` tables) with versions that return the inserted user_id:

```typescript
    if (target_type === 'proposta') {
      const addedFromTgov = await query<{ user_id: string }>(
        `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
         SELECT tecnico_id, $1
         FROM tgov_propostas
         WHERE nr_proposta = $1 AND tecnico_id IS NOT NULL AND tecnico_id <> $2
         ON CONFLICT DO NOTHING
         RETURNING user_id`,
        [target_key, session.userId],
      )
      const addedFromCrm = await query<{ user_id: string }>(
        `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
         SELECT tecnico_id, $1
         FROM propostas
         WHERE nr_proposta = $1 AND tecnico_id IS NOT NULL AND tecnico_id <> $2
         ON CONFLICT DO NOTHING
         RETURNING user_id`,
        [target_key, session.userId],
      )

      // Fire participant-added notification for each newly added participant
      const newlyAdded = [...addedFromTgov, ...addedFromCrm].map(r => r.user_id)
      if (newlyAdded.length > 0) {
        const propostaMeta = await query<{ titulo: string | null }>(
          `SELECT titulo FROM tgov_propostas WHERE nr_proposta = $1 LIMIT 1`,
          [target_key],
        )
        for (const userId of newlyAdded) {
          sendParticipantAddedNotification({
            recipientId: userId,
            actorId: session.userId,
            propostaNr: target_key,
            propostaTitulo: propostaMeta[0]?.titulo ?? null,
          }).catch(err => console.error('[comments] participant-added failed', err))
        }
      }
    }
```

- [ ] **Step 3: Update import**

Ensure the top of the file imports `sendParticipantAddedNotification`:

```typescript
import { sendCommentNotification, sendParticipantAddedNotification } from '@/lib/email-service'
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual test**

Run: `cd web && npm run dev`
- Log in as `adm_produto` (not the assigned tecnico)
- Comment on a proposal where the tecnico is NOT yet in `tgov_proposta_participants`
- Verify: tecnico receives TWO emails — one "novo comentário" and one "novo participante"
- Repeat the comment: tecnico should receive ONLY the "novo comentário" (no duplicate participant email)

- [ ] **Step 6: Commit**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov
git add web/src/app/api/tgov/comments/route.ts
git commit -m "feat(tgov): notify user when added as proposal participant"
```

---

## Wave 5 — CRM Real-time Event Notifications

### Task 10: Identify CRM comment/status routes and extend service

**Status:** Deferred — the spec covers CRM events (lead comment, lead status change) but their exact routes and participant model differ from TGov. Before implementing, run a discovery task:

- [ ] **Step 1: Map CRM event routes**

Run:
```bash
ls web/src/app/api/leads/
```

Identify:
- Where lead comments are created (if any)
- Where lead status changes are persisted
- How "recipients" is defined for CRM (vendedor who owns the lead, coordenador, etc.)

- [ ] **Step 2: Decide if CRM events need the same model or a different one**

If CRM uses a similar "participants" pattern, extend `email-service.ts` with:
- `sendLeadCommentNotification`
- `sendLeadStatusChangeNotification`

If CRM does not currently track participants, the recipient rule per spec is: **lead owner (vendedor) + their coordenador**. Implement recipient discovery in the service.

- [ ] **Step 3: Create a separate plan**

Because CRM scope is ambiguous without code inspection, stop here and create a follow-up spec/plan:

```
docs/superpowers/specs/YYYY-MM-DD-crm-email-notifications-design.md
docs/superpowers/plans/YYYY-MM-DD-crm-email-notifications.md
```

Wave 5 is complete only once that follow-up plan is executed. Waves 1–4 ship independently.

---

## Final Verification

After Waves 1–4 are all committed:

- [ ] **Step 1: Full type-check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Full build**

Run: `cd web && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Smoke test all flows**

With dev server running:
1. Create a new user → welcome email arrives
2. Reset a user's password → reset email arrives with new password
3. Comment on a TGov proposal → participants receive emails
4. Assign a technician → assignee + participants receive emails
5. Change a proposal situation → participants receive emails
6. Trigger a new-participant scenario → added user receives email

Verify that **CRM users** (vendedor, coordenador) do NOT receive TGov emails even in edge cases.

- [ ] **Step 4: Final push**

```bash
git push origin master
```

Deployment will go to Vercel. **Remember:** Also disable Vercel Deployment Protection so users can actually receive the emails and log in (separate from this plan — user needs to handle in Vercel dashboard).

---

## Self-Review Notes

- **Spec coverage:** Waves 1–4 cover password reset, welcome, comment/situacao/assignment/participant for TGov. Wave 5 (CRM) is scoped out with a follow-up plan because route structure requires inspection first.
- **Role isolation:** Enforced in `email-service.ts` via `filterTgov` / `filterCrm` — even if a CRM user accidentally lands in a participants list, they'll be filtered before email send.
- **Anti-spam:** Actor filtering (`actorId`) and `active = true` filter both in service.
- **Type consistency:** All template builder signatures and service function signatures match their callers.
- **No placeholders:** All code blocks are concrete; the one caveat is Task 8 where the route's variable names must be read first (explicitly called out in the task).
