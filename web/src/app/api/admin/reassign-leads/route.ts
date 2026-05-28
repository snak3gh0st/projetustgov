import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// POST /api/admin/reassign-leads
// Body: { fromEmail: string, toEmail: string, confirm?: boolean, includeClosed?: boolean }
// Gestor only — dry-runs by default. confirm=true is required to move open leads.
export async function POST(request: NextRequest) {
  const session = await getApiSession()
  if (!session || session.role !== 'gestor') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fromEmail, toEmail, confirm, includeClosed } = await request.json()
  if (!fromEmail || !toEmail) {
    return NextResponse.json({ error: 'fromEmail e toEmail são obrigatórios' }, { status: 400 })
  }

  const fromRows = await query<{ id: string }>('SELECT id, nome FROM users WHERE email = $1 LIMIT 1', [fromEmail])
  if (fromRows.length === 0) return NextResponse.json({ error: `Usuário não encontrado: ${fromEmail}` }, { status: 404 })

  const toRows = await query<{ id: string; nome: string }>('SELECT id, nome FROM users WHERE email = $1 LIMIT 1', [toEmail])
  if (toRows.length === 0) return NextResponse.json({ error: `Usuário não encontrado: ${toEmail}` }, { status: 404 })

  const fromId = fromRows[0].id
  const toId = toRows[0].id
  const protectClosedDeals = !includeClosed
  const protectionClause = protectClosedDeals
    ? "AND COALESCE(status_contato, '') != 'Fechado' AND COALESCE(comissao_locked, false) = false"
    : ''

  const summary = await query<{
    total_rows: string
    distinct_cnpjs: string
    closed_or_locked_rows: string
    movable_rows: string
    commission_value: string
  }>(
    `SELECT
       COUNT(*)::int AS total_rows,
       COUNT(DISTINCT cnpj)::int AS distinct_cnpjs,
       COUNT(*) FILTER (
         WHERE COALESCE(status_contato, '') = 'Fechado'
            OR COALESCE(comissao_locked, false) = true
       )::int AS closed_or_locked_rows,
       COUNT(*) FILTER (
         WHERE ${protectClosedDeals
           ? "COALESCE(status_contato, '') != 'Fechado' AND COALESCE(comissao_locked, false) = false"
           : 'true'}
       )::int AS movable_rows,
       COALESCE(SUM(comissao_valor), 0)::numeric(15,2) AS commission_value
     FROM vendedor_projetos
     WHERE vendedor_id = $1`,
    [fromId]
  )
  const before = summary[0] ?? {
    total_rows: '0',
    distinct_cnpjs: '0',
    closed_or_locked_rows: '0',
    movable_rows: '0',
    commission_value: '0',
  }

  if (!confirm) {
    return NextResponse.json({
      dryRun: true,
      from: fromEmail,
      to: toEmail,
      toNome: toRows[0].nome,
      protectedClosedDeals: protectClosedDeals,
      ...before,
    })
  }

  const result = await query<{ id: number }>(
    `UPDATE vendedor_projetos
     SET vendedor_id = $1, updated_at = NOW()
     WHERE vendedor_id = $2
       ${protectionClause}
     RETURNING id`,
    [toId, fromId]
  )

  return NextResponse.json({
    success: true,
    reassigned: result.length,
    from: fromEmail,
    to: toEmail,
    toNome: toRows[0].nome,
  })
}
