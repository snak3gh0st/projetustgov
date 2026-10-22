import 'server-only'

import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { query } from '@/lib/db'
import { canUseWhatsapp, conversationScopeSql } from './access'
import { whatsappConfig, type WhatsappConfig } from './evolution'

type Session = NonNullable<Awaited<ReturnType<typeof getApiSession>>>

/** Sessão + canal configurado + papel que usa WhatsApp. Devolve a resposta de erro pronta quando falha. */
export async function whatsappGuard(): Promise<{ session: Session; cfg: WhatsappConfig } | NextResponse> {
  const cfg = whatsappConfig()
  if (!cfg) return NextResponse.json({ error: 'WhatsApp não configurado' }, { status: 404 })
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canUseWhatsapp(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return { session, cfg }
}

export interface ConversaRow {
  id: number
  telefone: string
  jid: string
  nome_contato: string | null
  lead_cnpj: string | null
  lead_nome: string | null
  atendente_id: string | null
  atendente_nome: string | null
  donos: string[] | null
  donos_nomes: string | null
  arquivada_em: string | null
  ultima_recebida_em: string | null
  ultima_enviada_em: string | null
  ultima_mensagem_em: string | null
  ultima_previa: string | null
  nao_lidas: number
}

const LEAD_DO_CNPJ = `REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = wc.lead_cnpj`

/** SELECT de conversas com nome do lead, donos e atendente. $1 = instância, $2 = usuário (escopo). */
export const CONVERSA_SELECT = `
  SELECT wc.id, wc.telefone, wc.jid, wc.nome_contato, wc.lead_cnpj, wc.atendente_id, wc.arquivada_em,
         wc.ultima_recebida_em, wc.ultima_enviada_em, wc.ultima_mensagem_em, wc.ultima_previa, wc.nao_lidas,
         (SELECT MAX(vp.nome) FROM vendedor_projetos vp WHERE ${LEAD_DO_CNPJ}) AS lead_nome,
         (SELECT ARRAY_AGG(DISTINCT vp.vendedor_id::text) FROM vendedor_projetos vp WHERE ${LEAD_DO_CNPJ} AND vp.vendedor_id IS NOT NULL) AS donos,
         (SELECT STRING_AGG(DISTINCT u2.nome, ', ') FROM vendedor_projetos vp JOIN users u2 ON u2.id = vp.vendedor_id WHERE ${LEAD_DO_CNPJ}) AS donos_nomes,
         ua.nome AS atendente_nome
  FROM whatsapp_conversas wc
  LEFT JOIN users ua ON ua.id = wc.atendente_id
`

/** Escopo com $2 = usuário; o parâmetro é sempre referenciado (para a gestão o escopo é TRUE e o $2 sobraria). */
export const scopeWhere = (role: string) => `(${conversationScopeSql(role, '$2')} AND $2::text IS NOT NULL)`

/** Uma conversa visível para o usuário, ou null. */
export async function conversaVisivel(id: number, session: Session, cfg: WhatsappConfig): Promise<ConversaRow | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const rows = await query<ConversaRow>(
    `${CONVERSA_SELECT} WHERE wc.instancia = $1 AND wc.id = $3 AND ${scopeWhere(session.role)}`,
    [cfg.instance, session.userId, id]
  )
  return rows[0] ?? null
}
