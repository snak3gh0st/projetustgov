// Página Leads: uma aba por funil. Sem ?fase= é Aprovação; Execução e Prestação usam a fase do TransfereGov.
import { SELLERS } from './areas'
import type { Role } from './roles'

export type LeadTab = 'aprovacao' | 'execucao' | 'prestacao_contas'

export const LEAD_TAB_LABEL: Record<LeadTab, string> = {
  aprovacao: 'Aprovação',
  execucao: 'Execução',
  prestacao_contas: 'Prestação de Contas',
}

// Quem tem Leads no menu vê os três funis (o visualizador já abria Execução pelos links da tela inicial).
export function leadTabsForRole(role: Role): LeadTab[] {
  return SELLERS.includes(role) ? ['aprovacao', 'execucao', 'prestacao_contas'] : []
}

export function resolveLeadTab(role: Role, fase: string | null | undefined): LeadTab {
  const tabs = leadTabsForRole(role)
  return tabs.includes(fase as LeadTab) ? (fase as LeadTab) : (tabs[0] ?? 'aprovacao')
}

export function leadsHref(tab: LeadTab, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  if (tab !== 'aprovacao') params.set('fase', tab)
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  const query = params.toString()
  return query ? `/leads?${query}` : '/leads'
}

/** /execucao antigo (menu, favoritos, links da tela inicial) cai na aba certa, com os filtros. */
export function legacyExecucaoTarget(search: URLSearchParams): string {
  const fase = search.get('fase') === 'prestacao_contas' ? 'prestacao_contas' : 'execucao'
  const extra: Record<string, string> = {}
  search.forEach((value, key) => {
    if (key !== 'fase') extra[key] = value
  })
  return leadsHref(fase, extra)
}
