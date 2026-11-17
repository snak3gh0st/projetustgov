export type WhatsappChannel = 'qr' | 'oficial'

export interface WhatsappConfig {
  channel: WhatsappChannel
  label: string
  integration: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS'
  url: string
  apiKey: string
  instance: string
  secret: string
}

/** Only explicitly configured instances are trusted, including webhook origins. */
export function whatsappChannels(env: Record<string, string | undefined> = process.env): WhatsappConfig[] {
  const url = env.WHATSAPP_EVOLUTION_URL?.replace(/\/+$/, '')
  const apiKey = env.WHATSAPP_EVOLUTION_API_KEY
  const secret = env.WHATSAPP_WEBHOOK_SECRET
  if (!url || !apiKey || !secret) return []
  const qr: WhatsappConfig = { channel: 'qr', label: 'Consultorias', integration: 'WHATSAPP-BAILEYS', url, apiKey, secret, instance: env.WHATSAPP_INSTANCE || 'consultorias' }
  const official = env.WHATSAPP_OFFICIAL_INSTANCE?.trim()
  if (official === qr.instance) throw new Error('Os canais de WhatsApp precisam de instâncias diferentes')
  return [qr, ...(official ? [{ ...qr, channel: 'oficial' as const, label: env.WHATSAPP_OFFICIAL_LABEL || 'WhatsApp oficial', integration: 'WHATSAPP-BUSINESS' as const, instance: official }] : [])]
}

export function configForInstance(instance: string): WhatsappConfig | null {
  return whatsappChannels().find((c) => c.instance === instance) ?? null
}

/** Approved templates without parameters; never accept arbitrary template names from a browser. */
export function officialTemplates(env: Record<string, string | undefined> = process.env): { name: string; language: string }[] {
  return (env.WHATSAPP_OFFICIAL_TEMPLATES || '').split(',').flatMap((value) => {
    const [name, language, extra] = value.trim().split(':')
    return /^[a-z0-9_]{1,512}$/.test(name || '') && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(language || '') && !extra ? [{ name, language }] : []
  })
}

export type EstadoConexao = 'conectado' | 'conectando' | 'desconectado' | 'indisponivel'

export function parseConnectionState(status: number, data: unknown): EstadoConexao {
  if (status !== 200) return 'indisponivel'
  const state = (data as { instance?: { state?: unknown } } | null)?.instance?.state
  return state === 'open' ? 'conectado' : state === 'connecting' ? 'conectando' : state === 'close' ? 'desconectado' : 'indisponivel'
}

export function freeformAllowed(lastInbound: string | null, now = Date.now()): boolean {
  const at = lastInbound ? Date.parse(lastInbound) : NaN
  return Number.isFinite(at) && at <= now && now - at < 24 * 60 * 60 * 1000
}
