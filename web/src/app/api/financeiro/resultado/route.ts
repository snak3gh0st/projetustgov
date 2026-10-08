import { ccParam, financeRead, periodParam } from '@/lib/financeiro/api'
import { getResultado } from '@/lib/financeiro/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  return financeRead('resultado', () =>
    getResultado({ period: periodParam(q.get('period')), regime: q.get('regime') === 'cash' ? 'cash' : 'comp', cc: ccParam(q.get('cc')) })
  )
}
