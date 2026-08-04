import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { testConnection } from '@/lib/conta-azul/connection'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const company = await testConnection()
    return NextResponse.json({ ok: true, company })
  } catch (error) {
    console.error('Conta Azul test error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Test failed' },
      { status: 500 }
    )
  }
}
