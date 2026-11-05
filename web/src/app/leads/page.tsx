import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { leadTabsForRole } from '@/lib/lead-tabs'
import LeadsTabs from './LeadsTabs'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { status?: string; alert_only?: string }
}) {
  const session = await verifySession()
  if (session.role === 'adm_produto') {
    redirect('/sem-permissao')
  }
  // Perfis fora do Comercial que já abriam /leads direto continuam vendo a lista de Aprovação.
  const tabs = leadTabsForRole(session.role)
  return (
    <LeadsTabs
      role={session.role}
      tabs={tabs.length > 0 ? tabs : ['aprovacao']}
      initialStatus={searchParams.status ?? ''}
      initialAlertOnly={searchParams.alert_only === 'true'}
    />
  )
}
