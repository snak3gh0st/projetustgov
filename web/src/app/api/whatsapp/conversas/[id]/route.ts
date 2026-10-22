import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { aguardandoResposta, canManageConversations } from '@/lib/whatsapp/access'
import { conversaVisivel, whatsappGuard } from '@/lib/whatsapp/api'

export const dynamic = 'force-dynamic'

const PAGE = 50

// GET /api/whatsapp/conversas/[id]?antes=<iso> - conversa e mensagens (50 por página, da mais antiga para a mais nova)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  const conversa = await conversaVisivel(Number(params.id), guard.session, guard.cfg)
  if (!conversa) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const antes = new URL(request.url).searchParams.get('antes')
  const rows = await query<Record<string, unknown>>(
    `SELECT m.id, m.wa_id, m.direcao, m.origem, m.texto, m.tipo, m.midia, m.status, m.enviada_em, u.nome AS autor_nome
     FROM whatsapp_mensagens m LEFT JOIN users u ON u.id = m.autor_id
     WHERE m.conversa_id = $1 ${antes ? 'AND m.enviada_em < $2' : ''}
     ORDER BY m.enviada_em DESC, m.id DESC LIMIT ${PAGE + 1}`,
    antes ? [conversa.id, antes] : [conversa.id]
  )
  const mais = rows.length > PAGE
  return NextResponse.json({
    conversa: { ...conversa, aguardando: aguardandoResposta(conversa) },
    mensagens: rows.slice(0, PAGE).reverse(),
    mais,
  })
}

// PATCH /api/whatsapp/conversas/[id] { atendente_id?, lead_cnpj?, arquivar? } - só gestão
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  if (!canManageConversations(guard.session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const conversa = await conversaVisivel(Number(params.id), guard.session, guard.cfg)
  if (!conversa) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as { atendente_id?: string | null; lead_cnpj?: string | null; arquivar?: boolean }
  const sets: string[] = []
  const values: unknown[] = [conversa.id]

  if (body.atendente_id !== undefined) {
    if (body.atendente_id !== null) {
      const ok = await query(`SELECT 1 FROM users WHERE id = $1 AND active AND role IN ('vendedor', 'coordenador', 'gestor')`, [body.atendente_id])
      if (ok.length === 0) return NextResponse.json({ error: 'Atendente inválido' }, { status: 400 })
    }
    values.push(body.atendente_id)
    sets.push(`atendente_id = $${values.length}`)
  }
  if (body.lead_cnpj !== undefined) {
    const cnpj = body.lead_cnpj ? body.lead_cnpj.replace(/\D/g, '') : null
    if (cnpj) {
      const ok = await query(`SELECT 1 FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1 LIMIT 1`, [cnpj])
      if (ok.length === 0) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 400 })
    }
    values.push(cnpj)
    sets.push(`lead_cnpj = $${values.length}`)
  }
  if (body.arquivar !== undefined) sets.push(body.arquivar ? 'arquivada_em = NOW()' : 'arquivada_em = NULL')
  if (sets.length === 0) return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 })

  await query(`UPDATE whatsapp_conversas SET ${sets.join(', ')} WHERE id = $1`, values)
  return NextResponse.json({ ok: true })
}
