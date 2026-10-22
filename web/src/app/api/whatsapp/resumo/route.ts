import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { seesAllConversations } from '@/lib/whatsapp/access'
import { whatsappGuard } from '@/lib/whatsapp/api'

export const dynamic = 'force-dynamic'

// GET /api/whatsapp/resumo - conversas sem resposta por consultor e fila em aberto (gestão)
export async function GET() {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  if (!seesAllConversations(guard.session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Responsável: o atendente direcionado; sem ele, cada dono do lead.
  const porConsultor = await query<{ user_id: string; nome: string; aguardando: number; mais_antiga: string }>(
    `WITH pendentes AS (
       SELECT wc.id, wc.ultima_recebida_em, wc.atendente_id, wc.lead_cnpj
       FROM whatsapp_conversas wc
       WHERE wc.instancia = $1 AND wc.arquivada_em IS NULL AND wc.ultima_recebida_em IS NOT NULL
         AND (wc.ultima_enviada_em IS NULL OR wc.ultima_recebida_em > wc.ultima_enviada_em)
     ),
     responsaveis AS (
       SELECT p.id, p.ultima_recebida_em, p.atendente_id AS user_id FROM pendentes p WHERE p.atendente_id IS NOT NULL
       UNION
       SELECT p.id, p.ultima_recebida_em, vp.vendedor_id FROM pendentes p
       JOIN vendedor_projetos vp ON REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = p.lead_cnpj
       WHERE p.atendente_id IS NULL AND vp.vendedor_id IS NOT NULL
     )
     SELECT r.user_id, u.nome, COUNT(DISTINCT r.id)::int AS aguardando, MIN(r.ultima_recebida_em) AS mais_antiga
     FROM responsaveis r JOIN users u ON u.id = r.user_id
     GROUP BY r.user_id, u.nome ORDER BY aguardando DESC, u.nome`,
    [guard.cfg.instance]
  )
  const [aberto] = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM whatsapp_conversas
     WHERE instancia = $1 AND lead_cnpj IS NULL AND atendente_id IS NULL AND arquivada_em IS NULL`,
    [guard.cfg.instance]
  )
  return NextResponse.json({ porConsultor, emAberto: aberto?.total ?? 0 })
}
