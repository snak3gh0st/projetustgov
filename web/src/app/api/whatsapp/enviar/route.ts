import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { canEditLeads, verifyLeadAccess } from '@/lib/dal'
import { query } from '@/lib/db'
import { SendLimiter } from '@/lib/whatsapp/access'
import { conversaVisivel, whatsappGuard } from '@/lib/whatsapp/api'
import { sendText } from '@/lib/whatsapp/evolution'
import { canonicalPhone } from '@/lib/whatsapp/phone'
import { recordMessage } from '@/lib/whatsapp/store'

export const dynamic = 'force-dynamic'

// Proteção do número: no máximo 20 envios por minuto por pessoa.
const limiter = new SendLimiter(20, 60_000)

// POST /api/whatsapp/enviar { conversa_id?, telefone?, cnpj?, texto }
export async function POST(request: NextRequest) {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  const { session, cfg } = guard
  if (!canEditLeads(session.role)) return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { conversa_id?: number; telefone?: string; cnpj?: string; texto?: string }
  const texto = (body.texto ?? '').trim()
  if (!texto || texto.length > 4096) return NextResponse.json({ error: 'Escreva uma mensagem de até 4096 caracteres.' }, { status: 400 })

  let destino: string | null = null
  let jid: string | null = null
  let cnpj: string | null = null
  if (body.conversa_id) {
    const conversa = await conversaVisivel(Number(body.conversa_id), session, cfg)
    if (!conversa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    destino = canonicalPhone(conversa.telefone)
    jid = conversa.jid
  } else {
    destino = canonicalPhone(body.telefone)
    if (!destino) return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
    cnpj = body.cnpj?.replace(/\D/g, '') || null
    // Começar conversa pelo card: só com lead que a pessoa enxerga.
    if (!cnpj) return NextResponse.json({ error: 'Informe o lead da conversa.' }, { status: 400 })
    const stored = await query<{ cnpj: string }>(`SELECT cnpj FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1 LIMIT 1`, [cnpj])
    if (!stored[0] || !(await verifyLeadAccess(stored[0].cnpj, session.userId, session.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (!limiter.allow(session.userId)) {
    return NextResponse.json({ error: 'Muitos envios em sequência. Espere um minuto.' }, { status: 429 })
  }

  const numero = destino ?? jid!
  const base = {
    kind: 'mensagem' as const, instancia: cfg.instance, telefone: destino, jid: destino ? `${destino}@s.whatsapp.net` : jid!,
    nome: null, fromMe: true, texto, tipo: 'texto' as const, midia: null, enviadaEm: new Date().toISOString(),
  }
  try {
    const { waId } = await sendText(numero, texto)
    const gravada = await recordMessage({ ...base, waId }, { origem: 'projete', autorId: session.userId })
    if (cnpj) await query(`UPDATE whatsapp_conversas SET lead_cnpj = $2 WHERE id = $1 AND lead_cnpj IS NULL`, [gravada.conversaId, cnpj])
    return NextResponse.json({ ok: true, conversa_id: gravada.conversaId, mensagem_id: gravada.mensagemId })
  } catch (error) {
    console.error('[api/whatsapp/enviar] falhou:', error)
    // Fica registrada como não enviada, para a pessoa ver e tentar de novo.
    const falha = await recordMessage({ ...base, waId: `FALHA-${randomUUID()}` }, { origem: 'projete', autorId: session.userId, status: 'falhou' })
    if (cnpj) await query(`UPDATE whatsapp_conversas SET lead_cnpj = $2 WHERE id = $1 AND lead_cnpj IS NULL`, [falha.conversaId, cnpj])
    return NextResponse.json({ error: 'Não foi possível enviar pelo WhatsApp.', conversa_id: falha.conversaId }, { status: 502 })
  }
}
