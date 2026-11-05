import { financeRead } from '@/lib/financeiro/api'
import { getTitulos } from '@/lib/financeiro/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  return financeRead('titulos', () => getTitulos({ tipo: q.get('tipo') === 'pagar' ? 'DESPESA' : 'RECEITA', filtro: q.get('filtro') ?? 'vencido' }))
}
