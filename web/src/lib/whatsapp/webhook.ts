import { phoneFromJid } from './phone'

// Eventos do Evolution API (v2) traduzidos para o que o PROJETE grava. Nunca lança: corpo estranho vira 'ignorado'.

export type MensagemTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha' | 'outro'

export type WebhookEvent =
  | {
      // lid: identificador do contato no WhatsApp (…@lid), quando vier; o histórico só tem ele.
      kind: 'mensagem'; instancia: string; waId: string; telefone: string | null; jid: string; lid: string | null; nome: string | null
      fromMe: boolean; texto: string | null; tipo: MensagemTipo; midia: { mimetype?: string; fileName?: string } | null; enviadaEm: string
    }
  | { kind: 'status'; instancia: string; waId: string; status: 'enviada' | 'entregue' | 'lida' | 'falhou' }
  | { kind: 'conexao'; instancia: string; estado: 'conectado' | 'conectando' | 'desconectado' }
  | { kind: 'qrcode'; instancia: string; base64: string }
  | { kind: 'etiqueta'; instancia: string; chatJid: string; labelId: string; tipo: 'add' | 'remove' }
  | { kind: 'ignorado'; motivo: string }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

const MEDIA: [string, MensagemTipo][] = [
  ['imageMessage', 'imagem'], ['audioMessage', 'audio'], ['videoMessage', 'video'],
  ['documentMessage', 'documento'], ['documentWithCaptionMessage', 'documento'], ['stickerMessage', 'figurinha'],
]

const STATUS: Record<string, 'enviada' | 'entregue' | 'lida' | 'falhou'> = {
  PENDING: 'enviada', SERVER_ACK: 'enviada', DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', ERROR: 'falhou',
}

const ESTADO: Record<string, 'conectado' | 'conectando' | 'desconectado'> = {
  open: 'conectado', connecting: 'conectando', close: 'desconectado', refused: 'desconectado',
}

/** Uma mensagem no formato do Evolution: o data de messages.upsert ou um registro de /chat/findMessages. */
export function parseMensagem(instancia: string, d: unknown): WebhookEvent {
  if (!isObj(d) || !isObj(d.key) || !isObj(d.message)) return { kind: 'ignorado', motivo: 'mensagem sem chave' }
  const k = d.key
  let jid = str(k.remoteJid)
  const alt = str(k.remoteJidAlt)
  const lid = jid?.endsWith('@lid') ? jid : alt?.endsWith('@lid') ? alt : null
  if (jid?.endsWith('@lid') && alt) jid = alt
  const waId = str(k.id)
  if (!jid || !waId) return { kind: 'ignorado', motivo: 'mensagem sem contato' }
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) {
    return { kind: 'ignorado', motivo: 'grupo ou transmissão' }
  }

  const m = d.message
  let tipo: MensagemTipo = 'outro'
  let texto = str(m.conversation) ?? (isObj(m.extendedTextMessage) ? str(m.extendedTextMessage.text) : null)
  let midia: { mimetype?: string; fileName?: string } | null = null
  if (texto) tipo = 'texto'
  for (const [field, t] of MEDIA) {
    const node = m[field]
    if (!isObj(node)) continue
    const inner = isObj(node.message) && isObj(node.message.documentMessage) ? node.message.documentMessage : node
    tipo = t
    texto = texto ?? str(inner.caption)
    midia = {
      ...(str(inner.mimetype) ? { mimetype: str(inner.mimetype)! } : {}),
      ...(str(inner.fileName) ? { fileName: str(inner.fileName)! } : {}),
    }
    break
  }

  const fromMe = k.fromMe === true
  const ts = Number(d.messageTimestamp)
  return {
    kind: 'mensagem',
    instancia,
    waId,
    telefone: phoneFromJid(jid),
    jid,
    lid,
    // pushName de mensagem enviada é o nome do próprio número, não do contato.
    nome: fromMe ? null : str(d.pushName),
    fromMe,
    texto,
    tipo,
    midia,
    enviadaEm: new Date(Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.now()).toISOString(),
  }
}

export function parseWebhook(body: unknown): WebhookEvent[] {
  if (!isObj(body)) return []
  const event = String(body.event ?? '').replace(/[.-]/g, '_').toUpperCase()
  const instancia = str(body.instance) ?? ''
  const data = body.data

  switch (event) {
    case 'MESSAGES_UPSERT': {
      const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.messages) ? data.messages : [data]
      return list.map((d) => parseMensagem(instancia, d))
    }
    case 'MESSAGES_UPDATE': {
      const list = Array.isArray(data) ? data : [data]
      return list.map((d): WebhookEvent => {
        if (!isObj(d)) return { kind: 'ignorado', motivo: 'status sem dados' }
        const waId = str(d.keyId) ?? (isObj(d.key) ? str(d.key.id) : null)
        const status = STATUS[String(d.status)]
        return waId && status ? { kind: 'status', instancia, waId, status } : { kind: 'ignorado', motivo: 'status desconhecido' }
      })
    }
    case 'CONNECTION_UPDATE': {
      const estado = isObj(data) ? ESTADO[String(data.state)] : undefined
      return [estado ? { kind: 'conexao', instancia, estado } : { kind: 'ignorado', motivo: 'conexão sem estado' }]
    }
    case 'QRCODE_UPDATED': {
      const base64 = isObj(data) && isObj(data.qrcode) ? str(data.qrcode.base64) : null
      return [base64 ? { kind: 'qrcode', instancia, base64 } : { kind: 'ignorado', motivo: 'qrcode vazio' }]
    }
    case 'LABELS_ASSOCIATION': {
      const chatJid = isObj(data) ? str(data.chatId) : null
      const labelId = isObj(data) && (typeof data.labelId === 'string' || typeof data.labelId === 'number') ? String(data.labelId) : null
      const tipo = isObj(data) && (data.type === 'add' || data.type === 'remove') ? data.type : null
      return [chatJid && labelId && tipo ? { kind: 'etiqueta', instancia, chatJid, labelId, tipo } : { kind: 'ignorado', motivo: 'etiqueta incompleta' }]
    }
    default:
      return [{ kind: 'ignorado', motivo: `evento ${event || 'vazio'}` }]
  }
}
