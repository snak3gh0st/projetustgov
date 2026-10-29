import { dayMonth, money, moneyCompact, signedMoneyCompact, weekday } from '@/components/financeiro/format'
import type { Relatorio } from './types'

// E-mail da sexta: só o essencial, em tabelas com estilo inline (o Gmail corta acima de ~100 KB
// e não roda JS). A versão completa e interativa fica em /gestao/relatorio-semanal.

const INK = '#1E293B'
const BODY = '#374151'
const MUTED = '#6B7280'
const FAINT = '#9CA3AF'
const LINE = '#E5E7EB'
const SOFT = '#F8FAFC'
const BRAND = '#0072F7'
const GOOD = '#047857'
const BAD = '#B91C1C'
const WARN = '#B45309'
const FONT = `'Inter', 'Segoe UI', Helvetica, Arial, sans-serif`

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const signColor = (v: number) => (v < 0 ? BAD : v > 0 ? GOOD : MUTED)

function section(title: string, inner: string): string {
  return `<tr><td style="padding:28px 32px 0;">
    <div style="font-family:${FONT};font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">${esc(title)}</div>
    ${inner}
  </td></tr>`
}

function kpis(items: { label: string; value: string; sub?: string; color?: string }[]): string {
  const cells = items
    .map(
      (k) => `<td width="${Math.floor(100 / items.length)}%" valign="top" style="padding:12px 12px;border:1px solid ${LINE};border-radius:10px;background:#fff;">
        <div style="font-family:${FONT};font-size:11px;color:${MUTED};">${esc(k.label)}</div>
        <div style="font-family:${FONT};font-size:18px;font-weight:700;color:${k.color ?? INK};margin-top:4px;white-space:nowrap;">${esc(k.value)}</div>
        ${k.sub ? `<div style="font-family:${FONT};font-size:11px;color:${FAINT};margin-top:2px;">${esc(k.sub)}</div>` : ''}
      </td>`
    )
    .join('<td width="8" style="font-size:0;">&nbsp;</td>')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>${cells}</tr></table>`
}

function rows(lines: { left: string; sub?: string; right: string; color?: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lines
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;color:${INK};">${esc(l.left)}${l.sub ? `<div style="font-size:11px;color:${FAINT};margin-top:1px;">${esc(l.sub)}</div>` : ''}</td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;font-weight:600;color:${l.color ?? INK};white-space:nowrap;">${esc(l.right)}</td>
      </tr>`
    )
    .join('')}</table>`
}

const br = (iso: string) => `${dayMonth(iso)}/${iso.slice(0, 4)}`

export function relatorioSemanalEmail(r: Relatorio, opts: { url: string; teste?: boolean }): { subject: string; html: string } {
  const f = r.financeiro
  const c = r.comercial
  const periodo = `${dayMonth(r.semana.de)} a ${dayMonth(r.semana.ate)}`
  const variacao = f.saldo.total != null && f.saldo.inicioSemana != null ? f.saldo.total - f.saldo.inicioSemana : null

  const alertas = r.alertas.length
    ? r.alertas
        .map(
          (a) => `<div style="border-left:4px solid ${a.nivel === 'critico' ? BAD : WARN};background:${a.nivel === 'critico' ? '#FEF2F2' : '#FFFBEB'};padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:8px;">
            <div style="font-family:${FONT};font-size:13px;font-weight:700;color:${INK};">${esc(a.titulo)}</div>
            <div style="font-family:${FONT};font-size:12px;color:${BODY};margin-top:2px;line-height:1.5;">${esc(a.detalhe)}</div>
          </div>`
        )
        .join('')
    : `<div style="font-family:${FONT};font-size:13px;color:${GOOD};">Nada fora do normal nesta semana.</div>`

  const vendas = c.vendas.itens.length
    ? rows(c.vendas.itens.map((v) => ({ left: v.cliente, sub: `${v.servico} · ${v.vendedor} · ${dayMonth(v.data)}`, right: money(v.valor) })))
    : `<div style="font-family:${FONT};font-size:13px;color:${MUTED};">Nenhuma venda fechada na semana.</div>`

  const agenda = rows(
    f.agenda.dias
      .filter((d) => d.receber || d.pagar)
      .map((d) => ({
        left: `${weekday(d.data)} ${dayMonth(d.data)}`,
        sub: `Receber ${moneyCompact(d.receber)} · Pagar ${moneyCompact(d.pagar)}`,
        right: signedMoneyCompact(d.receber - d.pagar),
        color: signColor(d.receber - d.pagar),
      }))
  )
  const totalReceber = f.agenda.dias.reduce((a, d) => a + d.receber, 0)
  const totalPagar = f.agenda.dias.reduce((a, d) => a + d.pagar, 0)

  const time = rows(
    c.time.map((v) => ({
      left: v.nome,
      sub: `${v.trabalhados} leads trabalhados · ${v.avancos} avanços · ${v.perdas} perdas`,
      right: v.vendas ? `${v.vendas} venda${v.vendas === 1 ? '' : 's'}` : '—',
    }))
  )

  const empresas = rows(
    f.porEmpresa.map((e) => ({
      left: e.empresa,
      sub: e.variacao ? `semana: ${signedMoneyCompact(e.variacao)}` : undefined,
      right: money(e.saldo),
      color: e.saldo < 0 ? BAD : INK,
    }))
  )

  const body = `
    ${section('Pontos de atenção', alertas)}
    ${section(
      'Financeiro · grupo TS&CO',
      `${kpis([
        { label: 'Saldo em conta', value: moneyCompact(f.saldo.total), sub: variacao != null ? `${signedMoneyCompact(variacao)} na semana` : undefined, color: (f.saldo.total ?? 0) < 0 ? BAD : INK },
        { label: 'Recebido na semana', value: moneyCompact(f.semana.recebido), color: GOOD },
        { label: 'Pago na semana', value: moneyCompact(f.semana.pago) },
      ])}
      <div style="height:8px;"></div>
      ${kpis([
        { label: 'Faturamento do mês', value: moneyCompact(f.resultado.mtd.atual), sub: `mês passado no mesmo ponto: ${moneyCompact(f.resultado.mtd.anterior)}` },
        { label: 'A receber vencido', value: moneyCompact(f.atrasados.receber.total), sub: `${f.atrasados.receber.count} títulos`, color: f.atrasados.receber.total > 0 ? WARN : INK },
        { label: 'Posição líquida 12m', value: moneyCompact(f.posicao.liquida), color: signColor(f.posicao.liquida) },
      ])}`
    )}
    ${section(`Próxima semana · ${dayMonth(r.proxima.de)} a ${dayMonth(r.proxima.ate)}`, `${kpis([
      { label: 'A receber', value: moneyCompact(totalReceber), color: GOOD },
      { label: 'A pagar', value: moneyCompact(totalPagar), color: BAD },
      { label: 'Receber − pagar', value: signedMoneyCompact(totalReceber - totalPagar), color: signColor(totalReceber - totalPagar) },
    ])}<div style="height:6px;"></div>${agenda}`)}
    ${section('Saldo por empresa', empresas)}
    ${section(
      'Comercial · PROJETUS',
      `${kpis([
        { label: 'Vendas na semana', value: String(c.vendas.itens.length), sub: moneyCompact(c.vendas.total) },
        { label: 'Vendas no mês', value: String(c.vendas.mes.count), sub: moneyCompact(c.vendas.mes.total) },
        { label: 'Leads distribuídos', value: String(c.distribuidos) },
      ])}
      <div style="height:10px;"></div>${vendas}`
    )}
    ${section('Time comercial na semana', time)}
  `

  const subject = `${opts.teste ? '[TESTE] ' : ''}Relatório semanal TS&CO · ${periodo}`
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${SOFT};font-family:${FONT};color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};padding:24px 8px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
        <tr><td style="height:4px;background:linear-gradient(90deg,#FD225C 0%,#7A4BAC 50%,${BRAND} 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 32px 0;">
          <div style="font-family:${FONT};font-size:11px;font-weight:700;color:${BRAND};text-transform:uppercase;letter-spacing:1px;">Relatório semanal</div>
          <div style="font-family:${FONT};font-size:22px;font-weight:700;color:${INK};margin-top:4px;">Semana de ${br(r.semana.de)} a ${br(r.semana.ate)}</div>
          <div style="font-family:${FONT};font-size:13px;color:${MUTED};margin-top:4px;">Financeiro do grupo TS&amp;CO e comercial da PROJETUS</div>
        </td></tr>
        ${body}
        <tr><td style="padding:28px 32px 8px;" align="center">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${BRAND};border-radius:10px;">
            <a href="${esc(opts.url)}" style="display:inline-block;padding:13px 26px;color:#fff;font-family:${FONT};font-weight:600;font-size:14px;text-decoration:none;">Abrir relatório completo</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;font-family:${FONT};font-size:11px;color:${FAINT};line-height:1.6;text-align:center;">
          Financeiro: Conta Azul${r.financeiroAte ? `, sincronizado em ${esc(new Date(r.financeiroAte).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }))}` : ''}. Pagamentos feitos depois disso entram no próximo relatório.<br>
          Comercial: CRM do PROJETE. Enviado automaticamente pela PROJETUS toda sexta às 18h.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  return { subject, html }
}
