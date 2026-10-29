// systemd timer on btapps: sexta 18:00 BRT (projetus-cron@relatorio-semanal).
// Destinatários em WEEKLY_REPORT_TO (vírgula). Sem a variável, grava o retrato e não envia.
//
//   ?preview=1  devolve o HTML do e-mail, sem gravar nem enviar (sessão diretoria/admin ou cron)
//   ?teste=1    envia [TESTE] para quem está logado (ou para ?to= com o CRON_SECRET), sem gravar
//
// Sem parâmetro (só com o CRON_SECRET) grava e envia a última semana fechada (sexta 18h). Rodar antes
// disso, ou com atraso, envia a semana anterior, que já pode ter saído: nunca congela semana pela metade.

import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { todaySP } from '@/lib/conta-azul/finance/dates'
import { montarRelatorio } from '@/lib/relatorio-semanal/build'
import { ultimaSemanaFechada } from '@/lib/relatorio-semanal/regras'
import { relatorioSemanalEmail } from '@/lib/relatorio-semanal/email'
import { carregar, liberarEnvio, reservarEnvio, salvar } from '@/lib/relatorio-semanal/store'
import type { Relatorio } from '@/lib/relatorio-semanal/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const APP_URL = process.env.NEXTAUTH_URL || 'https://projete.projetus.org'
const FROM = process.env.DIGEST_FROM_EMAIL || 'PROJETUS <noreply@projetus.org>'

function horaSP(): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
}

function linkDa(r: Relatorio) {
  return `${APP_URL.replace(/\/$/, '')}/gestao/relatorio-semanal?semana=${r.semana.ate}`
}

async function enviar(to: string, r: Relatorio, teste: boolean) {
  const { Resend } = await import('resend')
  const { subject, html } = relatorioSemanalEmail(r, { url: linkDa(r), teste })
  const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FROM, to, subject, html })
  if (error) throw new Error(`Resend: ${error.message}`)
  return data?.id ?? null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = Boolean(process.env.CRON_SECRET) && request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const session = isCron ? null : await getApiSession()
  if (!isCron && (!session || (session.role !== 'diretoria' && session.role !== 'admin'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (url.searchParams.get('preview') === '1') {
      const r = await montarRelatorio()
      return new NextResponse(relatorioSemanalEmail(r, { url: linkDa(r) }).html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    if (url.searchParams.get('teste') === '1') {
      const to = isCron ? url.searchParams.get('to') : session?.email
      if (!to) return NextResponse.json({ error: 'Sem destinatário' }, { status: 400 })
      const r = await montarRelatorio()
      const id = await enviar(to, r, true)
      return NextResponse.json({ success: true, teste: true, to, id })
    }

    if (!isCron) return NextResponse.json({ error: 'Envio só pelo agendamento' }, { status: 403 })

    const hoje = todaySP()
    const semana = ultimaSemanaFechada(hoje, horaSP())

    // Retentativas do run-cron.sh reaproveitam o retrato já enviado, para os números não mudarem.
    const gravado = await carregar(semana.ate)
    let r: Relatorio
    if (gravado && gravado.enviadoPara.length) {
      r = gravado.dados
    } else {
      r = await montarRelatorio(hoje, semana)
      await salvar(r)
    }

    const destinatarios = (process.env.WEEKLY_REPORT_TO ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const enviados: string[] = []
    const pulados: string[] = []
    for (const to of destinatarios) {
      if (!(await reservarEnvio(r.semana.ate, to))) {
        pulados.push(to)
        continue
      }
      try {
        await enviar(to, r, false)
        enviados.push(to)
      } catch (err) {
        await liberarEnvio(r.semana.ate, to)
        throw err
      }
    }
    console.log(`[cron/relatorio-semanal] semana ${r.semana.de}..${r.semana.ate} enviados=${enviados.join(',') || '-'} pulados=${pulados.join(',') || '-'}`)
    return NextResponse.json({ success: true, semana: r.semana, enviados, pulados, alertas: r.alertas.length })
  } catch (error) {
    console.error('[cron/relatorio-semanal] error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Falha no relatório' }, { status: 500 })
  }
}
