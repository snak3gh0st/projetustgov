export function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return cnpj
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  )
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return 'R$ 0'
  const n = typeof value === 'string' ? Number(value) : value
  if (isNaN(n)) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatCurrencyFull(value: number | null | undefined): string {
  if (value == null) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0'
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('pt-BR')
}

export function formatCompactCurrency(value: number | string | null | undefined): string {
  if (value == null) return 'R$ 0'
  const n = Number(value)
  if (isNaN(n)) return 'R$ 0'
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return formatCurrency(n)
}

export function formatParlamentarSummary(parlamentares: (string | null)[]): string {
  const valid = parlamentares.filter(Boolean) as string[]
  const unique = Array.from(new Set(valid))
  if (unique.length === 0) return '-'
  if (unique.length === 1) return unique[0]
  return `${unique.length} parlamentares`
}

/** Digits-only E.164-ish path for https://wa.me/ — Brazil prepends 55 when missing. */
export function whatsappMeUrlFromTelefone(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('55') && d.length >= 12) {
    return `https://wa.me/${d}`
  }
  if ((d.length === 10 || d.length === 11) && !d.startsWith('0')) {
    return `https://wa.me/55${d}`
  }
  if (d.length >= 8 && d.length < 12) {
    return `https://wa.me/55${d}`
  }
  return `https://wa.me/${d}`
}
