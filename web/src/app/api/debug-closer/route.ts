import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// Temporary debug endpoint — gestor-only access
// Returns Paulo's user record + closer_id statistics to verify Aguardando Closer flow
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role !== 'gestor' && session.role !== 'gestor_vendedor') {
      return NextResponse.json({ error: 'Forbidden — gestor access only' }, { status: 403 })
    }

    // Paulo's user record
    const pauloRows = await query(
      `SELECT id, email, nome, role, active FROM users WHERE email = 'paulo@projetus.org'`
    )

    // Count of leads with closer_id set
    const closerCountRows = await query(
      `SELECT COUNT(*)::int as count FROM vendedor_projetos WHERE closer_id IS NOT NULL`
    )

    // Sample of leads with Aguardando Closer status
    const sampleRows = await query(
      `SELECT id, cnpj, nome, status_contato, closer_id FROM vendedor_projetos WHERE status_contato = 'Aguardando Closer' ORDER BY updated_at DESC LIMIT 10`
    )

    return NextResponse.json({
      paulo_user: pauloRows[0] ?? null,
      leads_with_closer_id_count: closerCountRows[0]?.count ?? 0,
      aguardando_closer_sample: sampleRows,
    })
  } catch (error) {
    console.error('Debug closer error:', error)
    return NextResponse.json({ error: 'Failed to fetch debug data' }, { status: 500 })
  }
}
