import { NextRequest, NextResponse } from 'next/server'
import { rememberQr } from '@/lib/whatsapp/evolution'
import { configForInstance } from '@/lib/whatsapp/channels'
import { query } from '@/lib/db'
import { segredoConfere } from '@/lib/whatsapp/segredo'
import { parseWebhook } from '@/lib/whatsapp/webhook'
import { aplicarEtiqueta, recordMessage, recordStatus } from '@/lib/whatsapp/store'

export const dynamic = 'force-dynamic'

// POST /api/whatsapp/webhook - eventos do Evolution API (público, protegido pelo segredo no cabeçalho)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const cfg = typeof body?.instance === 'string' ? configForInstance(body.instance) : null
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!segredoConfere(request.headers.get('x-projete-secret'), cfg.secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let gravadas = 0
  let falhas = 0
  for (const ev of parseWebhook(body)) {
    try {
      if (ev.kind === 'ignorado' || ev.instancia !== cfg.instance) continue
      if (ev.kind === 'mensagem') {
        // Só a instância configurada; evento sem instância não teria onde aparecer.
        if (ev.instancia !== cfg.instance) continue
        await recordMessage(ev)
        gravadas++
      } else if (ev.kind === 'status') {
        await recordStatus(ev)
      } else if (ev.kind === 'etiqueta') {
        if (ev.instancia !== cfg.instance) continue
        await aplicarEtiqueta(ev)
      } else if (ev.kind === 'qrcode') {
        rememberQr(ev.instancia, ev.base64)
      } else if (ev.kind === 'conexao') {
        await query(`WITH changed AS (
          INSERT INTO whatsapp_conexao_estado (instancia, estado, codigo, recebido_em) VALUES ($1, $2, $3, NOW())
          ON CONFLICT (instancia) DO UPDATE SET estado = $2, codigo = $3, recebido_em = NOW()
          WHERE whatsapp_conexao_estado.estado IS DISTINCT FROM $2 OR whatsapp_conexao_estado.codigo IS DISTINCT FROM $3
          RETURNING instancia
        ) INSERT INTO whatsapp_conexao_eventos (instancia, estado, codigo) SELECT instancia, $2, $3 FROM changed`, [ev.instancia, ev.estado, ev.codigo ?? null])
        console.info('[whatsapp/conexao]', { instancia: ev.instancia, estado: ev.estado, codigo: ev.codigo, recebidoEm: new Date().toISOString() })
      }
    } catch (error) {
      // Um evento ruim não derruba os outros nem faz o Evolution reenviar em loop.
      falhas++
      console.error('[api/whatsapp/webhook] evento falhou', { tipo: error instanceof Error ? error.name : 'unknown', instancia: cfg.instance })
    }
  }
  return NextResponse.json({ ok: falhas === 0, gravadas }, { status: falhas ? 503 : 200 })
}
