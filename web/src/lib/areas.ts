// O PROJETE é organizado por áreas, uma por equipe. Cada perfil tem uma área principal
// (onde entra) e, quando trabalha em mais de uma, troca pela barra de áreas.
// Tela isolada de outra área fica no menu da área principal do perfil.
import type { Role } from './roles'

export type AreaId = 'comercial' | 'operacao' | 'financeiro' | 'gestao' | 'admin'

export const AREAS: Record<AreaId, { id: AreaId; label: string; short: string; icon: string }> = {
  comercial: { id: 'comercial', label: 'Comercial', short: 'Comercial', icon: 'leads' },
  operacao: { id: 'operacao', label: 'Operação TransfereGov', short: 'Operação', icon: 'tgov' },
  financeiro: { id: 'financeiro', label: 'Financeiro', short: 'Financeiro', icon: 'financeiro' },
  gestao: { id: 'gestao', label: 'Gestão', short: 'Gestão', icon: 'bi' },
  admin: { id: 'admin', label: 'Administração', short: 'Admin', icon: 'monitoramento' },
}

export const AREA_COOKIE = 'projete-area'

export interface AreaNavItem {
  href: string
  label: string
  icon: string
  section?: 'Gestão'
}

/** requires: o item só aparece com o canal ligado. */
type Item = AreaNavItem & { roles: Role[]; requires?: 'whatsapp' }

const TGOV_TEAM: Role[] = [
  'adm_produto', 'coord_aprovacao', 'assistente_aprovacao', 'projetista',
  'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao', 'diretoria', 'admin',
]
export const SELLERS: Role[] = ['vendedor', 'coordenador', 'visualizador', 'gestor', 'diretoria', 'admin']
const CSM_VIEW: Role[] = ['csm', 'gestor', 'diretoria', 'admin']

const AREA_NAV: Record<AreaId, Item[]> = {
  comercial: [
    // Consultor abre em Meu dia e diretoria em Visão geral: o Pipeline deles fica em /pipeline.
    { href: '/meu-dia', label: 'Meu dia', icon: 'hoje', roles: ['vendedor'] },
    { href: '/pipeline', label: 'Pipeline', icon: 'pipeline', roles: ['vendedor', 'diretoria'] },
    { href: '/', label: 'Pipeline', icon: 'pipeline', roles: SELLERS.filter((r) => r !== 'vendedor' && r !== 'diretoria') },
    { href: '/meu-dia', label: 'Meu dia', icon: 'hoje', roles: ['coordenador'] },
    { href: '/leads', label: 'Leads', icon: 'leads', roles: SELLERS },
    { href: '/conversas', label: 'WhatsApp', icon: 'conversas', roles: ['vendedor', 'coordenador', 'gestor', 'diretoria', 'admin'], requires: 'whatsapp' },
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
    { href: '/gestao', label: 'Visão geral', icon: 'visao', roles: ['diretoria', 'admin'] },
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
  csm: ['comercial'],
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

export function getAreaNav(role: Role, area: AreaId, opts: { whatsapp?: boolean } = {}): AreaNavItem[] {
  return AREA_NAV[area]
    .filter((i) => i.roles.includes(role) && (!i.requires || (i.requires === 'whatsapp' && opts.whatsapp)))
    .map(({ roles: _roles, requires: _requires, ...item }) => item)
}

/** Para onde / leva quem abre o PROJETE em outra tela; null mantém / (Pipeline). */
export function landingPath(role: Role): string | null {
  if (role === 'vendedor') return '/meu-dia'
  if (role === 'diretoria') return '/gestao'
  return null
}

export function areaHome(role: Role, area: AreaId): string {
  return getAreaNav(role, area)[0]?.href ?? '/'
}

// Em /tgov compara ?view=.
export function isNavItemActive(href: string, pathname: string, search: URLSearchParams): boolean {
  const [hrefPath, hrefQuery] = href.split('?')
  const hrefParams = new URLSearchParams(hrefQuery ?? '')
  if (hrefPath === '/') return pathname === '/'
  if (hrefPath === '/tgov') return pathname === '/tgov' && (search.get('view') ?? null) === (hrefParams.get('view') ?? null)
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
  const chosen = preferred && areas.includes(preferred as AreaId) ? (preferred as AreaId) : null
  if (candidates.length === 0) return chosen ?? areas[0]
  if (chosen && candidates.includes(chosen)) return chosen
  return candidates[0]
}

/** Largura do menu lateral, para o layout reservar o mesmo espaço. */
export function sidebarWidthClass(role: Role, open: boolean): { aside: string; main: string } {
  const rail = getAreasForRole(role).length > 1
  if (open) return rail ? { aside: 'w-[18.5rem]', main: 'md:ml-[18.5rem]' } : { aside: 'w-64', main: 'md:ml-64' }
  return rail ? { aside: 'w-[7.5rem]', main: 'md:ml-[7.5rem]' } : { aside: 'w-16', main: 'md:ml-16' }
}
