import 'server-only'

import { phoneFromJid } from './phone'

// Cliente do Evolution API (serviço que mantém o número das consultorias ligado ao WhatsApp).

export { type WhatsappConfig } from './channels'
import { configForInstance, parseConnectionState, whatsappChannels, type EstadoConexao, type WhatsappConfig } from './channels'
import { getPool } from '@/lib/db'

export function whatsappConfig(channel = 'qr'): WhatsappConfig | null {
  return whatsappChannels().find((c) => c.channel === channel) ?? null
}

export function whatsappConfigured(): boolean {
  return whatsappConfig() !== null
}

const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'LABELS_ASSOCIATION', 'STATUS_INSTANCE', 'SEND_MESSAGE']

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15_000, config?: WhatsappConfig): Promise<{ status: number; data: T | null }> {
  const cfg = config ?? whatsappConfig()
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

const instancePath = (cfg?: WhatsappConfig) => encodeURIComponent((cfg ?? whatsappConfig())!.instance)

/** Envia texto; devolve o id da mensagem no WhatsApp. Lança se o Evolution não confirmar. */
export async function sendText(phone: string, text: string, cfg?: WhatsappConfig): Promise<{ waId: string }> {
  const { status, data } = await call<{ key?: { id?: string } }>('POST', `/message/sendText/${instancePath(cfg)}`, { number: phone, text }, 15_000, cfg)
  const waId = data?.key?.id
  if (status >= 300 || !waId) throw new Error(`Evolution sendText falhou (${status})`)
  return { waId }
}

// Mídia sobe para o WhatsApp antes de sair: até 2 minutos para arquivos grandes.
const TEMPO_MIDIA = 120_000

/** Foto, vídeo ou documento (base64 sem o prefixo data:), com legenda opcional. */
export async function sendMedia(
  phone: string,
  m: { mediatype: 'image' | 'video' | 'document'; mimetype: string; caption: string | null; fileName: string; base64: string }, cfg?: WhatsappConfig
): Promise<{ waId: string }> {
  const { status, data } = await call<{ key?: { id?: string } }>('POST', `/message/sendMedia/${instancePath(cfg)}`, {
    number: phone, mediatype: m.mediatype, mimetype: m.mimetype, fileName: m.fileName, media: m.base64, ...(m.caption ? { caption: m.caption } : {}),
  }, TEMPO_MIDIA, cfg)
  const waId = data?.key?.id
  if (status >= 300 || !waId) throw new Error(`Evolution sendMedia falhou (${status})`)
  return { waId }
}

/** Mensagem de voz: o Evolution converte qualquer áudio (webm do Chrome, mp4 do Safari) para ogg/opus. */
export async function sendVoice(phone: string, base64: string, cfg?: WhatsappConfig): Promise<{ waId: string }> {
  const { status, data } = await call<{ key?: { id?: string } }>('POST', `/message/sendWhatsAppAudio/${instancePath(cfg)}`, { number: phone, audio: base64 }, TEMPO_MIDIA, cfg)
  const waId = data?.key?.id
  if (status >= 300 || !waId) throw new Error(`Evolution sendWhatsAppAudio falhou (${status})`)
  return { waId }
}

export { type EstadoConexao } from './channels'

export async function connectionState(timeoutMs = 5_000, cfg?: WhatsappConfig): Promise<EstadoConexao> {
  try {
    const { status, data } = await call('GET', `/instance/connectionState/${instancePath(cfg)}`, undefined, timeoutMs, cfg)
    return parseConnectionState(status, data)
  } catch { return 'indisponivel' }
}

const estadoCache = new Map<string, { at: number; value: Promise<EstadoConexao> }>()
export function connectionStateCached(cfg = whatsappConfig()!): Promise<EstadoConexao> {
  const cached = estadoCache.get(cfg.instance)
  if (cached && Date.now() - cached.at < 15_000) return cached.value
  const value = connectionState(5_000, cfg)
  estadoCache.set(cfg.instance, { at: Date.now(), value })
  return value
}

const qrs = new Map<string, { base64: string; expires: number }>()
export function rememberQr(instance: string, base64: string) {
  if (configForInstance(instance)?.channel !== 'qr' || !/^data:image\/png;base64,/.test(base64) || base64.length > 100_000) return
  qrs.set(instance, { base64, expires: Date.now() + 45_000 })
}
export function currentQr(instance: string) {
  const qr = qrs.get(instance)
  if (!qr || qr.expires <= Date.now()) { qrs.delete(instance); return null }
  return qr.base64
}

/** Serializes pairing across processes. Connecting is observed, never restarted by polling. */
export async function ensureInstanceAndQr(webhookUrl: string, cfg = whatsappConfig()!): Promise<{ estado: EstadoConexao; qrBase64: string | null }> {
  if (cfg.channel !== 'qr') throw new Error('O canal oficial não usa QR')
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('whatsapp-pairing'), hashtext($1)) AS ok", [cfg.instance])
    if (!lock.rows[0]?.ok) return { estado: 'conectando', qrBase64: currentQr(cfg.instance) }
    const recent = await client.query<{ recent: boolean }>("SELECT ultimo_pareamento_em > NOW() - INTERVAL '60 seconds' AS recent FROM whatsapp_conexao_estado WHERE instancia = $1", [cfg.instance])
    if (recent.rows[0]?.recent) return { estado: 'conectando', qrBase64: currentQr(cfg.instance) }
    const state = await call('GET', `/instance/connectionState/${instancePath(cfg)}`, undefined, 5_000, cfg)
    const estado = parseConnectionState(state.status, state.data)
    if (estado === 'conectado') { qrs.delete(cfg.instance); return { estado, qrBase64: null } }
    if (estado === 'conectando') return { estado, qrBase64: currentQr(cfg.instance) }
    if (state.status !== 404 && estado === 'indisponivel') throw new Error('Estado indisponível; conexão não alterada')
    await client.query('INSERT INTO whatsapp_conexao_estado (instancia, ultimo_pareamento_em) VALUES ($1, NOW()) ON CONFLICT (instancia) DO UPDATE SET ultimo_pareamento_em = NOW()', [cfg.instance])
    const webhook = { enabled: true, url: webhookUrl, byEvents: false, base64: false, headers: { 'x-projete-secret': cfg.secret }, events: WEBHOOK_EVENTS }
    if (state.status === 404) {
      const created = await call('POST', '/instance/create', { instanceName: cfg.instance, integration: cfg.integration, qrcode: false, groupsIgnore: true, syncFullHistory: false, webhook }, 15_000, cfg)
      if (created.status >= 300) throw new Error('Não foi possível criar a instância')
    }
    const configured = await call('POST', `/webhook/set/${instancePath(cfg)}`, { webhook }, 10_000, cfg)
    if (configured.status >= 300) throw new Error('Não foi possível configurar eventos')
    const qr = await call<{ base64?: string }>('GET', `/instance/connect/${instancePath(cfg)}`, undefined, 15_000, cfg)
    if (qr.status >= 300) throw new Error('Não foi possível iniciar o pareamento')
    if (qr.data?.base64) rememberQr(cfg.instance, qr.data.base64)
    estadoCache.delete(cfg.instance)
    return { estado: 'conectando', qrBase64: currentQr(cfg.instance) }
  } finally {
    // Persist the cooldown even when a provider call times out: the socket may already exist.
    try { await client.query('COMMIT') } finally { client.release() }
  }
}

export async function sendTemplate(phone: string, name: string, language: string, cfg: WhatsappConfig): Promise<{ waId: string }> {
  const { status, data } = await call<{ key?: { id?: string } }>('POST', `/message/sendTemplate/${instancePath(cfg)}`, { number: phone, name, language, components: [] }, 15_000, cfg)
  if (status >= 300 || !data?.key?.id) throw new Error(`Evolution template falhou (${status})`)
  return { waId: data.key.id }
}

/**
 * Lid e telefone do mesmo contato, pelas mensagens ao vivo guardadas no Evolution (key.remoteJid = lid,
 * key.remoteJidAlt = telefone). O histórico não traz o par; sem mensagem ao vivo, devolve o que se sabe.
 */
export async function parDoContato(jid: string, opts: { estrito?: boolean; cfg?: WhatsappConfig } = {}): Promise<{ lid: string | null; telefone: string | null }> {
  const par = { lid: jid.endsWith('@lid') ? jid : null, telefone: phoneFromJid(jid) }
  try {
    const { status, data } = await call<{ messages?: { records?: { key?: { remoteJid?: string; remoteJidAlt?: string } }[] } }>(
      'POST', `/chat/findMessages/${instancePath(opts.cfg)}`, { where: { key: { remoteJid: jid, remoteJidAlt: jid } }, offset: 50, page: 1 }, 5_000, opts.cfg
    )
    if (status >= 300) throw new Error(`Evolution findMessages falhou (${status})`)
    // Só registros deste contato: um par errado uniria duas pessoas numa conversa.
    for (const r of (data?.messages?.records ?? []).filter((x) => x.key?.remoteJid === jid || x.key?.remoteJidAlt === jid)) {
      for (const j of [r.key?.remoteJid, r.key?.remoteJidAlt]) {
        if (!j) continue
        if (!par.lid && j.endsWith('@lid')) par.lid = j
        if (!par.telefone) par.telefone = phoneFromJid(j)
      }
      if (par.lid && par.telefone) break
    }
  } catch (error) {
    // Ao vivo, sem o Evolution segue com o que já se sabe; a importação para o chat e tenta de novo.
    if (opts.estrito) throw error
  }
  return par
}

/**
 * JIDs de todos os chats com mensagens guardadas no Evolution, ordenados pelo JID. O Evolution ordena pela última
 * mensagem, que muda durante a importação; a ordem própria deixa as páginas estáveis.
 */
export async function listarChats(): Promise<{ jid: string; nome: string | null }[]> {
  const { status, data } = await call<{ remoteJid?: string; pushName?: string | null }[]>('POST', `/chat/findChats/${instancePath()}`, {}, 60_000)
  if (status >= 300 || !Array.isArray(data)) throw new Error(`Evolution findChats falhou (${status})`)
  const porJid = new Map<string, string | null>()
  // Quando a última mensagem é nossa, o Evolution põe "Você" como nome.
  for (const c of data) if (c.remoteJid && !porJid.has(c.remoteJid)) porJid.set(c.remoteJid, c.pushName && c.pushName !== 'Você' ? c.pushName : null)
  return Array.from(porJid, ([jid, nome]) => ({ jid, nome })).sort((a, b) => (a.jid < b.jid ? -1 : a.jid > b.jid ? 1 : 0))
}

/** Uma página (100) das mensagens de um chat entre `desde` e `ate`, mais recentes primeiro. */
export async function mensagensDoChat(jid: string, desde: Date, ate: Date, pagina: number): Promise<{ registros: unknown[]; paginas: number }> {
  const { status, data } = await call<{ messages?: { pages?: number; records?: { key?: { remoteJid?: string; remoteJidAlt?: string } }[] } }>(
    'POST', `/chat/findMessages/${instancePath()}`,
    {
      // Os dois campos: com só um, o filtro OR do Evolution devolve as mensagens de todos os chats.
      where: { key: { remoteJid: jid, remoteJidAlt: jid }, messageTimestamp: { gte: desde.toISOString(), lte: ate.toISOString() } },
      offset: 100,
      page: pagina,
    },
    30_000
  )
  if (status >= 300) throw new Error(`Evolution findMessages falhou (${status})`)
  const registros = (data?.messages?.records ?? []).filter((r) => r.key?.remoteJid === jid || r.key?.remoteJidAlt === jid)
  return { registros, paginas: data?.messages?.pages ?? 0 }
}

export async function mediaBase64(waId: string, cfg?: WhatsappConfig): Promise<{ base64: string; mimetype: string }> {
  const { status, data } = await call<{ base64?: string; mimetype?: string }>('POST', `/chat/getBase64FromMediaMessage/${instancePath(cfg)}`, {
    message: { key: { id: waId } },
  }, 15_000, cfg)
  if (status >= 300 || !data?.base64) throw new Error(`Evolution media falhou (${status})`)
  return { base64: data.base64, mimetype: data.mimetype || 'application/octet-stream' }
}
