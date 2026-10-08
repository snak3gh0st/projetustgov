import 'server-only'
import { NextResponse } from 'next/server'
import { canReadBiFinanceiro, getApiSession } from '@/lib/dal'
import type { PeriodKey } from './assemble'

/** Runs a BI Financeiro read behind the finance-area permission, with uniform errors. */
export async function financeRead<T>(label: string, fn: () => Promise<T>): Promise<NextResponse> {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canReadBiFinanceiro(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await fn())
  } catch (error) {
    console.error(`[api/financeiro/${label}]`, error)
    return NextResponse.json({ error: 'Não foi possível carregar os dados financeiros.' }, { status: 500 })
  }
}

export function periodParam(v: string | null): PeriodKey {
  return v === 'ytd' || v === 'q' ? v : '12'
}

export function ccParam(v: string | null): string | null {
  return v && v !== 'all' ? v : null
}
