import { query } from '@/lib/db'
import { financeRead } from '@/lib/financeiro/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  return financeRead('centros', () =>
    query<{ id: string; nome: string }>(`SELECT id, nome FROM conta_azul_centros_custo WHERE ativo ORDER BY nome`)
  )
}
