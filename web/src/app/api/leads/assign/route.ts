import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || session.role !== 'gestor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { lead_ids, vendedor_id } = body

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: 'lead_ids must be a non-empty array' }, { status: 400 })
    }

    if (!vendedor_id || typeof vendedor_id !== 'string') {
      return NextResponse.json({ error: 'vendedor_id is required' }, { status: 400 })
    }

    // Get CNPJs from the selected leads
    const cnpjRows = await query<{ cnpj: string }>(
      `SELECT DISTINCT cnpj FROM vendedor_projetos WHERE id = ANY($1)`,
      [lead_ids]
    )
    const cnpjs = cnpjRows.map(r => r.cnpj)

    // Check for warnings: CNPJs already assigned to a DIFFERENT vendedor
    const warnings: string[] = []
    if (cnpjs.length > 0) {
      const conflictRows = await query<{ cnpj: string; vendedor_nome: string }>(
        `SELECT DISTINCT vp.cnpj, u.nome as vendedor_nome
         FROM vendedor_projetos vp
         JOIN users u ON u.id = vp.vendedor_id
         WHERE vp.cnpj = ANY($1) AND vp.vendedor_id IS NOT NULL AND vp.vendedor_id != $2`,
        [cnpjs, vendedor_id]
      )
      for (const row of conflictRows) {
        warnings.push(`CNPJ ${row.cnpj} ja tem leads com ${row.vendedor_nome}`)
      }
    }

    // Assign all leads with matching CNPJs (not just the selected ones)
    const result = await query(
      `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW()
       WHERE cnpj = ANY($2) AND (vendedor_id IS NULL OR id = ANY($3))`,
      [vendedor_id, cnpjs, lead_ids]
    )

    const totalAssigned = result.length ?? 0
    const extraAssigned = Math.max(0, totalAssigned - lead_ids.length)

    return NextResponse.json({
      success: true,
      assigned_count: totalAssigned,
      selected_count: lead_ids.length,
      extra_by_cnpj: extraAssigned,
      warnings,
    })
  } catch (error) {
    console.error('Assign leads error:', error)
    return NextResponse.json({ error: 'Failed to assign leads' }, { status: 500 })
  }
}
