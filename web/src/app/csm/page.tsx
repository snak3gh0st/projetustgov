import { verifySession, canCsm } from '@/lib/dal'
import { redirect } from 'next/navigation'
import CsmDashboardClient from './CsmDashboardClient'
import ExecucaoClient from '@/app/execucao/ExecucaoClient'
import Link from 'next/link'

interface CsmPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function CsmPage({ searchParams }: CsmPageProps) {
  const session = await verifySession()
  if (!canCsm(session.role)) {
    redirect('/sem-permissao')
  }
  const { tab } = await searchParams
  return <CsmTabsClient userRole={session.role} userName={session.name ?? null} initialTab={tab} />
}

type Tab = 'dashboard' | 'projetos' | 'crm' | 'comissoes'

function CsmTabsClient({ userRole, userName, initialTab }: { userRole: string; userName: string | null; initialTab?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const currentTab: Tab = (initialTab as Tab) || 'dashboard'
  
  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projetos', label: 'Projetos' },
    { id: 'crm', label: 'CRM' },
    { id: 'comissoes', label: 'Comissões' },
  ]

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {tabs.map(tab => {
            const isActive = currentTab === tab.id
            return (
              <Link
                key={tab.id}
                href={`/csm?tab=${tab.id}`}
                className={`
                  whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors
                  ${isActive
                    ? 'border-[#0072F7] text-[#0072F7]'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {currentTab === 'dashboard' && <CsmDashboardClient userRole={userRole} userName={userName} />}
      {currentTab === 'projetos' && <CsmDashboardClient userRole={userRole} userName={userName} />}
      {currentTab === 'crm' && <ExecucaoClient userRole={userRole} />}
      {currentTab === 'comissoes' && (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          <Link href="/csm/comissoes" className="text-[#0072F7] hover:underline">
            Ir para Comissões →
          </Link>
        </div>
      )}
    </div>
  )
}
