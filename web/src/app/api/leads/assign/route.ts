import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only gestor can assign leads
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
    }

    const body = await request.json()
    const { cnpj, vendedor_id, force, lead_ids } = body

    // Support both CNPJ-based assignment (modal) and bulk assignment (multi-select)
    if (cnpj) {
      // Handle unassignment first (before vendedor_id check)
      if (body.unassign) {
        await query(
          `UPDATE vendedor_projetos SET vendedor_id = NULL, updated_at = NOW() WHERE cnpj = $1`,
          [cnpj]
        )
        return NextResponse.json({ success: true, unassigned: true, cnpj })
      }

      // CNPJ-based assignment (LEAD-01, LEAD-02)
      if (!vendedor_id) {
        return NextResponse.json({ error: 'vendedor_id required' }, { status: 400 })
      }

      // Check for duplicate assignment (LEAD-02)
      const existing = await query(
        `SELECT vendedor_id, u.nome as vendedor_nome
         FROM vendedor_projetos vp
         LEFT JOIN users u ON vp.vendedor_id = u.id
         WHERE vp.cnpj = $1 AND vp.vendedor_id IS NOT NULL
         LIMIT 1`,
        [cnpj]
      )

      if (existing.length > 0 && existing[0].vendedor_id !== vendedor_id && !force) {
        return NextResponse.json({
          warning: 'duplicate_assignment',
          message: `Este CNPJ já está atribuído a ${existing[0].vendedor_nome}`,
          current_vendedor: existing[0].vendedor_nome,
          can_override: true
        }, { status: 409 })
      }

      // Assign all projects for this CNPJ to the vendedor
      // First, count how many rows will be affected
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM vendedor_projetos WHERE cnpj = $1`,
        [cnpj]
      )
      const rowCount = parseInt(countResult[0]?.count || '0', 10)

      await query(
        `UPDATE vendedor_projetos
         SET vendedor_id = $1, updated_at = NOW()
         WHERE cnpj = $2`,
        [vendedor_id, cnpj]
      )

      return NextResponse.json({
        success: true,
        rows_updated: rowCount,
        cnpj,
        vendedor_id
      })
    } else if (lead_ids) {
      // Bulk assignment by lead IDs (backward compatibility)
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
      // Count affected rows first
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM vendedor_projetos
         WHERE cnpj = ANY($1) AND (vendedor_id IS NULL OR id = ANY($2))`,
        [cnpjs, lead_ids]
      )
      const totalAssigned = parseInt(countResult[0]?.count || '0', 10)

      await query(
        `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW()
         WHERE cnpj = ANY($2) AND (vendedor_id IS NULL OR id = ANY($3))`,
        [vendedor_id, cnpjs, lead_ids]
      )

      const extraAssigned = Math.max(0, totalAssigned - lead_ids.length)

      return NextResponse.json({
        success: true,
        assigned_count: totalAssigned,
        selected_count: lead_ids.length,
        extra_by_cnpj: extraAssigned,
        warnings,
      })
    } else {
      return NextResponse.json({ error: 'cnpj or lead_ids required' }, { status: 400 })
    }
  } catch (error) {
    console.error('Assign leads error:', error)
    return NextResponse.json({ error: 'Failed to assign leads' }, { status: 500 })
  }
}
