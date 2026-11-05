import { financeRead } from '@/lib/financeiro/api'
import { getOverview } from '@/lib/financeiro/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  return financeRead('overview', () => getOverview())
}
