import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// GET: list all monitored CNPJs for the current user with contact + emenda info
export async function GET() {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await query(
    `SELECT DISTINCT ON (cm.cnpj)
       cm.id, cm.cnpj, cm.created_at,
       vp.nome, vp.email, vp.telefone, vp.municipio, vp.uf,
       vp.valor_emenda, vp.parlamentar, vp.nr_emenda
     FROM cnpj_monitorado cm
     LEFT JOIN vendedor_projetos vp ON REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = REGEXP_REPLACE(cm.cnpj, '[^0-9]', '', 'g')
     WHERE cm.user_id = $1
     ORDER BY cm.cnpj, vp.valor_emenda DESC NULLS LAST`,
    [session.userId]
  )

  return NextResponse.json(rows)
}

// POST: add a CNPJ to the current user's watchlist
export async function POST(request: NextRequest) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { cnpj?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawCnpj = body.cnpj
  if (!rawCnpj || typeof rawCnpj !== 'string') {
    return NextResponse.json({ error: 'cnpj is required' }, { status: 400 })
  }

  const cleanCnpj = rawCnpj.replace(/\D/g, '')
  if (cleanCnpj.length !== 14) {
    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
  }

  // Check if CNPJ exists in vendedor_projetos (normalize format for comparison)
  const exists = await query(
    `SELECT 1 FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1 LIMIT 1`,
    [cleanCnpj]
  )
  if (exists.length === 0) {
    return NextResponse.json({ error: 'CNPJ não encontrado na base de leads' }, { status: 404 })
  }

  // Try to insert — catch unique constraint for 409
  try {
    await query(
      'INSERT INTO cnpj_monitorado (user_id, cnpj) VALUES ($1, $2)',
      [session.userId, cleanCnpj]
    )
  } catch (err: unknown) {
    const pgErr = err as { code?: string }
    if (pgErr?.code === '23505') {
      return NextResponse.json({ error: 'CNPJ já monitorado' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ success: true, cnpj: cleanCnpj })
}

// DELETE: remove a CNPJ from the current user's watchlist
export async function DELETE(request: NextRequest) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { cnpj?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawCnpj = body.cnpj
  if (!rawCnpj || typeof rawCnpj !== 'string') {
    return NextResponse.json({ error: 'cnpj is required' }, { status: 400 })
  }

  const cleanCnpj = rawCnpj.replace(/\D/g, '')

  await query(
    'DELETE FROM cnpj_monitorado WHERE user_id = $1 AND cnpj = $2',
    [session.userId, cleanCnpj]
  )

  return NextResponse.json({ success: true })
}
