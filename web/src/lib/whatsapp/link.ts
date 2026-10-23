import { whatsappMeUrlFromTelefone } from '@/lib/format'
import { canonicalPhone } from './phone'

/**
 * Link do botão WhatsApp de um telefone. Com o canal das consultorias ligado para o usuário, abre a conversa em
 * Conversas (com o lead, se houver); sem ele, o WhatsApp do aparelho. null quando o telefone está incompleto.
 */
export function linkWhatsapp(
  telefone: string | null | undefined,
  opts: { noProjete: boolean; cnpj?: string | null }
): { href: string; externo: boolean } | null {
  if (opts.noProjete) {
    const destino = canonicalPhone(telefone)
    if (!destino) return null
    const q = new URLSearchParams({ telefone: destino })
    const cnpj = String(opts.cnpj ?? '').replace(/\D/g, '')
    if (cnpj) q.set('cnpj', cnpj)
    return { href: `/conversas?${q}`, externo: false }
  }
  const href = whatsappMeUrlFromTelefone(telefone)
  return href ? { href, externo: true } : null
}
