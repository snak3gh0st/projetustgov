import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, verifyLeadAccess, canModifyData } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// GET /api/leads/[cnpj]/notes - Fetch contact notes for a lead
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

    // Verify access to this lead
    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch all contact notes for this CNPJ
    const notes = await query(`
      SELECT
        cn.*,
        u.nome as vendedor_nome
      FROM contact_notes cn
      LEFT JOIN users u ON cn.vendedor_id = u.id
      WHERE cn.lead_cnpj = $1
      ORDER BY cn.created_at DESC
    `, [cnpj])

    return NextResponse.json(notes)
  } catch (error) {
    console.error('Contact notes fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
}

// POST /api/leads/[cnpj]/notes - Create new contact note
export async function POST(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Visualizador cannot create notes
    if (!canModifyData(session.role)) {
      return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })
    }

    const cnpj = decodeURIComponent(params.cnpj)
    const body = await request.json()
    const { tipo, observacao } = body

    // Validate tipo
    const validTipos = ['ligacao', 'email', 'whatsapp', 'reuniao', 'outro']
    if (!tipo || !validTipos.includes(tipo)) {
      return NextResponse.json({ error: 'Invalid tipo' }, { status: 400 })
    }

    // Verify access to this lead
    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Create note
    const result = await query(`
      INSERT INTO contact_notes (lead_cnpj, vendedor_id, tipo, observacao)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [cnpj, session.userId, tipo, observacao || null])

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error('Contact note creation error:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
