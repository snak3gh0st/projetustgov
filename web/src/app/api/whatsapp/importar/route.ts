import { NextRequest, NextResponse } from 'next/server'
import { listarChats, whatsappConfig } from '@/lib/whatsapp/evolution'
import { segredoConfere } from '@/lib/whatsapp/segredo'
import { importarChat } from '@/lib/whatsapp/store'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 20
const DIAS = 365

// POST /api/whatsapp/importar { pagina, ate } - histórico do último ano até `ate` (o momento da reconexão), 20 chats por
// chamada (servidor a servidor, com o segredo). O que chegou depois de `ate` já entrou pelo webhook.
export async function POST(request: NextRequest) {
  const cfg = whatsappConfig()
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!segredoConfere(request.headers.get('x-projete-secret'), cfg.secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({})) as { pagina?: number; ate?: string }
  const pagina = Number.isSafeInteger(body.pagina) && body.pagina! >= 0 ? body.pagina! : 0
  const ate = new Date(body.ate ?? '')
  if (Number.isNaN(ate.getTime())) return NextResponse.json({ error: 'Informe ate (data e hora da reconexão).' }, { status: 400 })
  const desde = new Date(Date.now() - DIAS * 86_400_000)

  const todos = await listarChats()
  const chats = todos.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  let mensagens = 0
  let novas = 0
  const falhas: string[] = []
  for (const chat of chats) {
    const { jid } = chat
    // Com syncFullHistory o Evolution guarda grupos; conversa é só de contato.
    if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) continue
    try {
      const r = await importarChat(cfg.instance, chat, desde, ate)
      mensagens += r.mensagens
      novas += r.novas
    } catch (error) {
      console.error('[api/whatsapp/importar] chat falhou:', jid, error)
      falhas.push(jid)
    }
  }
  const proxima = (pagina + 1) * POR_PAGINA < todos.length ? pagina + 1 : null
  return NextResponse.json({ total: todos.length, chats: chats.length, mensagens, novas, falhas, proxima })
}
