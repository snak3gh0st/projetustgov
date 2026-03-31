/**
 * Shared TGov Dashboard contracts — types, constants, and helpers.
 *
 * Consumed by:
 *   - web/src/app/api/tgov/aprovacao/route.ts
 *   - web/src/app/api/tgov/execucao/route.ts
 *   - web/src/app/tgov/TGovDashboardClient.tsx
 *
 * NO fetch logic or JSX here. This file is importable from both server
 * components and client components.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default number of rows per page in the TGov detail table. */
export const TGOV_PAGE_SIZE = 25

/** Tab shown on first load. */
export const DEFAULT_TGOV_TAB: TGovTab = 'aprovacao'

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export type TGovTab = 'aprovacao' | 'execucao'

// ---------------------------------------------------------------------------
// Main shared filters (preserved across tab switches)
// ---------------------------------------------------------------------------

/**
 * `tipo` semantics:
 *   - 'todos'            — no ownership filter
 *   - 'meus_proponentes' — CNPJs / propostas that already exist in vendedor_projetos
 *   - 'outros'           — CNPJs / propostas with NO matching row in vendedor_projetos
 *
 * For the aprovacao tab the predicate targets propostas.proponente_cnpj.
 * For the execucao tab the predicate targets projetos_execucao.cnpj (digits-only).
 * CNPJ normalisation must strip non-digits before comparing with vendedor_projetos.cnpj.
 *
 * `ano` semantics (SAME on both tabs):
 *   Derived from propostas.data_publicacao using EXTRACT(YEAR …).
 *   For the execucao tab the join path is:
 *     projetos_execucao.id_proposta -> propostas.transfer_gov_id -> propostas.data_publicacao
 *   This makes "Ano" mean "proposal publication year" on both tabs so the
 *   shared filter carries identical meaning.
 */
export type TGovTipoFilter = 'todos' | 'meus_proponentes' | 'outros'

export interface TGovMainFilters {
  /** Four-digit year string, e.g. "2025". Empty string means "all years". */
  ano: string
  tipo: TGovTipoFilter
  /**
   * Raw situacao value exactly as stored in DB, or empty string for "all".
   * The backend must normalise accented/non-accented variants before grouping.
   */
  status: string
  /** Two-letter UF code, e.g. "SP". Empty string means "all UFs". */
  uf: string
}

// ---------------------------------------------------------------------------
// Inline table-only filters (do NOT change KPI / donut totals)
// ---------------------------------------------------------------------------

export interface TGovTableFilters {
  /** Partial name search against proponente / nome_proponente. */
  proponente: string
  /**
   * Partial match against the proposal/convenio identifier column.
   * Aprovacao: propostas.transfer_gov_id
   * Execucao:  projetos_execucao.nr_convenio
   */
  numeroProposta: string
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface TGovStatusBucket {
  /** Normalised situacao label. */
  status: string
  count: number
  /** Percentage of total, 0–100. */
  percent: number
}

export interface TGovTableRow {
  /** Proposal or convenio identifier (transfer_gov_id / nr_convenio). */
  numeroProposta: string
  /** ISO date string or null. Aprovacao: data_publicacao; Execucao: data_assinatura. */
  data: string | null
  cnpj: string
  proponente: string
  situacao: string
}

/** Extended row for the Aprovacao tab with proposal details. */
export interface TGovAprovacaoTableRow extends TGovTableRow {
  titulo: string | null
  valorGlobal: number | null
  valorRepasse: number | null
  valorContrapartida: number | null
  uf: string | null
  municipio: string | null
  modalidade: string | null
  orgaoSuperior: string | null
  orgaoVinculado: string | null
  dataInicioVigencia: string | null
  dataFimVigencia: string | null
}

/** Extended row for the Execucao tab with financial and detail columns. */
export interface TGovExecucaoTableRow extends TGovTableRow {
  nrConvenio: string
  anoInstrumento: number | null
  valorGlobal: number | null
  valorRepasse: number | null
  valorDesembolsado: number | null
  saldoConta: number | null
  rendimentoAplicacao: number | null
  ingressoContrapartida: number | null
  valorEmpenhado: number | null
  pctExecucao: number | null
  uf: string | null
  municipio: string | null
  dataInicioVigencia: string | null
  dataFimVigencia: string | null
  diasEmExecucao: number | null
  diasAteVencimento: number | null
}

export interface TGovTabResponse {
  /** Absolute total matching the main filters (no table filters applied). */
  total: number
  /** Situacao breakdown used for the donut chart. Sums to `total`. */
  byStatus: TGovStatusBucket[]
  table: {
    rows: TGovTableRow[]
    page: number
    pageSize: number
    /** Total rows matching both main AND table filters. */
    totalRows: number
    totalPages: number
  }
}

// ---------------------------------------------------------------------------
// Default filter values (convenience — avoids magic strings in components)
// ---------------------------------------------------------------------------

export const DEFAULT_MAIN_FILTERS: TGovMainFilters = {
  ano: String(new Date().getFullYear()),
  tipo: 'todos',
  status: '',
  uf: '',
}

/** Execucao tab defaults to all years since it shows only Projetus clients. */
export const DEFAULT_EXECUCAO_MAIN_FILTERS: TGovMainFilters = {
  ano: '',
  tipo: 'todos',
  status: '',
  uf: '',
}

export const DEFAULT_TABLE_FILTERS: TGovTableFilters = {
  proponente: '',
  numeroProposta: '',
}

// ---------------------------------------------------------------------------
// Status ordering helpers
// ---------------------------------------------------------------------------

/**
 * Canonical display order for situacao buckets in the donut chart legend.
 * Statuses not in this list are appended alphabetically.
 *
 * Kept here so both the backend SQL ORDER BY and the frontend chart legend
 * use the exact same ordering logic.
 */
export const TGOV_STATUS_ORDER: Record<string, number> = {
  'Em Execução': 1,
  'Em execução': 1,
  'Prestação de Contas enviada para Análise': 2,
  'Prestação de contas enviada para análise': 2,
  'Aguardando Prestação de Contas': 3,
  'Prestação de Contas Concluída': 4,
  'Prestação de Contas em Complementação': 5,
  'Prestação de Contas em Análise': 6,
  'Prestação de Contas Comprovada': 7,
  'Prestação de Contas Aprovada': 8,
  'Prestação de Contas Rejeitada': 9,
  'Aprovado': 10,
  'Aguardando Análise': 11,
  'Aguardando Envio do Plano de Trabalho': 12,
  'Em Análise': 13,
  'Reprovado': 14,
  'Cancelado': 15,
  'Concluído': 16,
  'Inadimplente': 17,
}

/**
 * Returns a numeric sort key for a situacao label.
 * Unlisted statuses receive 100 + alphabetical offset so they sort after
 * known statuses deterministically.
 */
export function tgovStatusSortKey(status: string): number {
  return TGOV_STATUS_ORDER[status] ?? 100
}

// ---------------------------------------------------------------------------
// Tipo predicate builders (for documentation — actual SQL is in route.ts)
// ---------------------------------------------------------------------------

/**
 * Human-readable labels for the Tipo filter options.
 */
export const TGOV_TIPO_LABELS: Record<TGovTipoFilter, string> = {
  todos: 'Todos',
  meus_proponentes: 'Meus Proponentes',
  outros: 'Outros',
}
