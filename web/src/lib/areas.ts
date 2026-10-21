// O PROJETE é organizado por áreas, uma por equipe. Cada perfil tem uma área principal
// (onde entra) e, quando trabalha em mais de uma, troca pela barra de áreas.
// Tela isolada de outra área fica no menu da área principal do perfil.
import type { Role } from './roles'

export type AreaId = 'comercial' | 'operacao' | 'financeiro' | 'gestao' | 'admin'

export const AREAS: Record<AreaId, { id: AreaId; label: string; short: string; icon: string }> = {
  comercial: { id: 'comercial', label: 'Comercial', short: 'Comercial', icon: 'pipeline' },
  operacao: { id: 'operacao', label: 'Operação TransfereGov', short: 'Operação', icon: 'tgov' },
  financeiro: { id: 'financeiro', label: 'Financeiro', short: 'Financeiro', icon: 'financeiro' },
  gestao: { id: 'gestao', label: 'Gestão', short: 'Gestão', icon: 'bi' },
  admin: { id: 'admin', label: 'Administração', short: 'Admin', icon: 'vendedores' },
}

export const AREA_COOKIE = 'projete-area'

export interface AreaNavItem {
  href: string
  label: string
  icon: string
  section?: 'Gestão'
}

type Item = AreaNavItem & { roles: Role[] }

const TGOV_TEAM: Role[] = [
  'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista',
  'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao', 'diretoria', 'admin',
]
const SELLERS: Role[] = ['vendedor', 'coordenador', 'visualizador', 'gestor', 'diretoria', 'admin']
const SELLERS_WITH_EXECUCAO: Role[] = ['vendedor', 'coordenador', 'gestor', 'diretoria', 'admin']
const CSM_VIEW: Role[] = ['csm', 'gestor', 'diretoria', 'admin']

const AREA_NAV: Record<AreaId, Item[]> = {
  comercial: [
    { href: '/', label: 'Pipeline', icon: 'pipeline', roles: SELLERS },
    { href: '/leads', label: 'Leads de aprovação', icon: 'leads', roles: SELLERS },
    { href: '/execucao?fase=execucao', label: 'Leads de execução', icon: 'execucao', roles: SELLERS_WITH_EXECUCAO },
    { href: '/execucao?fase=prestacao_contas', label: 'Leads de prestação de contas', icon: 'execucao', roles: SELLERS_WITH_EXECUCAO },
    { href: '/operacao', label: 'Operação', icon: 'tgov', roles: ['vendedor', 'coordenador'] },
    { href: '/csm', label: 'CSM Clientes', icon: 'csm', roles: CSM_VIEW },
    { href: '/csm/comissoes', label: 'Comissões CSM', icon: 'comissoes', roles: CSM_VIEW },
    { href: '/csm/bi', label: 'BI CSM', icon: 'bi', roles: CSM_VIEW },
    { href: '/comissoes', label: 'Comissões', icon: 'comissoes', roles: SELLERS },
    { href: '/bi', label: 'BI comercial', icon: 'bi', roles: SELLERS },
    { href: '/distribuir', label: 'Distribuir leads', icon: 'distribuir', section: 'Gestão', roles: ['coordenador', 'gestor', 'diretoria', 'admin'] },
    { href: '/produtos-digitais', label: 'Produtos Digitais', icon: 'produtos', section: 'Gestão', roles: ['gestor', 'diretoria', 'admin'] },
    { href: '/cadastro-vendedor', label: 'Equipe', icon: 'vendedores', section: 'Gestão', roles: ['gestor'] },
  ],
  operacao: [
    { href: '/operacao', label: 'Operação', icon: 'tgov', roles: [...TGOV_TEAM.filter((r) => r !== 'projetista')] },
    { href: '/tgov/pipeline', label: 'Pipeline de instrumentos', icon: 'pipeline', roles: TGOV_TEAM },
    { href: '/tgov?view=dashboard', label: 'Painel de instrumentos', icon: 'tgov', roles: TGOV_TEAM },
    { href: '/tgov', label: 'Análises de instrumentos', icon: 'pipeline', roles: TGOV_TEAM },
    { href: '/produtos-digitais', label: 'Produtos Digitais', icon: 'produtos', roles: ['adm_produto'] },
    { href: '/cadastro-vendedor', label: 'Usuários TGov', icon: 'vendedores', roles: ['adm_produto', 'coord_aprovacao', 'assistente_aprovacao', 'coord_execucao', 'coord_prestacao'] },
  ],
  financeiro: [
    { href: '/financeiro', label: 'BI Financeiro', icon: 'financeiro', roles: ['gestor_financeiro', 'diretoria', 'admin'] },
    { href: '/admin/conta-azul', label: 'Conta Azul', icon: 'conta-azul', roles: ['gestor_financeiro', 'diretoria', 'admin'] },
    { href: '/comissoes', label: 'Comissões a pagar', icon: 'comissoes', roles: ['gestor_financeiro'] },
    { href: '/bi', label: 'BI comercial', icon: 'bi', roles: ['gestor_financeiro'] },
  ],
  gestao: [
    { href: '/bi', label: 'BI comercial', icon: 'bi', roles: ['diretoria', 'admin'] },
    { href: '/csm/bi', label: 'BI CSM', icon: 'bi', roles: ['diretoria', 'admin'] },
    { href: '/financeiro', label: 'BI Financeiro', icon: 'financeiro', roles: ['diretoria', 'admin'] },
    { href: '/tgov', label: 'Análises de instrumentos', icon: 'pipeline', roles: ['diretoria', 'admin'] },
  ],
  admin: [
    { href: '/cadastro-vendedor', label: 'Usuários', icon: 'vendedores', roles: ['diretoria', 'admin'] },
    { href: '/admin/system-health', label: 'Saúde do sistema', icon: 'monitoramento', roles: ['admin'] },
  ],
}

const OPERACAO_ONLY: AreaId[] = ['operacao']

// Ordem = área principal primeiro.
const ROLE_AREAS: Record<Role, AreaId[]> = {
  vendedor: ['comercial'],
  coordenador: ['comercial'],
  visualizador: ['comercial'],
  gestor: ['comercial'],
  csm: ['comercial', 'operacao'],
  adm_produto: OPERACAO_ONLY,
  coord_aprovacao: OPERACAO_ONLY,
  assistente_aprovacao: OPERACAO_ONLY,
  projetista: OPERACAO_ONLY,
  coord_execucao: OPERACAO_ONLY,
  assistente_execucao: OPERACAO_ONLY,
  coord_prestacao: OPERACAO_ONLY,
  assistente_prestacao: OPERACAO_ONLY,
  gestor_financeiro: ['financeiro'],
  diretoria: ['gestao', 'comercial', 'operacao', 'financeiro', 'admin'],
  admin: ['comercial', 'operacao', 'financeiro', 'gestao', 'admin'],
}

export function getAreasForRole(role: Role): AreaId[] {
  return ROLE_AREAS[role] ?? ['comercial']
}

export function primaryAreaForRole(role: Role): AreaId {
  return getAreasForRole(role)[0]
}

export function getAreaNav(role: Role, area: AreaId): AreaNavItem[] {
  return AREA_NAV[area].filter((i) => i.roles.includes(role)).map(({ roles: _roles, ...item }) => item)
}

export function areaHome(role: Role, area: AreaId): string {
  return getAreaNav(role, area)[0]?.href ?? '/'
}

// Em /tgov compara ?view= e em /execucao compara ?fase= (sem fase = execução).
export function isNavItemActive(href: string, pathname: string, search: URLSearchParams): boolean {
  const [hrefPath, hrefQuery] = href.split('?')
  const hrefParams = new URLSearchParams(hrefQuery ?? '')
  if (hrefPath === '/') return pathname === '/'
  if (hrefPath === '/tgov') return pathname === '/tgov' && (search.get('view') ?? null) === (hrefParams.get('view') ?? null)
  if (hrefPath === '/execucao') return pathname === '/execucao' && (search.get('fase') ?? 'execucao') === hrefParams.get('fase')
  return pathname === hrefPath || pathname.startsWith(hrefPath + '/')
}

/** O item mais específico que casa com a rota (ex.: /csm/bi em vez de /csm). */
export function activeNavHref(hrefs: string[], pathname: string, search: URLSearchParams): string | null {
  const matches = hrefs.filter((h) => isNavItemActive(h, pathname, search))
  if (matches.length === 0) return null
  return matches.reduce((best, h) => (h.split('?')[0].length > best.split('?')[0].length ? h : best))
}

export function resolveArea(role: Role, pathname: string, search: URLSearchParams, preferred?: string | null): AreaId {
  const areas = getAreasForRole(role)
  const candidates = areas.filter((a) => getAreaNav(role, a).some((i) => isNavItemActive(i.href, pathname, search)))
  if (preferred && candidates.includes(preferred as AreaId)) return preferred as AreaId
  return candidates[0] ?? areas[0]
}
