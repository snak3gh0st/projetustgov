// web/src/lib/email-templates.ts
// Shared HTML email layout + template builders.
// All styles inline for email client compatibility.
// Color palette mirrors the frontend design system (tailwind.config.ts):
//   sigma-neon #0072F7 / sigma-neon-dim #0058C4 (primary brand)
//   sigma-navy #050B1F (dark header)
//   sigma-magenta #FD225C (accent)
// Fonts: Space Grotesk (heading) + Inter (body), with web-safe fallbacks
// for email clients that strip web fonts.

const SIGMA_NEON = '#0072F7'
const SIGMA_NAVY = '#050B1F'
const TEXT_DARK = '#1E293B'
const TEXT_MUTED = '#64748B'
const BORDER = '#E2E8F0'
const BG_PAGE = '#F8FAFC'
const BG_CARD = '#FFFFFF'

const FONT_HEADING = `'Space Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif`
const FONT_BODY = `'Inter', 'Segoe UI', Helvetica, Arial, sans-serif`

function baseLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:${FONT_BODY};color:${TEXT_DARK};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PAGE};padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:${BG_CARD};border-radius:16px;overflow:hidden;max-width:600px;border:1px solid ${BORDER};box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td style="background:${SIGMA_NAVY};padding:24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#ffffff;font-family:${FONT_HEADING};font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                    Projetus
                  </td>
                  <td align="right" style="color:${SIGMA_NEON};font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
                    CRM &amp; TGov
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${TEXT_DARK};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid ${BORDER};background:${BG_PAGE};font-family:${FONT_BODY};font-size:12px;color:${TEXT_MUTED};text-align:center;">
              Projetus — powered by <strong style="color:${SIGMA_NAVY};">SigmaIntel</strong><br>
              <a href="https://projetus.org" style="color:${SIGMA_NEON};text-decoration:none;">projetus.org</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${FONT_HEADING};font-size:22px;font-weight:600;color:${SIGMA_NAVY};letter-spacing:-0.3px;line-height:1.3;">${escapeHtml(text)}</h1>`
}

function button(href: string, label: string): string {
  return `<p style="margin:28px 0 8px;">
    <a href="${escapeHtml(href)}" style="background:${SIGMA_NEON};color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:${FONT_BODY};font-weight:600;font-size:14px;display:inline-block;letter-spacing:0.2px;">
      ${escapeHtml(label)}
    </a>
  </p>`
}

function infoBox(label: string, value: string): string {
  return `<div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;margin:16px 0;">
    <div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">${escapeHtml(label)}</div>
    <div style="font-family:${FONT_BODY};font-size:15px;color:${TEXT_DARK};font-weight:500;">${escapeHtml(value)}</div>
  </div>`
}

function passwordBox(password: string): string {
  return `<div style="background:${SIGMA_NAVY};border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
    <div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${SIGMA_NEON};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Nova senha</div>
    <div style="font-family:'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;font-size:20px;color:#ffffff;font-weight:600;letter-spacing:1px;">${escapeHtml(password)}</div>
  </div>`
}

function statusChange(oldStatus: string, newStatus: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td width="45%" style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;vertical-align:top;">
        <div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Situação anterior</div>
        <div style="font-family:${FONT_BODY};font-size:14px;color:${TEXT_MUTED};font-weight:500;text-decoration:line-through;">${escapeHtml(oldStatus)}</div>
      </td>
      <td width="10%" align="center" style="color:${SIGMA_NEON};font-size:18px;font-weight:700;">→</td>
      <td width="45%" style="background:${SIGMA_NEON};border-radius:8px;padding:14px 16px;vertical-align:top;">
        <div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Nova situação</div>
        <div style="font-family:${FONT_BODY};font-size:14px;color:#ffffff;font-weight:600;">${escapeHtml(newStatus)}</div>
      </td>
    </tr>
  </table>`
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
    ${heading(`Bem-vindo(a), ${opts.nome}!`)}
    <p style="margin:0 0 12px;">Sua conta no <strong>Projetus</strong> foi criada. Agora você tem acesso à plataforma.</p>
    ${infoBox('Seu email de acesso', opts.email)}
    <p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;">A senha foi definida pelo administrador e deve ter sido comunicada separadamente.</p>
    ${button(opts.loginUrl, 'Acessar o sistema →')}
  `
  return { subject: 'Projetus — Sua conta foi criada', html: baseLayout('Bem-vindo ao Projetus', body) }
}

// ——— Template: Password Reset ———
export function passwordResetEmail(opts: { nome: string; newPassword: string; loginUrl: string }): { subject: string; html: string } {
  const body = `
    ${heading('Senha alterada')}
    <p style="margin:0 0 12px;">Olá <strong>${escapeHtml(opts.nome)}</strong>,</p>
    <p style="margin:0 0 8px;">Sua senha no Projetus foi alterada por um administrador.</p>
    ${passwordBox(opts.newPassword)}
    <p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;">Recomendamos fazer login e trocar para uma senha pessoal assim que possível.</p>
    ${button(opts.loginUrl, 'Fazer login →')}
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
  const tituloLine = opts.propostaTitulo
    ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(opts.propostaTitulo)}</div>`
    : ''
  const body = `
    ${heading('Novo comentário')}
    <p style="margin:0 0 20px;">Olá <strong>${escapeHtml(opts.nome)}</strong>, <strong>${escapeHtml(opts.commenterName)}</strong> comentou em uma proposta que você acompanha.</p>
    <div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 16px;">
      <div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(opts.propostaNr)}</div>
      ${tituloLine}
    </div>
    <div style="border-left:3px solid ${SIGMA_NEON};background:${BG_PAGE};padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 12px;">
      <div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">${escapeHtml(opts.commenterName)}</div>
      <div style="font-family:${FONT_BODY};font-size:14px;color:${TEXT_DARK};line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.snippet)}</div>
    </div>
    ${button(opts.propostaUrl, 'Ver proposta →')}
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
  const tituloLine = opts.propostaTitulo
    ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(opts.propostaTitulo)}</div>`
    : ''
  const body = `
    ${heading('Situação atualizada')}
    <p style="margin:0 0 16px;">Olá <strong>${escapeHtml(opts.nome)}</strong>, uma proposta que você acompanha mudou de situação.</p>
    <div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 12px;">
      <div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(opts.propostaNr)}</div>
      ${tituloLine}
    </div>
    ${statusChange(opts.oldStatus, opts.newStatus)}
    ${button(opts.propostaUrl, 'Ver proposta →')}
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
  const tituloLine = opts.propostaTitulo
    ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(opts.propostaTitulo)}</div>`
    : ''
  const headline = opts.isAssignee ? 'Você foi atribuído(a)' : 'Técnico atribuído'
  const lead = opts.isAssignee
    ? `Você foi atribuído(a) como técnico(a) responsável.`
    : `<strong>${escapeHtml(opts.assigneeName)}</strong> foi atribuído(a) como técnico(a) responsável.`
  const body = `
    ${heading(headline)}
    <p style="margin:0 0 16px;">Olá <strong>${escapeHtml(opts.nome)}</strong>, ${lead}</p>
    <div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 12px;">
      <div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(opts.propostaNr)}</div>
      ${tituloLine}
    </div>
    ${infoBox('Técnico atribuído', opts.assigneeName)}
    ${button(opts.propostaUrl, 'Ver proposta →')}
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
  const tituloLine = opts.propostaTitulo
    ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(opts.propostaTitulo)}</div>`
    : ''
  const body = `
    ${heading('Você foi adicionado(a)')}
    <p style="margin:0 0 16px;">Olá <strong>${escapeHtml(opts.nome)}</strong>, você foi adicionado(a) como participante de uma proposta.</p>
    <div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 16px;">
      <div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(opts.propostaNr)}</div>
      ${tituloLine}
    </div>
    <p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;">A partir de agora você receberá notificações sobre atualizações nessa proposta — novos comentários, mudanças de situação e atribuições.</p>
    ${button(opts.propostaUrl, 'Ver proposta →')}
  `
  return { subject: `Projetus — Você foi adicionado à proposta ${opts.propostaNr}`, html: baseLayout('Novo participante', body) }
}
