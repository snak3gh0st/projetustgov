'use client'

import { useSearchParams } from 'next/navigation'
import { useRef } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import SectionTabs from '@/components/SectionTabs'
import { LEAD_TAB_LABEL, leadsHref, type LeadTab } from '@/lib/lead-tabs'
import type { Role } from '@/lib/roles'
import LeadsClient from './LeadsClient'
import ExecucaoClient from '../execucao/ExecucaoClient'

interface LeadsTabsProps {
  role: Role
  tabs: LeadTab[]
  initialStatus: string
  initialAlertOnly: boolean
}

function description(tab: LeadTab, role: Role): string {
  if (tab === 'execucao') return 'Proponentes com convênios em execução no TransfereGov.'
  if (tab === 'prestacao_contas') {
    return 'Proponentes com convênios em prestação de contas no TransfereGov. O status comercial é o mesmo da Execução, porque os serviços são vendidos juntos.'
  }
  return role === 'vendedor' || role === 'coordenador'
    ? 'Seus leads de emendas em aprovação.'
    : 'Emendas em aprovação de toda a equipe.'
}

// Uma página, um funil por aba. A aba vive na URL (?fase=) para links, favoritos e o botão voltar.
export default function LeadsTabs({ role, tabs, initialStatus, initialAlertOnly }: LeadsTabsProps) {
  const searchParams = useSearchParams()
  const fase = searchParams.get('fase')
  const tab: LeadTab = tabs.includes(fase as LeadTab) ? (fase as LeadTab) : tabs[0]
  // Filtros vindos do link (funil da tela inicial) valem só para a aba aberta pelo link.
  const linkedTab = useRef(tab)

  function changeTab(next: string) {
    window.history.replaceState(null, '', leadsHref(next as LeadTab))
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5">
      <PageHeader title="Leads" description={description(tab, role)} />
      {tabs.length > 1 && (
        <SectionTabs
          ariaLabel="Funil"
          value={tab}
          onChange={changeTab}
          tabs={tabs.map((id) => ({ id, label: LEAD_TAB_LABEL[id] }))}
        />
      )}
      {tab === 'aprovacao' ? (
        <LeadsClient key="aprovacao" />
      ) : (
        <ExecucaoClient
          key={tab}
          userRole={role}
          fase={tab}
          initialStatus={tab === linkedTab.current ? initialStatus : ''}
          initialAlertOnly={tab === linkedTab.current && initialAlertOnly}
          initialNovosOnly={tab === linkedTab.current && searchParams.get('novos') === 'true'}
        />
      )}
    </div>
  )
}
