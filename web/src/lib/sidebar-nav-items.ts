export type NavRole =
  | 'gestor'
  | 'admin'
  | 'vendedor'
  | 'visualizador'
  | 'coordenador'
  | 'adm_produto'
  | 'csm'
  | 'coord_aprovacao'
  | 'assistente_aprovacao'
  | 'projetista'
  | 'coord_execucao'
  | 'assistente_execucao'
  | 'coord_prestacao'
  | 'assistente_prestacao'

export interface NavItem {
  href: string
  label: string
  icon: string
}

const LEADS_ITEM: NavItem = { href: '/leads', label: 'Lead Aprovacao', icon: 'leads' }
const EXECUCAO_ITEM: NavItem = { href: '/execucao', label: 'Lead Execucao', icon: 'execucao' }

const BASE_NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Pipeline', icon: 'pipeline' },
  LEADS_ITEM,
  { href: '/comissoes', label: 'Comissoes', icon: 'comissoes' },
  { href: '/bi', label: 'BI Analytics', icon: 'bi' },
  { href: '/monitorar', label: 'Meus Monitorados', icon: 'monitorar' },
]

const BASE_WITH_EXECUCAO: NavItem[] = [
  { href: '/', label: 'Pipeline', icon: 'pipeline' },
  LEADS_ITEM,
  EXECUCAO_ITEM,
  { href: '/comissoes', label: 'Comissoes', icon: 'comissoes' },
  { href: '/bi', label: 'BI Analytics', icon: 'bi' },
  { href: '/monitorar', label: 'Meus Monitorados', icon: 'monitorar' },
]

export function getNavItemsForRole(role: NavRole): NavItem[] {
  if (role === 'gestor' || role === 'admin') {
    return [
      ...BASE_WITH_EXECUCAO,
      { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
      { href: '/tgov', label: 'TGov BI', icon: 'pipeline' },
      { href: '/distribuir', label: 'Distribuir Leads', icon: 'distribuir' },
      { href: '/monitoramento', label: 'Monitoramento', icon: 'monitoramento' },
      { href: '/cadastro-vendedor', label: 'Usuarios', icon: 'vendedores' },
    ]
  }
  if (role === 'coordenador') {
    return [
      ...BASE_WITH_EXECUCAO,
      { href: '/distribuir', label: 'Distribuir Leads', icon: 'distribuir' },
      { href: '/monitoramento', label: 'Monitoramento', icon: 'monitoramento' },
    ]
  }
  if (role === 'visualizador') {
    return BASE_NAV_ITEMS.filter((item) => item.href !== '/monitorar')
  }
  if (role === 'adm_produto') {
    return [
      { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
      { href: '/tgov', label: 'TGov BI', icon: 'pipeline' },
      { href: '/cadastro-vendedor', label: 'Usuarios TGOV', icon: 'vendedores' },
    ]
  }
  if (role === 'csm') {
    return [
      { href: '/csm', label: 'Clientes CSM', icon: 'leads' },
      { href: '/csm/comissoes', label: 'Comissoes', icon: 'comissoes' },
      { href: '/csm/bi', label: 'BI Dashboard CSM', icon: 'bi' },
      { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
      { href: '/tgov', label: 'TGov BI', icon: 'pipeline' },
    ]
  }
  if (role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'coord_execucao' || role === 'coord_prestacao') {
    return [
      { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
      { href: '/tgov', label: 'TGov BI', icon: 'pipeline' },
      { href: '/cadastro-vendedor', label: 'Usuarios TGov', icon: 'vendedores' },
    ]
  }
  if (role === 'projetista' || role === 'assistente_execucao' || role === 'assistente_prestacao') {
    return [
      { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
      { href: '/tgov', label: 'TGov BI', icon: 'pipeline' },
    ]
  }
  return BASE_WITH_EXECUCAO
}
