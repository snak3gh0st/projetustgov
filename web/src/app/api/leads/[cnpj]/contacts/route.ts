import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, verifyLeadAccess, canModifyData } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// GET /api/leads/[cnpj]/contacts - Fetch contacts for a lead
export async function GET(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cnpj = decodeURIComponent(params.cnpj)

    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contacts = await query(`
      SELECT lc.*, u.nome as created_by_nome
      FROM lead_contacts lc
      LEFT JOIN users u ON lc.created_by = u.id
      WHERE lc.lead_cnpj = $1
      ORDER BY lc.principal DESC, lc.created_at ASC
    `, [cnpj])

    return NextResponse.json(contacts)
  } catch (error) {
    console.error('Contacts fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}

// POST /api/leads/[cnpj]/contacts - Create a new contact
export async function POST(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canModifyData(session.role)) {
      return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })
    }

    const cnpj = decodeURIComponent(params.cnpj)

    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { nome_pessoa, cargo, telefone, email, telefone_status, principal } = body

    // Validate at least one of telefone or email is provided
    if ((!telefone || !telefone.trim()) && (!email || !email.trim())) {
      return NextResponse.json(
        { error: 'Pelo menos telefone ou email deve ser informado' },
        { status: 400 }
      )
    }

    // If marking as principal, unset all other principal contacts first
    if (principal) {
      await query(
        `UPDATE lead_contacts SET principal = false WHERE lead_cnpj = $1`,
        [cnpj]
      )
    }

    const result = await query(`
      INSERT INTO lead_contacts (lead_cnpj, nome_pessoa, cargo, telefone, email, telefone_status, principal, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      cnpj,
      nome_pessoa || null,
      cargo || null,
      telefone || null,
      email || null,
      telefone_status || 'desconhecido',
      principal || false,
      session.userId,
    ])

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error('Contact creation error:', error)
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 })
  }
}

// PATCH /api/leads/[cnpj]/contacts - Update a contact
export async function PATCH(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canModifyData(session.role)) {
      return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })
    }

    const cnpj = decodeURIComponent(params.cnpj)

    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // If marking as principal, unset all other principal contacts first
    if (fields.principal === true) {
      await query(
        `UPDATE lead_contacts SET principal = false WHERE lead_cnpj = $1`,
        [cnpj]
      )
    }

    // Build dynamic UPDATE
    const allowedFields = ['nome_pessoa', 'cargo', 'telefone', 'email', 'telefone_status', 'principal']
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
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(id)
    values.push(cnpj)

    await query(
      `UPDATE lead_contacts SET ${updates.join(', ')} WHERE id = $${paramIdx} AND lead_cnpj = $${paramIdx + 1}`,
      values
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact update error:', error)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}

// DELETE /api/leads/[cnpj]/contacts - Delete a contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canModifyData(session.role)) {
      return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })
    }

    const cnpj = decodeURIComponent(params.cnpj)

    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await query(
      `DELETE FROM lead_contacts WHERE id = $1 AND lead_cnpj = $2`,
      [id, cnpj]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact deletion error:', error)
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}
