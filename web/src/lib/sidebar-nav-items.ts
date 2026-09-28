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
  | 'gestor_financeiro'

export interface NavItem {
  href: string
  label: string
  icon: string
}

export type NavSection = 'Operação' | 'TransfereGov' | 'Inteligência' | 'Gestão' | 'Administração'

export const NAV_SECTION_ORDER: NavSection[] = [
  'Operação',
  'TransfereGov',
  'Inteligência',
  'Gestão',
  'Administração',
]

export function getNavSection(item: NavItem): NavSection {
  if (item.href === '/tgov/pipeline' || item.href === '/tgov?view=dashboard') return 'TransfereGov'
  if (item.href === '/bi' || item.href === '/tgov' || item.href === '/csm/bi') return 'Inteligência'
  if (
    item.href === '/comissoes' ||
    item.href.startsWith('/csm') ||
    item.href === '/produtos-digitais'
  ) return 'Gestão'
  if (item.href.startsWith('/admin') || item.href === '/cadastro-vendedor') return 'Administração'
  return 'Operação'
}

export function groupNavItems(items: NavItem[]): Array<{ section: NavSection; items: NavItem[] }> {
  return NAV_SECTION_ORDER
    .map(section => ({ section, items: items.filter(item => getNavSection(item) === section) }))
    .filter(group => group.items.length > 0)
}

const LEADS_ITEM: NavItem = { href: '/leads', label: 'Leads de aprovação', icon: 'leads' }
const EXECUCAO_ITEM: NavItem = { href: '/execucao', label: 'Leads de execução', icon: 'execucao' }
const OPERACAO_ITEM: NavItem = { href: '/operacao', label: 'Operação', icon: 'tgov' }

const BASE_NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Pipeline', icon: 'pipeline' },
  LEADS_ITEM,
  { href: '/comissoes', label: 'Comissões', icon: 'comissoes' },
  { href: '/bi', label: 'BI comercial', icon: 'bi' },
  { href: '/monitorar', label: 'Meus monitorados', icon: 'monitorar' },
]

const BASE_WITH_EXECUCAO: NavItem[] = [
  { href: '/', label: 'Pipeline', icon: 'pipeline' },
  LEADS_ITEM,
  EXECUCAO_ITEM,
  OPERACAO_ITEM,
  { href: '/comissoes', label: 'Comissões', icon: 'comissoes' },
  { href: '/bi', label: 'BI comercial', icon: 'bi' },
  { href: '/monitorar', label: 'Meus monitorados', icon: 'monitorar' },
]

export function getNavItemsForRole(role: NavRole): NavItem[] {
  if (role === 'gestor_financeiro') {
    return [
      { href: '/admin/conta-azul', label: 'Conta Azul', icon: 'comissoes' },
      { href: '/comissoes', label: 'Comissões', icon: 'comissoes' },
      { href: '/bi', label: 'BI comercial', icon: 'bi' },
    ]
  }
  if (role === 'gestor' || role === 'admin') {
    const adminOnlyItems =
      role === 'admin'
        ? [{ href: '/admin/system-health', label: 'Saúde do Sistema', icon: 'monitoramento' }]
        : []

    return [
      ...BASE_WITH_EXECUCAO,
      { href: '/tgov/pipeline', label: 'Pipeline de instrumentos', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'Painel de instrumentos', icon: 'tgov' },
      { href: '/tgov', label: 'Análises de instrumentos', icon: 'pipeline' },
      { href: '/csm', label: 'CSM Clientes', icon: 'leads' },
      { href: '/csm/comissoes', label: 'Comissões CSM', icon: 'comissoes' },
      { href: '/csm/bi', label: 'BI CSM', icon: 'bi' },
      { href: '/produtos-digitais', label: 'Produtos Digitais', icon: 'produtos' },
      { href: '/admin/conta-azul', label: 'Conta Azul', icon: 'comissoes' },
      { href: '/distribuir', label: 'Distribuir Leads', icon: 'distribuir' },
      { href: '/monitoramento', label: 'Monitoramento', icon: 'monitoramento' },
      ...adminOnlyItems,
      { href: '/cadastro-vendedor', label: 'Usuários', icon: 'vendedores' },
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
      OPERACAO_ITEM,
      { href: '/tgov/pipeline', label: 'Pipeline de instrumentos', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'Painel de instrumentos', icon: 'tgov' },
      { href: '/tgov', label: 'Análises de instrumentos', icon: 'pipeline' },
      { href: '/produtos-digitais', label: 'Produtos Digitais', icon: 'produtos' },
      { href: '/cadastro-vendedor', label: 'Usuários TGov', icon: 'vendedores' },
    ]
  }
  if (role === 'csm') {
    return [
      { href: '/csm', label: 'CSM', icon: 'csm' },
      OPERACAO_ITEM,
      { href: '/csm/comissoes', label: 'Comissões', icon: 'comissoes' },
      { href: '/csm/bi', label: 'BI CSM', icon: 'bi' },
      { href: '/tgov/pipeline', label: 'Pipeline de instrumentos', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'Painel de instrumentos', icon: 'tgov' },
      { href: '/tgov', label: 'Análises de instrumentos', icon: 'pipeline' },
    ]
  }
  if (role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'coord_execucao' || role === 'coord_prestacao') {
    return [
      OPERACAO_ITEM,
      { href: '/tgov/pipeline', label: 'Pipeline de instrumentos', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'Painel de instrumentos', icon: 'tgov' },
      { href: '/tgov', label: 'Análises de instrumentos', icon: 'pipeline' },
      { href: '/cadastro-vendedor', label: 'Usuários TGov', icon: 'vendedores' },
    ]
  }
  if (role === 'projetista' || role === 'assistente_execucao' || role === 'assistente_prestacao') {
    return [
      ...(role === 'assistente_execucao' || role === 'assistente_prestacao' ? [OPERACAO_ITEM] : []),
      { href: '/tgov/pipeline', label: 'Pipeline de instrumentos', icon: 'pipeline' },
      { href: '/tgov?view=dashboard', label: 'Painel de instrumentos', icon: 'tgov' },
      { href: '/tgov', label: 'Análises de instrumentos', icon: 'pipeline' },
    ]
  }
  return BASE_WITH_EXECUCAO
}
