/**
 * The DRE layout is the one configured in Conta Azul
 * (GET /v1/financeiro/categorias-dre). Groups hold lines, lines list the
 * financial categories that feed them, and totalizer rows are the running sum
 * of every group above them.
 */

export type DreNode = {
  id: string
  codigo?: string | null
  descricao: string
  posicao?: number | null
  indica_totalizador?: boolean | null
  subitens?: DreNode[] | null
  categorias_financeiras?: { id: string }[] | null
}

export type DreLinha = {
  id: string
  parent_id: string | null
  codigo: string | null
  descricao: string
  posicao: number
  nivel: number
  ordem: number
  totalizador: boolean
}

export type DreRow = DreLinha & { values: number[] }

function byPosicao(a: DreNode, b: DreNode) {
  return (a.posicao ?? 0) - (b.posicao ?? 0)
}

export function flattenDreTree(nodes: DreNode[]): DreLinha[] {
  const out: DreLinha[] = []
  const walk = (list: DreNode[], parent: string | null, nivel: number) => {
    for (const n of [...list].sort(byPosicao)) {
      out.push({
        id: n.id,
        parent_id: parent,
        codigo: n.codigo ?? null,
        descricao: n.descricao,
        posicao: n.posicao ?? 0,
        nivel,
        ordem: out.length,
        totalizador: Boolean(n.indica_totalizador),
      })
      walk(n.subitens ?? [], n.id, nivel + 1)
    }
  }
  walk(nodes, null, 0)
  return out
}

export function dreCategoryPairs(nodes: DreNode[]): { dre_linha_id: string; categoria_id: string }[] {
  const out: { dre_linha_id: string; categoria_id: string }[] = []
  const walk = (list: DreNode[]) => {
    for (const n of [...list].sort(byPosicao)) {
      for (const c of n.categorias_financeiras ?? []) out.push({ dre_linha_id: n.id, categoria_id: c.id })
      walk(n.subitens ?? [])
    }
  }
  walk(nodes)
  return out
}

/** DRE line of a category: its own mapping, else the nearest mapped ancestor, else null. */
export function resolveDreLine(
  categoriaId: string,
  parents: Map<string, string | null>,
  catToLine: Map<string, string>
): string | null {
  let current: string | null = categoriaId
  for (let depth = 0; current && depth < 20; depth++) {
    const line = catToLine.get(current)
    if (line) return line
    current = parents.get(current) ?? null
  }
  return null
}

/**
 * Builds the statement. `own` holds signed values (revenue +, expense -) that
 * belong directly to a line; group values add their children; top-level
 * totalizers carry the running sum of all top-level groups before them.
 */
export function computeDre(lines: DreLinha[], own: Map<string, number[]>, width: number): DreRow[] {
  const zeros = () => Array.from({ length: width }, () => 0)
  const children = new Map<string, DreLinha[]>()
  for (const l of lines) {
    if (l.parent_id) {
      const list = children.get(l.parent_id) ?? []
      list.push(l)
      children.set(l.parent_id, list)
    }
  }

  const memo = new Map<string, number[]>()
  const valueOf = (l: DreLinha): number[] => {
    const cached = memo.get(l.id)
    if (cached) return cached
    const v = zeros()
    const mine = own.get(l.id)
    if (mine) mine.forEach((x, i) => { if (i < width) v[i] += x })
    for (const c of children.get(l.id) ?? []) {
      if (c.totalizador) continue
      valueOf(c).forEach((x, i) => { v[i] += x })
    }
    memo.set(l.id, v)
    return v
  }

  const running = zeros()
  const totals = new Map<string, number[]>()
  for (const l of [...lines].sort((a, b) => a.ordem - b.ordem)) {
    if (l.parent_id !== null) continue
    if (l.totalizador) {
      totals.set(l.id, [...running])
    } else {
      valueOf(l).forEach((x, i) => { running[i] += x })
    }
  }

  return [...lines]
    .sort((a, b) => a.ordem - b.ordem)
    .map((l) => ({ ...l, values: (l.totalizador && l.parent_id === null ? totals.get(l.id) : valueOf(l)) ?? zeros() }))
}
