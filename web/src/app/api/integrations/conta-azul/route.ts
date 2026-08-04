import { NextResponse } from 'next/server'
import { canManageContaAzul, getApiSession } from '@/lib/dal'
import { disconnectConnection, getConnectionStatus } from '@/lib/conta-azul/connection'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session || !canManageContaAzul(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const status = await getConnectionStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error('Conta Azul status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load status' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const session = await getApiSession()
    if (!session || !canManageContaAzul(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await disconnectConnection(session.userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Conta Azul disconnect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect' },
      { status: 500 }
    )
  }
}
