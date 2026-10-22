import { NextRequest, NextResponse } from 'next/server'
import { whatsappConfig } from '@/lib/whatsapp/evolution'
import { segredoConfere } from '@/lib/whatsapp/segredo'
import { parseWebhook } from '@/lib/whatsapp/webhook'
import { aplicarEtiqueta, recordMessage, recordStatus } from '@/lib/whatsapp/store'

export const dynamic = 'force-dynamic'

// POST /api/whatsapp/webhook - eventos do Evolution API (público, protegido pelo segredo no cabeçalho)
export async function POST(request: NextRequest) {
  const cfg = whatsappConfig()
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!segredoConfere(request.headers.get('x-projete-secret'), cfg.secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  let gravadas = 0
  for (const ev of parseWebhook(body)) {
    try {
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
      }
    } catch (error) {
      // Um evento ruim não derruba os outros nem faz o Evolution reenviar em loop.
      console.error('[api/whatsapp/webhook] evento falhou:', error)
    }
  }
  return NextResponse.json({ ok: true, gravadas })
}
