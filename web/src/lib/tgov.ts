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

/** Role groups for tab isolation: aprovação roles cannot access execução tab and vice-versa. */
export const APROVACAO_ONLY_ROLES = ['coord_aprovacao', 'assistente_aprovacao', 'projetista'] as const
export const EXECUCAO_ONLY_ROLES = ['coord_execucao', 'assistente_execucao'] as const
/** PC Coordenação roles — can only see the prestacao_contas tab. */
export const PRESTACAO_ONLY_ROLES = ['coord_prestacao', 'assistente_prestacao'] as const

/** Default number of rows per page in the TGov detail table. */
export const TGOV_PAGE_SIZE = 25

/** Allowed page sizes for the TGov detail table. */
export const TGOV_PAGE_SIZE_OPTIONS = [25, 50, 100] as const

/** Maximum allowed page size to prevent DB overload. */
export const TGOV_MAX_PAGE_SIZE = 100

/** Tab shown on first load. */
export const DEFAULT_TGOV_TAB: TGovTab = 'aprovacao'

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export type TGovTab = 'aprovacao' | 'execucao' | 'prestacao_contas'

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
  /** Internal CRM status (from tgov_interactions, not from TransferênciaGov). */
  internalStatus?: string | null
  /** True when there are unseen notifications for this proposal. */
  hasNew?: boolean
}

/** Extended row for the Aprovacao tab with proposal details. */
export interface TGovAprovacaoTableRow extends TGovTableRow {
  /** transfer_gov_id — used as idProposta in TransfereGov links. */
  transferGovId: string
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
  tecnicoId?: string | null
  tecnicoNome?: string | null
  /** Number of comments on this proposal (from tgov_comments). */
  commentCount?: number
  /** Expiry date for the proposal (from tgov_interactions). ISO date string or null. */
  vencimento?: string | null
}

/** Extended row for the Execucao tab with financial and detail columns. */
export interface TGovExecucaoTableRow extends TGovTableRow {
  nrConvenio: string
  /** id_proposta from projetos_execucao — used as idProposta in TransfereGov URL. */
  idProposta: string | null
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
  anoReferencia: number | null
  diaLimitePrestContas: string | null
  diasPrestContas: number | null
  tecnicoId?: string | null
  tecnicoNome?: string | null
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
// Projetus proposal whitelists (NR_PROPOSTA format from SICONV column H)
// ---------------------------------------------------------------------------

/**
 * Aprovação tab whitelist — 2026 proposals only.
 * Format: NR_PROPOSTA "NUMERO/ANO" from siconv_proposta.csv column H.
 * Matched against `propostas.nr_proposta`.
 */
export const APROVACAO_NR_PROPOSTAS: Set<string> = new Set([
  '003677/2026', '009015/2026', '011385/2026', '008887/2026', '009142/2026',
  '009144/2026', '010955/2026', '010930/2026', '008301/2026', '008304/2026',
  '008760/2026', '008815/2026', '010437/2026', '011051/2026', '011291/2026',
  '009087/2026', '011297/2026', '011000/2026', '005645/2026', '007945/2026',
  '007609/2026', '006654/2026', '011099/2026', '005373/2026', '011067/2026',
  '008959/2026', '009855/2026', '011255/2026', '010294/2026', '009843/2026',
  '009178/2026', '007263/2026', '007236/2026', '011304/2026', '008165/2026',
  '007612/2026', '008913/2026', '003378/2026', '011305/2026', '011331/2026',
  '011068/2026', '003514/2026', '006217/2026', '009878/2026', '009856/2026',
  '010900/2026', '005476/2026', '007177/2026', '008948/2026', '009215/2026',
  '011201/2026', '007618/2026', '009227/2026', '010943/2026', '011264/2026',
  '011072/2026', '011350/2026', '008903/2026', '010150/2026',
])

/**
 * Execução tab whitelist — pre-2026 proposals.
 * Format: NR_PROPOSTA "NUMERO/ANO" from siconv_proposta.csv column H.
 * Matched against `projetos_execucao.nr_proposta`.
 */
export const EXECUCAO_NR_PROPOSTAS: Set<string> = new Set([
  '4822/2020', '4976/2020', '1761/2020', '19819/2020', '4903/2020', '4974/2020',
  '49113/2021', '23645/2021', '41044/2021', '23611/2021', '23571/2021',
  '24429/2021', '20231/2021', '23416/2021', '23495/2021', '24318/2021',
  '41048/2021', '41550/2021', '22834/2021', '23138/2021', '24611/2021',
  '23387/2021', '23379/2021',
  '27192/2022', '5311/2022', '9970/2022', '1233/2022', '10129/2022',
  '5504/2022', '4833/2022', '3343/2022', '5665/2022', '2833/2022', '6203/2022',
  '22162/2022', '5815/2022', '21604/2022', '2851/2022', '9646/2022',
  '3566/2022', '5461/2022', '9647/2022', '2589/2022', '9764/2022',
  '2165/2022', '21990/2022', '21946/2022', '2496/2022', '10113/2022',
  '2260/2022', '19809/2022', '10315/2022', '3830/2022', '10278/2022',
  '5471/2022', '9769/2022', '2284/2022', '7459/2022', '9645/2022',
  '4371/2022', '5422/2022', '5159/2022', '5699/2022', '10351/2022',
  '9975/2022', '3962/2022', '26464/2022', '5436/2022', '5803/2022', '5516/2022',
  '10429/2023', '52522/2023', '28342/2023', '52782/2023', '52788/2023',
  '11167/2023', '10468/2023', '9264/2023', '24542/2023', '62106/2023',
  '49036/2023', '9136/2023', '9219/2023', '11225/2023', '11240/2023',
  '60409/2023', '53078/2023', '24119/2023', '9232/2023', '62127/2023',
  '11027/2023', '11272/2023', '10485/2023', '9207/2023', '61641/2023',
  '10014/2023', '10648/2023', '10332/2023', '11231/2023', '52822/2023',
  '24099/2023', '10417/2023', '52762/2023', '38716/2023', '61688/2023',
  '9672/2023', '64489/2023', '9224/2023', '10384/2023', '23686/2023',
  '70983/2023', '31060/2023', '32157/2023', '9535/2023', '10326/2023',
  '8327/2023', '27174/2023', '9976/2023', '48834/2023', '9277/2023',
  '48537/2023', '20841/2023', '8983/2023', '9479/2023', '23688/2023',
  '10704/2023', '61470/2023', '46165/2023', '8208/2023', '27191/2023',
  '11749/2023', '10602/2023', '10959/2023', '48448/2023', '10345/2023',
  '10638/2023', '10993/2023', '9504/2023', '10617/2023', '61653/2023',
  '52455/2023', '10539/2023',
  '6648/2024', '7017/2024', '22969/2024', '5587/2024', '581/2024', '714/2024',
  '6559/2024', '1767/2024', '2250/2024', '1639/2024', '5158/2024', '5141/2024',
  '5602/2024', '5066/2024', '1898/2024', '6978/2024', '22059/2024', '1860/2024',
  '5636/2024', '6448/2024', '35497/2024', '5006/2024', '5181/2024',
  '22256/2024', '22664/2024', '5675/2024', '21012/2024', '2654/2024',
  '6933/2024', '621/2024', '6503/2024', '1169/2024', '5646/2024', '5863/2024',
  '2059/2024', '866/2024', '5115/2024', '5010/2024', '755/2024', '6851/2024',
  '21473/2024', '1730/2024', '36095/2024', '7070/2024', '35946/2024',
  '5649/2024', '5520/2024', '1116/2024', '5648/2024', '4795/2024',
  '22005/2024', '6932/2024', '1797/2024', '6250/2024', '1117/2024',
  '6905/2024', '16400/2024', '21466/2024', '1858/2024', '6184/2024',
  '22393/2025', '27516/2025', '45260/2025', '25260/2025', '60105/2025',
  '5644/2025', '25286/2025', '62534/2025', '20778/2025', '30065/2025',
  '24745/2025', '24174/2025', '46243/2025', '60672/2025', '25353/2025',
  '27359/2025', '27357/2025', '25207/2025', '60704/2025', '25279/2025',
  '24291/2025', '26506/2025', '28488/2025', '62021/2025', '26031/2025',
  '27265/2025', '30083/2025', '20689/2025', '62169/2025', '60099/2025',
  '30031/2025', '27206/2025', '60518/2025', '32481/2025', '60108/2025',
  '30221/2025', '27398/2025', '27403/2025', '27407/2025', '46240/2025',
  '27221/2025', '26478/2025',
])

/**
 * Builds a parameterized SQL WHERE clause to match NR_PROPOSTA values.
 *
 * Since the SICONV CSV may zero-pad the numeric portion (e.g. "004822/2020"),
 * while the client list may not ("4822/2020"), we normalize by stripping
 * leading zeros from the numeric part before comparison:
 *
 *   REGEXP_REPLACE({column}, '^0+', '') IN ($1, $2, ...)
 *
 * All whitelist values are stored WITHOUT leading zeros (user-provided format).
 *
 * @param columnName - The SQL column (e.g. `p.nr_proposta`)
 * @param params     - Existing params array (mutated in-place)
 * @param whitelist  - Which whitelist to use
 */
export function buildNrPropostaWhereClause(
  columnName: string,
  params: unknown[],
  whitelist: Set<string>,
): string {
  const startIndex = params.length + 1
  const ids = Array.from(whitelist)
  // Strip leading zeros to match DB format (DB stores "3677/2026" not "003677/2026")
  ids.forEach((id) => params.push(id.replace(/^0+/, '')))
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
