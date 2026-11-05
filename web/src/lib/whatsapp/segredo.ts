import { timingSafeEqual } from 'node:crypto'

/** Compara o segredo do cabeçalho x-projete-secret sem vazar tempo. */
export function segredoConfere(given: string | null, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
