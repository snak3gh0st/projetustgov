// Rubricas da proposta (time de Aprovação): cargo, meses, data de início e
// valor unitário por linha. Total da linha = meses × valor unitário; o total
// das rubricas é a soma das linhas. Contas em centavos para não somar erro
// de ponto flutuante.

export interface Rubrica {
  cargo: string
  meses: number
  dataInicio: string | null // YYYY-MM-DD
  valorUnitario: number
}

export const MAX_RUBRICAS = 200

function cents(value: number): number {
  return Math.round(value * 100)
}

export function totalLinha(r: Pick<Rubrica, 'meses' | 'valorUnitario'>): number {
  const meses = Number.isFinite(r.meses) ? r.meses : 0
  const valor = Number.isFinite(r.valorUnitario) ? r.valorUnitario : 0
  return (cents(valor) * meses) / 100
}

export function totalRubricas(linhas: Pick<Rubrica, 'meses' | 'valorUnitario'>[]): number {
  return linhas.reduce((acc, r) => acc + cents(totalLinha(r)), 0) / 100
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Valida o corpo do PUT. Devolve as linhas normalizadas ou a mensagem de erro. */
export function parseRubricas(input: unknown): { linhas: Rubrica[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'linhas deve ser uma lista' }
  if (input.length > MAX_RUBRICAS) return { error: `Máximo de ${MAX_RUBRICAS} linhas` }

  const linhas: Rubrica[] = []
  for (let i = 0; i < input.length; i++) {
    const n = i + 1
    const raw = input[i] as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') return { error: `Linha ${n} inválida` }

    const cargo = typeof raw.cargo === 'string' ? raw.cargo.trim() : ''
    if (!cargo) return { error: `Linha ${n}: informe o cargo` }
    if (cargo.length > 200) return { error: `Linha ${n}: cargo muito longo` }

    const meses = Number(raw.meses)
    if (!Number.isInteger(meses) || meses < 1 || meses > 600) {
      return { error: `Linha ${n}: meses deve ser um número inteiro maior que zero` }
    }

    const valorUnitario = Number(raw.valorUnitario)
    if (!Number.isFinite(valorUnitario) || valorUnitario < 0 || valorUnitario > 1e10) {
      return { error: `Linha ${n}: valor unitário inválido` }
    }

    let dataInicio: string | null = null
    if (raw.dataInicio != null && raw.dataInicio !== '') {
      if (typeof raw.dataInicio !== 'string' || !DATE_RE.test(raw.dataInicio) || isNaN(Date.parse(raw.dataInicio))) {
        return { error: `Linha ${n}: data inválida` }
      }
      dataInicio = raw.dataInicio
    }

    linhas.push({ cargo, meses, dataInicio, valorUnitario: cents(valorUnitario) / 100 })
  }
  return { linhas }
}
