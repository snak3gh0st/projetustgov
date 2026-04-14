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
