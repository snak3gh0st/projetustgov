// Regras de papel puras (sem servidor), reexportadas por lib/dal.ts.
// gestor = gestor comercial (só a área Comercial); diretoria = gestão da empresa (todas as áreas).

export const ALL_ROLES = [
  'gestor', 'admin', 'vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao',
  'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao',
  'assistente_prestacao', 'gestor_financeiro', 'diretoria',
] as const

export type Role = typeof ALL_ROLES[number]

const DIRETORIA_MANAGES: Role[] = [
  'admin', 'vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao',
  'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao',
  'assistente_prestacao', 'gestor_financeiro', 'gestor',
]

const COMMERCIAL_TEAM: Role[] = ['vendedor', 'coordenador', 'csm', 'visualizador']

/** Who can create/manage users of which roles. Single source of truth. */
export const ROLE_CAN_CREATE: Partial<Record<Role, Role[]>> = {
  diretoria:            DIRETORIA_MANAGES,
  gestor:               COMMERCIAL_TEAM,
  admin:                ['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao', 'gestor_financeiro'],
  adm_produto:          ['coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao'],
  coord_aprovacao:      ['assistente_aprovacao', 'projetista'],
  assistente_aprovacao: ['projetista'],
  coord_execucao:       ['assistente_execucao'],
  coord_prestacao:      ['assistente_prestacao'],
}

/** Same as create - who can delete users of which roles. */
export const ROLE_CAN_DELETE: Partial<Record<Role, Role[]>> = {
  diretoria:            DIRETORIA_MANAGES,
  gestor:               COMMERCIAL_TEAM,
  admin:                ['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao', 'gestor_financeiro'],
  adm_produto:          ['coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao'],
  coord_aprovacao:      ['assistente_aprovacao', 'projetista'],
  assistente_aprovacao: [],
  coord_execucao:       ['assistente_execucao'],
  assistente_execucao:  [],
  coord_prestacao:      ['assistente_prestacao'],
  assistente_prestacao: [],
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_CAN_CREATE[actorRole]?.includes(targetRole) ?? false
}

// Helper: check if role acts as a seller (receives leads, earns commissions)
export function isSeller(role: string): boolean {
  return role === 'vendedor' || role === 'coordenador'
}

/** Vê comissão e números da equipe comercial inteira (não só os próprios). */
export function hasTeamCommercialView(role: string | undefined | null): boolean {
  return role === 'gestor' || role === 'diretoria'
}

/** Enxerga todos os leads, sem filtro por responsável. */
export function seesAllLeads(role: string): boolean {
  return role === 'gestor' || role === 'diretoria' || role === 'visualizador' || role === 'csm'
}

/** Muda status, contato e observações de leads. Visualizador e CSM só olham. */
export function canEditLeads(role: string): boolean {
  return role === 'gestor' || role === 'diretoria' || role === 'admin' || role === 'vendedor' || role === 'coordenador'
}

/** Tira um lead de Vendas Concluídas, o que apaga a comissão da venda. */
export function canReopenClosedSale(role: string): boolean {
  return role === 'gestor' || role === 'diretoria' || role === 'admin'
}

// Helper: build vendedor filter clause for leads queries
export function buildVendedorFilter(role: string, userId: string, paramIndex: number) {
  if (seesAllLeads(role)) {
    return { clause: '', params: [], nextIndex: paramIndex }
  }
  // Vendedor and coordenador see only their assigned leads
  return {
    clause: `AND la.vendedor_id = $${paramIndex}`,
    params: [userId],
    nextIndex: paramIndex + 1
  }
}

// Helper: check if user can modify data (write permissions)
export function canModifyData(role: string): boolean {
  return role === 'gestor' || role === 'diretoria' || role === 'vendedor' || role === 'coordenador'
}

/** TGov reads (aprovação, execução, busca-cnpj, whitelist GET, interaction GET, comments GET). */
export function canReadTgov(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'adm_produto'
      || role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'projetista'
      || role === 'coord_execucao' || role === 'assistente_execucao'
      || role === 'coord_prestacao' || role === 'assistente_prestacao'
}

/** Operação v1: leitura da fila comum de execução e prestação. */
export function canReadOperacao(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'adm_produto'
      || role === 'vendedor' || role === 'coordenador' || role === 'visualizador'
      || role === 'coord_execucao' || role === 'assistente_execucao'
      || role === 'coord_prestacao' || role === 'assistente_prestacao'
}

/** Operação v1: só coordenação/setor e administração alteram o overlay local. */
export function canWriteOperacao(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'coord_execucao'
      || role === 'assistente_execucao' || role === 'coord_prestacao'
      || role === 'assistente_prestacao'
}

/** TGov mutations privilegiadas (whitelist write, interaction PATCH, tecnico assignment). NÃO inclui CSM nem projetista. */
/** Rubricas da proposta: o time de Aprovação monta; Execução e Prestação só leem. */
export function canEditRubricas(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'adm_produto'
      || role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'projetista'
}

export function canWriteTgov(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'adm_produto'
      || role === 'coord_aprovacao' || role === 'assistente_aprovacao'
      || role === 'coord_execucao' || role === 'assistente_execucao'
      || role === 'coord_prestacao' || role === 'assistente_prestacao'
}

/** Quem pode escrever comentários TGov (inclui CSM, coord_aprovacao, projetista). */
export function canCommentTgov(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'adm_produto'
      || role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'projetista'
      || role === 'coord_execucao' || role === 'assistente_execucao'
      || role === 'coord_prestacao' || role === 'assistente_prestacao'
}

/** CSM area: read + write access to CSM-owned data. Gestor comercial, diretoria e admin também entram. */
export function canCsm(role: string | undefined): boolean {
  return role === 'csm' || role === 'gestor' || role === 'diretoria' || role === 'admin'
}

// Helper: check if user has admin-level access (full control)
export function isAdmin(role: string): boolean {
  return role === 'admin'
}

/** Conta Azul / área financeira formal. */
export function canManageContaAzul(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'gestor_financeiro'
}

/** BI Financeiro (dados do Conta Azul: caixa, DRE, pagar e receber). Área do gestor financeiro. */
export function canReadBiFinanceiro(role: string | undefined): boolean {
  return role === 'diretoria' || role === 'admin' || role === 'gestor_financeiro'
}

/**
 * Contact CSV export gate.
 * - gestor/diretoria/admin: broad export access
 * - coordenador: allowed, but must be constrained by vendedor filter
 *   (enforced in route-level validation)
 */
export function canExportContacts(role: string | undefined | null): boolean {
  return role === 'gestor' || role === 'diretoria' || role === 'admin' || role === 'coordenador'
}

/** /api/setup-crm reescreve senha e papel de usuários: só a diretoria roda. */
export function canRunSystemSetup(role: string | undefined): boolean {
  return role === 'diretoria'
}

const OWN_COMMISSION_HIDDEN = ['comissao_bonus', 'closer_comissao_valor', 'closer_comissao_percentual'] as const
const ALL_COMMISSION = ['comissao_valor', 'comissao_percentual', ...OWN_COMMISSION_HIDDEN] as const

/**
 * Comissão por perfil numa linha de lead: gestão vê tudo; vendedor e coordenador veem a própria
 * (linhas em que são o dono), sem bônus nem a parte do closer; os demais, nada.
 */
export function redactLeadCommission<T extends Record<string, unknown>>(row: T, role: string, userId?: string): T {
  if (hasTeamCommercialView(role) || role === 'admin') return row
  const ownsRow = isSeller(role) && userId !== undefined && row.vendedor_id === userId
  const hidden = ownsRow ? OWN_COMMISSION_HIDDEN : ALL_COMMISSION
  const out: Record<string, unknown> = { ...row }
  for (const key of hidden) if (key in out) out[key] = null
  return out as T
}
