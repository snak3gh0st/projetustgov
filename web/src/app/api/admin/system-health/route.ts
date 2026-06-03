import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { collectSystemHealth } from '@/lib/system-health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const snapshot = await collectSystemHealth()
    return NextResponse.json(snapshot)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to collect system health', details: String(error) },
      { status: 500 }
    )
  }
}
