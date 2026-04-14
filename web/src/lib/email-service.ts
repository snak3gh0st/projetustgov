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
