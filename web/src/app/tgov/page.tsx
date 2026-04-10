import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import TGovDashboardClient from './TGovDashboardClient'

export default async function TGovPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; highlight?: string; status?: string; tab?: string }>
}) {
  const session = await verifySession()

  // Role guard: all TGov roles (aprovação + execução) may access /tgov
  if (
    session.role !== 'gestor' &&
    session.role !== 'admin' &&
    session.role !== 'adm_produto' &&
    session.role !== 'csm' &&
    session.role !== 'coord_aprovacao' &&
    session.role !== 'projetista' &&
    session.role !== 'assistente_aprovacao' &&
    session.role !== 'coord_execucao' &&
    session.role !== 'assistente_execucao' &&
    session.role !== 'projetista_execucao'
  ) {
    redirect('/sem-permissao')
  }

  const { view, highlight, status, tab } = await searchParams
  const resolvedView = view === 'dashboard' ? 'dashboard' : 'pipeline'
  const validTab = tab === 'execucao' || tab === 'prestacao_contas' || tab === 'aprovacao' ? tab : undefined

  return (
    <TGovDashboardClient
      userRole={session.role}
      view={resolvedView}
      highlight={highlight}
      initialStatus={status}
      initialTabParam={validTab}
    />
  )
}
