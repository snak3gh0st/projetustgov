import { ccParam, financeRead, periodParam } from '@/lib/financeiro/api'
import { getCaixa } from '@/lib/financeiro/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  return financeRead('caixa', () => getCaixa({ period: periodParam(q.get('period')), cc: ccParam(q.get('cc')) }))
}
