import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'NOT SET'
  const host = dbUrl.replace(/^.*@/, '').replace(/\/.*$/, '').replace(/:.*$/, '')

  try {
    const start = Date.now()
    const rows = await query('SELECT 1 as ok, current_database() as db, now() as ts')
    const ms = Date.now() - start

    return NextResponse.json({
      status: 'ok',
      db_host: host,
      env_var: process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.POSTGRES_URL ? 'POSTGRES_URL' : 'NONE',
      latency_ms: ms,
      result: rows[0],
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      db_host: host,
      env_var: process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.POSTGRES_URL ? 'POSTGRES_URL' : 'NONE',
      error: String(error),
    }, { status: 500 })
  }
}
