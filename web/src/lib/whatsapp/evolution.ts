import 'server-only'

// Cliente do Evolution API (serviço que mantém o número das consultorias ligado ao WhatsApp).

export interface WhatsappConfig {
  url: string
  apiKey: string
  instance: string
  secret: string
}

export function whatsappConfig(): WhatsappConfig | null {
  const url = process.env.WHATSAPP_EVOLUTION_URL?.replace(/\/+$/, '')
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!url || !apiKey || !secret) return null
  return { url, apiKey, instance: process.env.WHATSAPP_INSTANCE || 'consultorias', secret }
}

export function whatsappConfigured(): boolean {
  return whatsappConfig() !== null
}

const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  const cfg = whatsappConfig()
  if (!cfg) throw new Error('WhatsApp não configurado')
  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers: { apikey: cfg.apiKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => null)) as T | null
  return { status: res.status, data }
}

const instancePath = () => encodeURIComponent(whatsappConfig()!.instance)

/** Envia texto; devolve o id da mensagem no WhatsApp. Lança se o Evolution não confirmar. */
export async function sendText(phone: string, text: string): Promise<{ waId: string }> {
  const { status, data } = await call<{ key?: { id?: string } }>('POST', `/message/sendText/${instancePath()}`, { number: phone, text })
  const waId = data?.key?.id
  if (status >= 300 || !waId) throw new Error(`Evolution sendText falhou (${status})`)
  return { waId }
}

export async function connectionState(): Promise<'conectado' | 'conectando' | 'desconectado'> {
  try {
    const { status, data } = await call<{ instance?: { state?: string } }>('GET', `/instance/connectionState/${instancePath()}`)
    if (status >= 300) return 'desconectado'
    const state = data?.instance?.state
    return state === 'open' ? 'conectado' : state === 'connecting' ? 'conectando' : 'desconectado'
  } catch {
    return 'desconectado'
  }
}

/** Cria a instância (se faltar), aponta o webhook para o PROJETE e devolve o QR enquanto não estiver conectado. */
export async function ensureInstanceAndQr(webhookUrl: string): Promise<{ estado: string; qrBase64: string | null }> {
  const cfg = whatsappConfig()!
  const webhook = { enabled: true, url: webhookUrl, byEvents: false, base64: false, headers: { 'x-projete-secret': cfg.secret }, events: WEBHOOK_EVENTS }
  const state = await call<{ instance?: { state?: string } }>('GET', `/instance/connectionState/${instancePath()}`)
  if (state.status === 404) {
    await call('POST', '/instance/create', { instanceName: cfg.instance, integration: 'WHATSAPP-BAILEYS', qrcode: true, groupsIgnore: true, webhook })
  }
  await call('POST', `/webhook/set/${instancePath()}`, { webhook })
  const estado = await connectionState()
  if (estado === 'conectado') return { estado, qrBase64: null }
  const qr = await call<{ base64?: string }>('GET', `/instance/connect/${instancePath()}`)
  return { estado, qrBase64: qr.data?.base64 ?? null }
}

export async function mediaBase64(waId: string): Promise<{ base64: string; mimetype: string }> {
  const { status, data } = await call<{ base64?: string; mimetype?: string }>('POST', `/chat/getBase64FromMediaMessage/${instancePath()}`, {
    message: { key: { id: waId } },
  })
  if (status >= 300 || !data?.base64) throw new Error(`Evolution media falhou (${status})`)
  return { base64: data.base64, mimetype: data.mimetype || 'application/octet-stream' }
}
