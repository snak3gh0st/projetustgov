// Transferegov open-data download area (Discricionárias e Legais / SICONV).
//
// Comunicado Transferegov nº 23/2026 (17/07/2026) moved the files from
// repositorio.dados.gov.br/seges/detru to the new api-publica host, and the old
// host stopped updating on 17/07/2026. The new host sits behind a Cloudflare
// challenge that answers 403 to datacenter IPs (our btapps/btdb servers), so
// each download probes the sources in order and uses the first one that
// answers, before reading any row.
//
// The legacy host still serves the frozen 17/07 snapshot. Syncs that write to
// the base never read it: overwriting newer rows with July data would roll the
// base back. Only read-only callers (live search) opt into it.
//
// TGOV_REPO_BASE overrides the new host (same file naming) when a reachable
// mirror or an allowlisted route exists.

import { downloadAndStreamCSV } from '@/lib/repo-sync'

export type TgovSourceId = 'override' | 'atual' | 'legado'

interface TgovSource {
  id: TgovSourceId
  url: (tabela: string) => string
}

export const TGOV_REPO_BASE = 'https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov'
const LEGACY_REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'

function sources(allowLegacy: boolean): TgovSource[] {
  const list: TgovSource[] = []
  const override = process.env.TGOV_REPO_BASE?.trim().replace(/\/$/, '')
  if (override) list.push({ id: 'override', url: (t) => `${override}/${t}.zip` })
  list.push({ id: 'atual', url: (t) => `${TGOV_REPO_BASE}/${t}.zip` })
  if (allowLegacy) list.push({ id: 'legado', url: (t) => `${LEGACY_REPO_BASE}/${t}.csv.zip` })
  return list
}

// Source used by the latest download of each table in this process.
const lastSourceByTable = new Map<string, TgovSourceId>()

export function tgovSourcesUsed(): Record<string, TgovSourceId> {
  return Object.fromEntries(lastSourceByTable)
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Streams a SICONV table from the first source that answers. The probe runs
 * before any row is read, so a fallback never processes rows twice.
 * allowLegacy: only for read-only callers; writers must not read the frozen snapshot.
 */
export async function downloadTgovTable(
  tabela: string,
  onRow: (row: Record<string, string>) => void | boolean,
  opts: { allowLegacy?: boolean } = {}
): Promise<number> {
  const tried: string[] = []
  for (const source of sources(opts.allowLegacy ?? false)) {
    const url = source.url(tabela)
    if (!(await reachable(url))) {
      tried.push(source.id)
      continue
    }
    if (source.id === 'legado') {
      console.warn(`[tgov-repo] ${tabela}: fontes ${tried.join(', ')} bloqueadas; usando o repositório legado (congelado em 17/07/2026)`)
    } else {
      console.log(`[tgov-repo] ${tabela}: fonte ${source.id}`)
    }
    lastSourceByTable.set(tabela, source.id)
    return downloadAndStreamCSV(url, onRow)
  }
  throw new Error(`Fonte atual do Transferegov bloqueada para ${tabela} (tentadas: ${tried.join(', ')}); nenhuma linha desta tabela foi gravada`)
}

/**
 * When the government published the files the syncs read (data_carga_siconv),
 * as ISO in Brasília time, or null when no current source answers.
 */
export async function fetchTgovDataCarga(): Promise<string | null> {
  let raw = ''
  try {
    await downloadTgovTable('data_carga_siconv', (row) => {
      raw = row['data_carga'] ?? ''
      return false
    })
  } catch {
    return null
  }
  return parseDataCarga(raw)
}

export function parseDataCarga(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, d, mo, y, h, mi, s] = m
  return `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}-03:00`
}
