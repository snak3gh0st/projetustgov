import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'gestor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { cnpj, force } = body

  if (!cnpj || typeof cnpj !== 'string') {
    return NextResponse.json({ error: 'cnpj is required' }, { status: 400 })
  }
  const cleanCnpj = cnpj.replace(/\D/g, '')
  if (cleanCnpj.length !== 14) {
    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
  }

  // Look up the current lead manager's user id
  const managerEmail = process.env.PRIMARY_LEAD_MANAGER_EMAIL || 'rooger@projetus.org'
  const managerRows = await query(
    'SELECT id, nome FROM users WHERE email = $1 AND active = true LIMIT 1',
    [managerEmail]
  )
  const managerId = managerRows[0]?.id
  const managerName = (managerRows[0]?.nome as string | undefined) || 'Rooger'
  if (!managerId) return NextResponse.json({ error: 'Gestor de leads não encontrado no sistema' }, { status: 404 })

  // Check if CNPJ exists in vendedor_projetos
  const existingLeads = await query(
    `SELECT id, cnpj, nome, vendedor_id FROM vendedor_projetos WHERE cnpj = $1 LIMIT 10`,
    [cleanCnpj]
  )

  if (existingLeads.length === 0) {
    return NextResponse.json({ error: `CNPJ ${cleanCnpj} não encontrado na base de leads` }, { status: 404 })
  }

  // Check if already assigned to someone else (unless force override)
  if (!force) {
    const alreadyAssigned = existingLeads.find(
      (l) => l.vendedor_id && l.vendedor_id !== managerId
    )
    if (alreadyAssigned) {
      return NextResponse.json({
        error: `CNPJ já está atribuído a outro vendedor`,
        current_vendedor_id: alreadyAssigned.vendedor_id,
        conflict: true,
      }, { status: 409 })
    }
  }

  // Assign all rows for this CNPJ to the current lead manager (tipo_vendedor = 'In-Sites Sells')
  await query(
    `UPDATE vendedor_projetos
     SET vendedor_id = $1, tipo_vendedor = 'In-Sites Sells', updated_at = NOW()
     WHERE cnpj = $2`,
    [managerId, cleanCnpj]
  )

  const nomeLead = existingLeads[0]?.nome || cleanCnpj
  return NextResponse.json({
    success: true,
    message: `${nomeLead} atribuído a ${managerName} como In-Sites Sells`,
    cnpj: cleanCnpj,
    nome: nomeLead,
    rows_updated: existingLeads.length,
  })
}
