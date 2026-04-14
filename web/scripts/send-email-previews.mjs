#!/usr/bin/env node
// Preview all 6 email templates — sends to a single recipient via Resend.
// Usage:
//   cd web && node scripts/send-email-previews.mjs <recipient-email>
// Reads RESEND_API_KEY from .env.vercel-prod-temp or process.env.

import { readFileSync, existsSync } from 'node:fs'
import { Resend } from 'resend'

// ———————————————————————————————————————————————————————————————
// 1. Locate API key
// ———————————————————————————————————————————————————————————————
function loadEnvFromFile(path) {
  if (!existsSync(path)) return
  const txt = readFileSync(path, 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(?:"(.*)"|(.*))$/i)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2] ?? m[3] ?? ''
  }
}
loadEnvFromFile('.env.vercel-prod-temp')
loadEnvFromFile('.env.production')
loadEnvFromFile('.env.local')

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('RESEND_API_KEY not set')
  process.exit(1)
}

const recipient = process.argv[2]
if (!recipient || !recipient.includes('@')) {
  console.error('Usage: node scripts/send-email-previews.mjs <recipient-email>')
  process.exit(1)
}

const FROM = process.env.DIGEST_FROM_EMAIL || 'Projetus <noreply@projetus.org>'
const LOGIN_URL = 'https://projetus.org/login'
const PROPOSTA_URL = 'https://projetus.org/tgov?nr=123456%2F2025'

// ———————————————————————————————————————————————————————————————
// 2. Inline the template builders (ESM can't import .ts directly)
//    Copy-paste kept in sync with web/src/lib/email-templates.ts
// ———————————————————————————————————————————————————————————————
const SIGMA_NEON = '#0072F7'
const SIGMA_NAVY = '#050B1F'
const TEXT_DARK = '#1E293B'
const TEXT_MUTED = '#64748B'
const BORDER = '#E2E8F0'
const BG_PAGE = '#F8FAFC'
const BG_CARD = '#FFFFFF'
const FONT_HEADING = `'Space Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif`
const FONT_BODY = `'Inter', 'Segoe UI', Helvetica, Arial, sans-serif`

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function baseLayout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:${FONT_BODY};color:${TEXT_DARK};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PAGE};padding:32px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:${BG_CARD};border-radius:16px;overflow:hidden;max-width:600px;border:1px solid ${BORDER};box-shadow:0 1px 3px rgba(0,0,0,0.04);">
<tr><td style="background:${SIGMA_NAVY};padding:24px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="color:#ffffff;font-family:${FONT_HEADING};font-size:22px;font-weight:700;letter-spacing:-0.5px;">Projetus</td>
<td align="right" style="color:${SIGMA_NEON};font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">CRM &amp; TGov</td>
</tr></table></td></tr>
<tr><td style="padding:32px 28px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${TEXT_DARK};">${bodyHtml}</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid ${BORDER};background:${BG_PAGE};font-family:${FONT_BODY};font-size:12px;color:${TEXT_MUTED};text-align:center;">
Projetus — powered by <strong style="color:${SIGMA_NAVY};">SigmaIntel</strong><br>
<a href="https://projetus.org" style="color:${SIGMA_NEON};text-decoration:none;">projetus.org</a>
</td></tr></table></td></tr></table></body></html>`
}

const heading = (text) => `<h1 style="margin:0 0 16px;font-family:${FONT_HEADING};font-size:22px;font-weight:600;color:${SIGMA_NAVY};letter-spacing:-0.3px;line-height:1.3;">${escapeHtml(text)}</h1>`

const button = (href, label) => `<p style="margin:28px 0 8px;"><a href="${escapeHtml(href)}" style="background:${SIGMA_NEON};color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:${FONT_BODY};font-weight:600;font-size:14px;display:inline-block;letter-spacing:0.2px;">${escapeHtml(label)}</a></p>`

const infoBox = (label, value) => `<div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;margin:16px 0;"><div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">${escapeHtml(label)}</div><div style="font-family:${FONT_BODY};font-size:15px;color:${TEXT_DARK};font-weight:500;">${escapeHtml(value)}</div></div>`

const passwordBox = (password) => `<div style="background:${SIGMA_NAVY};border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;"><div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${SIGMA_NEON};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Nova senha</div><div style="font-family:'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;font-size:20px;color:#ffffff;font-weight:600;letter-spacing:1px;">${escapeHtml(password)}</div></div>`

const statusChange = (oldStatus, newStatus) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td width="45%" style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;vertical-align:top;"><div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Situação anterior</div><div style="font-family:${FONT_BODY};font-size:14px;color:${TEXT_MUTED};font-weight:500;text-decoration:line-through;">${escapeHtml(oldStatus)}</div></td><td width="10%" align="center" style="color:${SIGMA_NEON};font-size:18px;font-weight:700;">→</td><td width="45%" style="background:${SIGMA_NEON};border-radius:8px;padding:14px 16px;vertical-align:top;"><div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Nova situação</div><div style="font-family:${FONT_BODY};font-size:14px;color:#ffffff;font-weight:600;">${escapeHtml(newStatus)}</div></td></tr></table>`

function welcomeEmail({ nome, email, loginUrl }) {
  return { subject: '[PREVIEW] Projetus — Sua conta foi criada', html: baseLayout('Bem-vindo ao Projetus', `${heading(`Bem-vindo(a), ${nome}!`)}<p style="margin:0 0 12px;">Sua conta no <strong>Projetus</strong> foi criada. Agora você tem acesso à plataforma.</p>${infoBox('Seu email de acesso', email)}<p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;">A senha foi definida pelo administrador e deve ter sido comunicada separadamente.</p>${button(loginUrl, 'Acessar o sistema →')}`) }
}

function passwordResetEmail({ nome, newPassword, loginUrl }) {
  return { subject: '[PREVIEW] Projetus — Sua senha foi alterada', html: baseLayout('Senha alterada', `${heading('Senha alterada')}<p style="margin:0 0 12px;">Olá <strong>${escapeHtml(nome)}</strong>,</p><p style="margin:0 0 8px;">Sua senha no Projetus foi alterada por um administrador.</p>${passwordBox(newPassword)}<p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;">Recomendamos fazer login e trocar para uma senha pessoal assim que possível.</p>${button(loginUrl, 'Fazer login →')}`) }
}

function commentNotificationEmail({ nome, commenterName, propostaNr, propostaTitulo, snippet, propostaUrl }) {
  const tituloLine = propostaTitulo ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(propostaTitulo)}</div>` : ''
  return { subject: `[PREVIEW] Projetus — Novo comentário na proposta ${propostaNr}`, html: baseLayout('Novo comentário', `${heading('Novo comentário')}<p style="margin:0 0 20px;">Olá <strong>${escapeHtml(nome)}</strong>, <strong>${escapeHtml(commenterName)}</strong> comentou em uma proposta que você acompanha.</p><div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 16px;"><div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(propostaNr)}</div>${tituloLine}</div><div style="border-left:3px solid ${SIGMA_NEON};background:${BG_PAGE};padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 12px;"><div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">${escapeHtml(commenterName)}</div><div style="font-family:${FONT_BODY};font-size:14px;color:${TEXT_DARK};line-height:1.6;white-space:pre-wrap;">${escapeHtml(snippet)}</div></div>${button(propostaUrl, 'Ver proposta →')}`) }
}

function situacaoChangeEmail({ nome, propostaNr, propostaTitulo, oldStatus, newStatus, propostaUrl }) {
  const tituloLine = propostaTitulo ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(propostaTitulo)}</div>` : ''
  return { subject: `[PREVIEW] Projetus — Situação atualizada (${propostaNr})`, html: baseLayout('Situação atualizada', `${heading('Situação atualizada')}<p style="margin:0 0 16px;">Olá <strong>${escapeHtml(nome)}</strong>, uma proposta que você acompanha mudou de situação.</p><div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 12px;"><div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(propostaNr)}</div>${tituloLine}</div>${statusChange(oldStatus, newStatus)}${button(propostaUrl, 'Ver proposta →')}`) }
}

function assignmentEmail({ nome, assigneeName, isAssignee, propostaNr, propostaTitulo, propostaUrl }) {
  const tituloLine = propostaTitulo ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(propostaTitulo)}</div>` : ''
  const headline = isAssignee ? 'Você foi atribuído(a)' : 'Técnico atribuído'
  const lead = isAssignee ? `Você foi atribuído(a) como técnico(a) responsável.` : `<strong>${escapeHtml(assigneeName)}</strong> foi atribuído(a) como técnico(a) responsável.`
  return { subject: `[PREVIEW] Projetus — Técnico atribuído (${propostaNr})`, html: baseLayout('Técnico atribuído', `${heading(headline)}<p style="margin:0 0 16px;">Olá <strong>${escapeHtml(nome)}</strong>, ${lead}</p><div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 12px;"><div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(propostaNr)}</div>${tituloLine}</div>${infoBox('Técnico atribuído', assigneeName)}${button(propostaUrl, 'Ver proposta →')}`) }
}

function participantAddedEmail({ nome, propostaNr, propostaTitulo, propostaUrl }) {
  const tituloLine = propostaTitulo ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${TEXT_MUTED};margin-top:4px;">${escapeHtml(propostaTitulo)}</div>` : ''
  return { subject: `[PREVIEW] Projetus — Você foi adicionado à proposta ${propostaNr}`, html: baseLayout('Novo participante', `${heading('Você foi adicionado(a)')}<p style="margin:0 0 16px;">Olá <strong>${escapeHtml(nome)}</strong>, você foi adicionado(a) como participante de uma proposta.</p><div style="background:${BG_PAGE};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:0 0 16px;"><div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${SIGMA_NAVY};">Proposta ${escapeHtml(propostaNr)}</div>${tituloLine}</div><p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;">A partir de agora você receberá notificações sobre atualizações nessa proposta — novos comentários, mudanças de situação e atribuições.</p>${button(propostaUrl, 'Ver proposta →')}`) }
}

// ———————————————————————————————————————————————————————————————
// 3. Build the 6 previews
// ———————————————————————————————————————————————————————————————
const NOME = 'Paulo Loureiro'
const PROPOSTA_NR = '123456/2025'
const PROPOSTA_TITULO = 'Modernização de equipamentos — Hospital Regional de Goiânia'

const emails = [
  { label: '1/6 Welcome', ...welcomeEmail({ nome: NOME, email: recipient, loginUrl: LOGIN_URL }) },
  { label: '2/6 Password Reset', ...passwordResetEmail({ nome: NOME, newPassword: 'TempProj#2026', loginUrl: LOGIN_URL }) },
  { label: '3/6 Comment', ...commentNotificationEmail({ nome: NOME, commenterName: 'Wellington Silva', propostaNr: PROPOSTA_NR, propostaTitulo: PROPOSTA_TITULO, snippet: 'Pessoal, confirmei com o órgão superior hoje — podemos avançar com o ajuste técnico no escopo. Preciso que alguém atualize a planilha de valores até quinta.', propostaUrl: PROPOSTA_URL }) },
  { label: '4/6 Situacao Change', ...situacaoChangeEmail({ nome: NOME, propostaNr: PROPOSTA_NR, propostaTitulo: PROPOSTA_TITULO, oldStatus: 'Em Análise', newStatus: 'Aprovada', propostaUrl: PROPOSTA_URL }) },
  { label: '5/6 Assignment (assignee view)', ...assignmentEmail({ nome: NOME, assigneeName: NOME, isAssignee: true, propostaNr: PROPOSTA_NR, propostaTitulo: PROPOSTA_TITULO, propostaUrl: PROPOSTA_URL }) },
  { label: '6/6 Participant Added', ...participantAddedEmail({ nome: NOME, propostaNr: PROPOSTA_NR, propostaTitulo: PROPOSTA_TITULO, propostaUrl: PROPOSTA_URL }) },
]

// ———————————————————————————————————————————————————————————————
// 4. Send sequentially
// ———————————————————————————————————————————————————————————————
const resend = new Resend(apiKey)

for (const e of emails) {
  try {
    const res = await resend.emails.send({ from: FROM, to: recipient, subject: e.subject, html: e.html })
    if (res.error) {
      console.error(`❌ ${e.label}:`, res.error.message || res.error)
    } else {
      console.log(`✅ ${e.label} → ${recipient} (id: ${res.data?.id ?? 'n/a'})`)
    }
  } catch (err) {
    console.error(`❌ ${e.label} threw:`, err.message)
  }
  // Small delay to avoid rate limits
  await new Promise(r => setTimeout(r, 400))
}

console.log('\nDone.')
