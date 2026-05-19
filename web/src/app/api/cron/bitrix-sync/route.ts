import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { processBitrixQueue } from '@/lib/bitrix-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const session = await getApiSession()
    if (!session || session.role !== 'gestor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await processBitrixQueue({ limit: 100 })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[cron/bitrix-sync] failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
