'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CsmDashboardClient from './CsmDashboardClient'
import ExecucaoClient from '@/app/execucao/ExecucaoClient'
import SectionTabs from '@/components/SectionTabs'

type Tab = 'clientes' | 'operacao' | 'comissoes'

interface CsmTabsClientProps {
  userRole: string
  userName: string | null
  initialTab?: string
}

export default function CsmTabsClient({ userRole, userName, initialTab }: CsmTabsClientProps) {
  const router = useRouter()
  const currentTab: Tab = initialTab === 'crm'
    ? 'operacao'
    : initialTab === 'comissoes'
      ? 'comissoes'
      : 'clientes'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clientes', label: 'Clientes' },
    { id: 'operacao', label: 'Operação' },
    { id: 'comissoes', label: 'Comissões' },
  ]

  return (
    <div className="space-y-6">
      <SectionTabs
        ariaLabel="Área de Customer Success"
        value={currentTab}
        onChange={value => router.push(`/csm?tab=${value}`)}
        tabs={tabs}
      />

      {currentTab === 'clientes' && <CsmDashboardClient userRole={userRole} userName={userName} />}
      {currentTab === 'operacao' && <ExecucaoClient userRole={userRole} />}
      {currentTab === 'comissoes' && (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          <Link href="/csm/comissoes" className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50">
            Abrir comissões
          </Link>
        </div>
      )}
    </div>
  )
}
