import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { conversaVisivel, whatsappGuard } from '@/lib/whatsapp/api'
import { conversationScopeSql, seesAllConversations } from '@/lib/whatsapp/access'

export const dynamic = 'force-dynamic'

const input = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('assumir') }).strict(),
  z.object({ acao: z.literal('concluir'), recebida_em: z.string().datetime({ offset: true }).nullable(), recebida_id: z.string().regex(/^\d{1,19}$/).nullable() }).strict(),
  z.object({ acao: z.literal('reabrir') }).strict(),
])

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await whatsappGuard(request)
  if (guard instanceof NextResponse) return guard
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ação de atendimento inválida.' }, { status: 400 })
  const c = await conversaVisivel(params.id, guard.session, guard.cfg)
  if (!c) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  const { userId, role } = guard.session
  const { acao } = parsed.data
  let rows: { id: number }[]
  if (acao === 'assumir') {
    // The compare-and-set prevents two consultants from claiming the same queue item.
    rows = await query(`UPDATE whatsapp_conversas SET atendente_id = $2, arquivada_em = NULL
      WHERE id = $1 AND lead_cnpj IS NULL AND (atendente_id IS NULL OR atendente_id = $2)
      RETURNING id`, [c.id, userId])
  } else {
    const scope = conversationScopeSql(role, '$2', 'whatsapp_conversas')
    const responsible = seesAllConversations(role) ? 'TRUE' : '(lead_cnpj IS NOT NULL OR atendente_id = $2)'
    if (acao === 'concluir') {
      rows = await query(`UPDATE whatsapp_conversas SET resolvida_ate = ultima_recebida_em,
        resolvida_em = NOW(), resolvida_por = $2, nao_lidas = 0
        WHERE id = $1 AND ${scope} AND ${responsible}
          AND ultima_recebida_em IS NOT DISTINCT FROM $3::timestamptz
          AND ultima_recebida_id IS NOT DISTINCT FROM $4::bigint RETURNING id`,
      [c.id, userId, parsed.data.recebida_em, parsed.data.recebida_id])
    } else {
      rows = await query(`UPDATE whatsapp_conversas SET resolvida_ate = NULL, resolvida_em = NULL,
        resolvida_por = NULL, arquivada_em = NULL WHERE id = $1 AND ${scope} AND ${responsible} RETURNING id`, [c.id, userId])
    }
  }
  if (!rows.length) return NextResponse.json({ error: 'A conversa mudou ou foi assumida por outra pessoa. Atualize antes de continuar.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
