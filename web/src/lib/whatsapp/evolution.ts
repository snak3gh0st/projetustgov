import 'server-only'

import { phoneFromJid } from './phone'

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

const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'LABELS_ASSOCIATION']

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15_000): Promise<{ status: number; data: T | null }> {
  const cfg = whatsappConfig()
  if (!cfg) throw new Error('WhatsApp não configurado')
  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers: { apikey: cfg.apiKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
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

export type EstadoConexao = 'conectado' | 'conectando' | 'desconectado'

export async function connectionState(timeoutMs?: number): Promise<EstadoConexao> {
  try {
    const { status, data } = await call<{ instance?: { state?: string } }>('GET', `/instance/connectionState/${instancePath()}`, undefined, timeoutMs)
    if (status >= 300) return 'desconectado'
    const state = data?.instance?.state
    return state === 'open' ? 'conectado' : state === 'connecting' ? 'conectando' : 'desconectado'
  } catch {
    return 'desconectado'
  }
}

let estadoCache: { estado: EstadoConexao; at: number } | null = null

/** Estado para as telas que fazem polling (Conversas, card): espera até 3 s e consulta o Evolution no máximo a cada 30 s. */
export async function connectionStateCached(): Promise<EstadoConexao> {
  if (estadoCache && Date.now() - estadoCache.at < 30_000) return estadoCache.estado
  const estado = await connectionState(3_000)
  estadoCache = { estado, at: Date.now() }
  return estado
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

/**
 * Lid e telefone do mesmo contato, pelas mensagens ao vivo guardadas no Evolution (key.remoteJid = lid,
 * key.remoteJidAlt = telefone). O histórico não traz o par; sem mensagem ao vivo, devolve o que se sabe.
 */
export async function parDoContato(jid: string): Promise<{ lid: string | null; telefone: string | null }> {
  const par = { lid: jid.endsWith('@lid') ? jid : null, telefone: phoneFromJid(jid) }
  try {
    const { status, data } = await call<{ messages?: { records?: { key?: { remoteJid?: string; remoteJidAlt?: string } }[] } }>(
      'POST', `/chat/findMessages/${instancePath()}`, { where: { key: { remoteJid: jid, remoteJidAlt: jid } }, offset: 20, page: 1 }, 5_000
    )
    if (status >= 300) return par
    for (const r of data?.messages?.records ?? []) {
      for (const j of [r.key?.remoteJid, r.key?.remoteJidAlt]) {
        if (!j) continue
        if (!par.lid && j.endsWith('@lid')) par.lid = j
        if (!par.telefone) par.telefone = phoneFromJid(j)
      }
      if (par.lid && par.telefone) break
    }
  } catch {
    // Sem o Evolution, segue com o que já se sabe.
  }
  return par
}

/**
 * JIDs de todos os chats com mensagens guardadas no Evolution, ordenados pelo JID. O Evolution ordena pela última
 * mensagem, que muda durante a importação; a ordem própria deixa as páginas estáveis.
 */
export async function listarChats(): Promise<string[]> {
  const { status, data } = await call<{ remoteJid?: string }[]>('POST', `/chat/findChats/${instancePath()}`, {}, 60_000)
  if (status >= 300 || !Array.isArray(data)) throw new Error(`Evolution findChats falhou (${status})`)
  return Array.from(new Set(data.map((c) => c.remoteJid).filter((j): j is string => !!j))).sort()
}

/** Uma página (100) das mensagens de um chat desde `desde`, mais recentes primeiro. */
export async function mensagensDoChat(jid: string, desde: Date, pagina: number): Promise<{ registros: unknown[]; paginas: number }> {
  const { status, data } = await call<{ messages?: { pages?: number; records?: { key?: { remoteJid?: string; remoteJidAlt?: string } }[] } }>(
    'POST', `/chat/findMessages/${instancePath()}`,
    {
      // Os dois campos: com só um, o filtro OR do Evolution devolve as mensagens de todos os chats.
      where: { key: { remoteJid: jid, remoteJidAlt: jid }, messageTimestamp: { gte: desde.toISOString(), lte: new Date().toISOString() } },
      offset: 100,
      page: pagina,
    },
    30_000
  )
  if (status >= 300) throw new Error(`Evolution findMessages falhou (${status})`)
  const registros = (data?.messages?.records ?? []).filter((r) => r.key?.remoteJid === jid || r.key?.remoteJidAlt === jid)
  return { registros, paginas: data?.messages?.pages ?? 0 }
}

export async function mediaBase64(waId: string): Promise<{ base64: string; mimetype: string }> {
  const { status, data } = await call<{ base64?: string; mimetype?: string }>('POST', `/chat/getBase64FromMediaMessage/${instancePath()}`, {
    message: { key: { id: waId } },
  })
  if (status >= 300 || !data?.base64) throw new Error(`Evolution media falhou (${status})`)
  return { base64: data.base64, mimetype: data.mimetype || 'application/octet-stream' }
}
