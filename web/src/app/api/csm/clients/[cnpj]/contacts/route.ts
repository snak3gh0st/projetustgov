import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// CSM-03: GET lists contacts for any client (CSM has admin-style access — no per-lead ownership check).
// PATCH updates only telefone and email — never status_contato, comissao_*, principal, nome_pessoa, cargo,
// or telefone_status. Scope is intentionally narrower than /api/leads/[cnpj]/contacts (which uses verifyLeadAccess).
export async function GET(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canCsm(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cnpj = decodeURIComponent(params.cnpj).replace(/\D/g, '')

    const contacts = await query(`
      SELECT lc.*, u.nome as created_by_nome
      FROM lead_contacts lc
      LEFT JOIN users u ON lc.created_by = u.id
      WHERE lc.lead_cnpj = $1
      ORDER BY lc.principal DESC, lc.created_at ASC
    `, [cnpj])

    return NextResponse.json(contacts)
  } catch (error) {
    console.error('CSM contacts fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canCsm(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cnpj = decodeURIComponent(params.cnpj).replace(/\D/g, '')
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // CSM scope is intentionally restricted: only telefone and email are editable.
    // Do NOT add status_contato, comissao_*, principal, nome_pessoa, cargo, telefone_status — see Pitfall 6 in 22-RESEARCH.md.
    const allowedFields = ['telefone', 'email']
    const updates: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`)
        values.push(fields[field])
        paramIdx++
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updatable fields supplied (allowed: telefone, email)' }, { status: 400 })
    }

    values.push(id)
    values.push(cnpj)

    await query(
      `UPDATE lead_contacts SET ${updates.join(', ')} WHERE id = $${paramIdx} AND lead_cnpj = $${paramIdx + 1}`,
      values
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('CSM contact update error:', error)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}
