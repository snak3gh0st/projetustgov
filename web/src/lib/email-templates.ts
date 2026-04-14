// web/src/lib/email-templates.ts
// Shared HTML email layout + template builders.
// All styles inline for email client compatibility.
//
// Design matches the frontend (light-mode, minimalist) using the real
// Projete brand palette — a magenta→purple→blue gradient:
//   Magenta:            #FD225C (sigma-magenta)
//   Purple:             #7A4BAC (sigma-purple)
//   Blue:               #0072F7 (sigma-neon, primary CTA)
// The real logo (public/logo.png) is embedded as base64 data URI for
// self-contained rendering without external hosting.

import { PROJETUS_LOGO_DATA_URI } from './email-logo'

const BRAND = '#0072F7'
const BRAND_MAGENTA = '#FD225C'
const BRAND_PURPLE = '#7A4BAC'
const TEXT_DARK = '#1E293B'
const TEXT_BODY = '#374151'
const TEXT_MUTED = '#6B7280'
const TEXT_FAINT = '#9CA3AF'
const BORDER = '#E5E7EB'
const BG_PAGE = '#F8FAFC'
const BG_CARD = '#FFFFFF'
const BG_SUBTLE = '#F9FAFB'

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
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PAGE};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:${BG_CARD};border-radius:16px;overflow:hidden;max-width:560px;border:1px solid ${BORDER};">
          <tr>
            <td style="height:4px;background:linear-gradient(90deg, ${BRAND_MAGENTA} 0%, ${BRAND_PURPLE} 50%, ${BRAND} 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:36px 40px 20px;text-align:center;">
              <img src="${PROJETUS_LOGO_DATA_URI}" alt="Projete" width="180" style="display:inline-block;width:180px;height:auto;max-width:180px;">
              <div style="font-family:${FONT_BODY};font-size:12px;color:${TEXT_FAINT};margin-top:10px;font-weight:400;letter-spacing:0.2px;">CRM &amp; TGov</div>
              <div style="font-family:${FONT_BODY};font-size:10px;color:${BRAND};margin-top:8px;letter-spacing:0.3px;">powered by <strong style="font-weight:600;">SigmaIntel</strong></div>
            </td>
          </tr>
          <tr><td style="padding:0 40px;"><div style="height:1px;background:${BORDER};"></div></td></tr>
          <tr>
            <td style="padding:32px 40px 40px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${TEXT_BODY};">
              ${bodyHtml}
            </td>
          </tr>
        </table>
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;margin-top:16px;">
          <tr>
            <td style="font-family:${FONT_BODY};font-size:11px;color:${TEXT_FAINT};text-align:center;line-height:1.5;">
              Este email foi enviado automaticamente pelo <a href="https://projetus.org" style="color:${BRAND};text-decoration:none;">Projetus</a>.<br>
              Se você não reconhece esta mensagem, pode ignorá-la com segurança.
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
  return `<h1 style="margin:0 0 14px;font-family:${FONT_HEADING};font-size:22px;font-weight:600;color:${TEXT_DARK};letter-spacing:-0.3px;line-height:1.3;">${escapeHtml(text)}</h1>`
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${TEXT_BODY};">${html}</p>`
}

function muted(html: string): string {
  return `<p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:13px;line-height:1.55;color:${TEXT_MUTED};">${html}</p>`
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;"><tr><td style="background:${BRAND};border-radius:10px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-family:${FONT_BODY};font-weight:600;font-size:14px;text-decoration:none;letter-spacing:0.2px;border-radius:10px;">
      ${escapeHtml(label)}
    </a>
  </td></tr></table>`
}

function infoRow(label: string, value: string): string {
  return `<div style="padding:12px 0;border-bottom:1px solid ${BORDER};">
    <div style="font-family:${FONT_BODY};font-size:11px;font-weight:500;color:${TEXT_FAINT};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">${escapeHtml(label)}</div>
    <div style="font-family:${FONT_BODY};font-size:15px;color:${TEXT_DARK};font-weight:500;">${escapeHtml(value)}</div>
  </div>`
}

function passwordBox(password: string): string {
  return `<div style="background:${BG_SUBTLE};border:1px solid ${BORDER};border-radius:10px;padding:18px 20px;margin:20px 0;text-align:center;">
    <div style="font-family:${FONT_BODY};font-size:11px;font-weight:500;color:${TEXT_FAINT};text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Nova senha</div>
    <div style="font-family:'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;font-size:20px;color:${TEXT_DARK};font-weight:600;letter-spacing:1px;">${escapeHtml(password)}</div>
  </div>`
}

function statusChange(oldStatus: string, newStatus: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td width="44%" style="background:${BG_SUBTLE};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;vertical-align:top;">
        <div style="font-family:${FONT_BODY};font-size:10px;font-weight:500;color:${TEXT_FAINT};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Anterior</div>
        <div style="font-family:${FONT_BODY};font-size:14px;color:${TEXT_MUTED};font-weight:500;">${escapeHtml(oldStatus)}</div>
      </td>
      <td width="12%" align="center" style="color:${BRAND};font-size:18px;font-weight:700;font-family:${FONT_HEADING};">→</td>
      <td width="44%" style="background:rgba(0,114,247,0.08);border:1px solid rgba(0,114,247,0.2);border-radius:10px;padding:14px 16px;vertical-align:top;">
        <div style="font-family:${FONT_BODY};font-size:10px;font-weight:600;color:${BRAND};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Atual</div>
        <div style="font-family:${FONT_BODY};font-size:14px;color:${TEXT_DARK};font-weight:600;">${escapeHtml(newStatus)}</div>
      </td>
    </tr>
  </table>`
}

function propostaCard(nr: string, titulo: string | null): string {
  const tituloLine = titulo
    ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;line-height:1.5;">${escapeHtml(titulo)}</div>`
    : ''
  return `<div style="background:${BG_SUBTLE};border:1px solid ${BORDER};border-radius:10px;padding:14px 18px;margin:16px 0;">
    <div style="font-family:${FONT_BODY};font-size:10px;font-weight:500;color:${TEXT_FAINT};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Proposta</div>
    <div style="font-family:${FONT_HEADING};font-size:15px;font-weight:600;color:${TEXT_DARK};">${escapeHtml(nr)}</div>
    ${tituloLine}
  </div>`
}

function commentQuote(author: string, snippet: string): string {
  return `<div style="background:${BG_SUBTLE};border-left:3px solid ${BRAND};border-radius:0 10px 10px 0;padding:14px 18px;margin:16px 0;">
    <div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${BRAND};margin-bottom:6px;">${escapeHtml(author)}</div>
    <div style="font-family:${FONT_BODY};font-size:14px;color:${TEXT_DARK};line-height:1.6;white-space:pre-wrap;">${escapeHtml(snippet)}</div>
  </div>`
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
    ${heading(`Bem-vindo(a), ${opts.nome.split(' ')[0]}`)}
    ${paragraph(`Sua conta no <strong>Projetus</strong> foi criada. Você já pode acessar a plataforma.`)}
    <div style="margin:24px 0;">
      ${infoRow('Email de acesso', opts.email)}
    </div>
    ${muted(`A senha foi definida pelo administrador e deve ter sido comunicada separadamente.`)}
    ${button(opts.loginUrl, 'Acessar o sistema')}
  `
  return { subject: 'Projetus — Sua conta foi criada', html: baseLayout('Bem-vindo ao Projetus', body) }
}

// ——— Template: Password Reset ———
export function passwordResetEmail(opts: { nome: string; newPassword: string; loginUrl: string }): { subject: string; html: string } {
  const body = `
    ${heading('Senha alterada')}
    ${paragraph(`Olá <strong>${escapeHtml(opts.nome)}</strong>, sua senha no Projetus foi alterada por um administrador.`)}
    ${passwordBox(opts.newPassword)}
    ${muted('Recomendamos fazer login e trocar para uma senha pessoal assim que possível.')}
    ${button(opts.loginUrl, 'Fazer login')}
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
  const body = `
    ${heading('Novo comentário')}
    ${paragraph(`Olá <strong>${escapeHtml(opts.nome)}</strong>, <strong>${escapeHtml(opts.commenterName)}</strong> comentou em uma proposta que você acompanha.`)}
    ${propostaCard(opts.propostaNr, opts.propostaTitulo)}
    ${commentQuote(opts.commenterName, opts.snippet)}
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
  const body = `
    ${heading('Situação atualizada')}
    ${paragraph(`Olá <strong>${escapeHtml(opts.nome)}</strong>, uma proposta que você acompanha mudou de situação.`)}
    ${propostaCard(opts.propostaNr, opts.propostaTitulo)}
    ${statusChange(opts.oldStatus, opts.newStatus)}
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
  const headline = opts.isAssignee ? 'Você foi atribuído(a)' : 'Técnico atribuído'
  const lead = opts.isAssignee
    ? `Olá <strong>${escapeHtml(opts.nome)}</strong>, você foi atribuído(a) como técnico(a) responsável por uma proposta.`
    : `Olá <strong>${escapeHtml(opts.nome)}</strong>, <strong>${escapeHtml(opts.assigneeName)}</strong> foi atribuído(a) como técnico(a) responsável.`
  const body = `
    ${heading(headline)}
    ${paragraph(lead)}
    ${propostaCard(opts.propostaNr, opts.propostaTitulo)}
    <div style="margin:16px 0;">
      ${infoRow('Técnico responsável', opts.assigneeName)}
    </div>
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
  const body = `
    ${heading('Você foi adicionado(a)')}
    ${paragraph(`Olá <strong>${escapeHtml(opts.nome)}</strong>, você foi adicionado(a) como participante de uma proposta.`)}
    ${propostaCard(opts.propostaNr, opts.propostaTitulo)}
    ${muted('A partir de agora você receberá notificações sobre atualizações nessa proposta — novos comentários, mudanças de situação e atribuições.')}
    ${button(opts.propostaUrl, 'Ver proposta')}
  `
  return { subject: `Projetus — Você foi adicionado à proposta ${opts.propostaNr}`, html: baseLayout('Novo participante', body) }
}
