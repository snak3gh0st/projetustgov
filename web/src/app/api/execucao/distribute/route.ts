import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { distributeUnassignedExecucao } from '@/lib/distribute-execucao'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await getApiSession()
    if (!session || session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
    }
    const result = await distributeUnassignedExecucao()
    if (result.skipped) {
      return NextResponse.json(result, { status: 409 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/execucao/distribute] Error:', error)
    return NextResponse.json({ error: 'Failed to distribute' }, { status: 500 })
  }
}
