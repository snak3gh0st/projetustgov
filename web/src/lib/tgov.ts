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
  'Aprovado': 2,
  'Aguardando Análise': 3,
  'Aguardando Envio do Plano de Trabalho': 4,
  'Em Análise': 5,
  'Reprovado': 6,
  'Cancelado': 7,
  'Concluído': 8,
  'Prestação de Contas em Análise': 9,
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
// Projetus proposal whitelist
// ---------------------------------------------------------------------------

/**
 * Definitive list of Projetus proposal IDs managed by the platform.
 *
 * Source: client-provided "NUMERO/ANO" list — only the numeric portion before
 * the slash is stored here, since `propostas.transfer_gov_id` and
 * `projetos_execucao.id_proposta` store the ID as a plain string without the
 * "/YEAR" suffix.
 *
 * Both TGov API routes (aprovacao and execucao) must filter exclusively by
 * this set. Any proposal or convenio not in this list must NOT appear in the
 * TGov dashboard.
 */
export const PROJETUS_PROPOSAL_IDS: Set<string> = new Set([
  '4822', '4976', '1761', '19819', '4903', '4974', '49113', '23645', '41044',
  '23611', '23571', '24429', '20231', '23416', '23495', '24318', '41048',
  '41550', '22834', '23138', '24611', '23387', '23379', '27192', '5311',
  '9970', '1233', '10129', '5504', '4833', '3343', '5665', '2833', '6203',
  '22162', '5815', '21604', '2851', '9646', '3566', '5461', '9647', '2589',
  '9764', '2165', '21990', '21946', '2496', '10113', '2260', '19809', '10315',
  '3830', '10278', '5471', '9769', '2284', '7459', '9645', '4371', '5422',
  '5159', '5699', '10351', '9975', '3962', '26464', '5436', '5803', '5516',
  '10429', '52522', '28342', '52782', '52788', '11167', '10468', '9264',
  '24542', '62106', '49036', '9136', '9219', '11225', '11240', '60409',
  '53078', '24119', '9232', '62127', '11027', '11272', '10485', '9207',
  '61641', '10014', '10648', '10332', '11231', '52822', '24099', '10417',
  '52762', '38716', '61688', '9672', '64489', '9224', '10384', '23686',
  '70983', '31060', '32157', '9535', '10326', '8327', '27174', '9976',
  '48834', '9277', '48537', '20841', '8983', '9479', '23688', '10704',
  '61470', '46165', '8208', '27191', '11749', '10602', '10959', '48448',
  '10345', '10638', '10993', '9504', '10617', '61653', '52455', '10539',
  '6648', '7017', '22969', '5587', '581', '714', '6559', '1767', '2250',
  '1639', '5158', '5141', '5602', '5066', '1898', '6978', '22059', '1860',
  '5636', '6448', '35497', '5006', '5181', '22256', '22664', '5675', '21012',
  '2654', '6933', '621', '6503', '1169', '5646', '5863', '2059', '866',
  '5115', '5010', '755', '6851', '21473', '1730', '36095', '7070', '35946',
  '5649', '5520', '1116', '5648', '4795', '22005', '6932', '1797', '6250',
  '1117', '6905', '16400', '21466', '1858', '6184', '22393', '27516',
  '45260', '25260', '60105', '5644', '25286', '62534', '20778', '30065',
  '24745', '24174', '46243', '60672', '25353', '27359', '27357', '25207',
  '60704', '25279', '24291', '26506', '28488', '62021', '26031', '27265',
  '30083', '20689', '62169', '60099', '30031', '27206', '60518', '32481',
  '60108', '30221', '27398', '27403', '27407', '46240', '27221', '26478',
  '3514', '5373',
])

/**
 * Builds a parameterized SQL IN clause for filtering by Projetus proposal IDs.
 *
 * Appends all proposal IDs to `params` and returns a SQL fragment of the form:
 *   `{columnName} IN ($N, $N+1, ..., $N+count-1)`
 *
 * This keeps all values parameterized — no string interpolation of IDs.
 *
 * @param columnName - The SQL column expression (e.g. `p.transfer_gov_id`)
 * @param params     - The existing params array to append to (mutated in-place)
 * @returns SQL fragment string
 *
 * @example
 * const mainParams: unknown[] = []
 * const clause = buildProjetusProposalWhereClause('p.transfer_gov_id', mainParams)
 * // clause = "p.transfer_gov_id IN ($1, $2, ..., $250)"
 */
export function buildProjetusProposalWhereClause(
  columnName: string,
  params: unknown[],
): string {
  const startIndex = params.length + 1
  const ids = Array.from(PROJETUS_PROPOSAL_IDS)
  ids.forEach((id) => params.push(id))
  const placeholders = ids.map((_, i) => `$${startIndex + i}`).join(', ')
  return `${columnName} IN (${placeholders})`
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
