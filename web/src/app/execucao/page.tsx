import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import ExecucaoClient from './ExecucaoClient'
import { parseExecucaoFase } from '@/lib/execucao-fase'

export default async function ExecucaoPage({
  searchParams,
}: {
  searchParams: { fase?: string; status?: string }
}) {
  const session = await verifySession()
  // Vendedores can see execucao — filtered to their CNPJs via API
  return (
    <ExecucaoClient
      userRole={session.role}
      // Sem fase na URL: Execução. 'todas' mostra as duas fases juntas.
      initialFase={searchParams.fase === 'todas' ? null : (parseExecucaoFase(searchParams.fase) ?? 'execucao')}
      initialStatus={searchParams.status ?? ''}
    />
  )
}
