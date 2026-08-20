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

/**
 * Build a WhatsApp deep-link only for a complete Brazilian phone number.
 * The CRM should show an unavailable state instead of opening a malformed
 * conversation when a contact has only a partial or invalid phone value.
 */
export function whatsappMeUrlFromTelefone(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? '').replace(/\D/g, '')
  const local = d.startsWith('55') ? d.slice(2) : d

  // Brazil: 2-digit area code + 8-digit landline or 9-digit mobile.
  if ((local.length !== 10 && local.length !== 11) || local.startsWith('0')) {
    return null
  }

  return `https://wa.me/55${local}`
}

/**
 * Google Calendar “create event” deep-link (no OAuth).
 * Opens the event editor with Meet as location; user confirms time in Calendar.
 */
export function googleCalendarEventUrl(opts: {
  title: string
  details?: string
  guestEmail?: string | null
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    details: opts.details || '',
    location: 'Google Meet',
  })
  if (opts.guestEmail?.trim()) {
    params.set('add', opts.guestEmail.trim())
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
