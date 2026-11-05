import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { aguardandoResposta, NOVA_CONVERSA_DIAS, seesAllConversations } from '@/lib/whatsapp/access'
import { CONVERSA_SELECT, scopeWhere, whatsappGuard, type ConversaRow } from '@/lib/whatsapp/api'
import { connectionStateCached } from '@/lib/whatsapp/evolution'

export const dynamic = 'force-dynamic'

const FILTROS = ['minhas', 'em-aberto', 'todas', 'novas', 'arquivadas'] as const
type Filtro = typeof FILTROS[number]

// GET /api/whatsapp/conversas?filtro=minhas|em-aberto|todas|novas|arquivadas&cnpj=&busca=
export async function GET(request: NextRequest) {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  const { session, cfg } = guard
  const sp = new URL(request.url).searchParams
  const gestao = seesAllConversations(session.role)
  const pedido = sp.get('filtro') as Filtro | null
  const filtro: Filtro = pedido && FILTROS.includes(pedido) && (gestao || pedido !== 'novas')
    ? pedido : gestao ? 'todas' : 'minhas'

  const where = [`wc.instancia = $1`, scopeWhere(session.role)]
  const params: unknown[] = [cfg.instance, session.userId]
  // "Minhas": direcionadas a mim, ou sem direcionamento e de lead meu.
  if (filtro === 'minhas') {
    where.push(`wc.arquivada_em IS NULL AND (wc.atendente_id = $2 OR (wc.atendente_id IS NULL AND wc.lead_cnpj IN (
      SELECT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') FROM vendedor_projetos vp WHERE vp.vendedor_id = $2 OR vp.closer_id = $2)))`)
  } else if (filtro === 'em-aberto') {
    where.push(`wc.lead_cnpj IS NULL AND wc.atendente_id IS NULL AND wc.arquivada_em IS NULL`)
  } else if (filtro === 'novas') {
    params.push(NOVA_CONVERSA_DIAS)
    where.push(`wc.created_at >= NOW() - $${params.length}::int * INTERVAL '1 day'`)
  } else if (filtro === 'arquivadas') {
    where.push(`wc.arquivada_em IS NOT NULL`)
  } else {
    where.push(`wc.arquivada_em IS NULL`)
  }
  const cnpj = sp.get('cnpj')?.replace(/\D/g, '')
  if (cnpj) {
    params.push(cnpj)
    where.push(`wc.lead_cnpj = $${params.length}`)
  }
  const busca = sp.get('busca')?.trim()
  if (busca) {
    params.push(`%${busca}%`, `%${busca.replace(/\D/g, '') || '§'}%`)
    where.push(`(wc.nome_contato ILIKE $${params.length - 1} OR wc.telefone LIKE $${params.length}
      OR EXISTS (SELECT 1 FROM vendedor_projetos vp WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = wc.lead_cnpj AND vp.nome ILIKE $${params.length - 1}))`)
  }

  const [rows, estado] = await Promise.all([
    query<ConversaRow>(
      `${CONVERSA_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${filtro === 'novas' ? 'wc.created_at DESC' : 'wc.ultima_mensagem_em DESC NULLS LAST'} LIMIT 200`,
      params
    ),
    connectionStateCached(),
  ])
  return NextResponse.json({
    filtro,
    estado,
    conversas: rows.map((c) => ({ ...c, aguardando: aguardandoResposta(c) })),
  })
}
