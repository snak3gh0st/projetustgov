import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MIGRATE_SECRET = process.env.MIGRATE_SECRET

export async function POST(request: Request) {
  const { secret, sql } = await request.json().catch(() => ({}))

  if (!MIGRATE_SECRET || secret !== MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!sql || typeof sql !== 'string') {
    return NextResponse.json({ error: 'Missing sql' }, { status: 400 })
  }

  try {
    await query(sql, [])
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
