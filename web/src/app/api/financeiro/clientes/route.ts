import { financeRead } from '@/lib/financeiro/api'
import { getClientesCrm } from '@/lib/financeiro/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  return financeRead('clientes', () => getClientesCrm())
}
