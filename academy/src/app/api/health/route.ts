import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query<{ ok: number; ts: string }>('SELECT 1 AS ok, NOW()::text AS ts')

    return NextResponse.json({
      status: 'ok',
      db: rows[0],
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: String(error),
      },
      { status: 500 }
    )
  }
}
