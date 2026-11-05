#!/usr/bin/env node
// Simulador local do Evolution API para desenvolver o WhatsApp sem o número real.
//
//   node scripts/dev-db/evolution-mock.mjs                     # servidor em http://127.0.0.1:8085
//   node scripts/dev-db/evolution-mock.mjs inbound 61998765432 "Bom dia" [Nome]   # mensagem de um contato
//   node scripts/dev-db/evolution-mock.mjs inbound-midia 61998765432 imagem|audio|video|documento|html [legenda]
//   MOCK_STATE=close / MOCK_FAIL_SEND=1                         # simula desconectado / falha de envio
//   POST /mock/registros [{ key, message, messageTimestamp, ... }]  # mensagens guardadas (histórico e pares lid/telefone)
//   DELETE /mock/registros                                          # esvazia
//
// Usa WHATSAPP_WEBHOOK_SECRET e APP_URL (padrão http://localhost:3100) para chamar o webhook do app.
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = 8085
const APP_URL = process.env.APP_URL || 'http://localhost:3100'
const SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || 'dev-secret'
const INSTANCE = process.env.WHATSAPP_INSTANCE || 'consultorias'
const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function webhook(event, data) {
  const res = await fetch(`${APP_URL}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-projete-secret': SECRET },
    body: JSON.stringify({ event, instance: INSTANCE, data, date_time: new Date().toISOString() }),
  })
  return `${res.status} ${await res.text()}`
}

// Amostras de mídia: foto 2x2, áudio WAV de 1 s (bipe), HTML (tem de baixar, nunca abrir na página).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwHwQZGBgY/jMwMAAA5wf5EVBRmNYAAAAASUVORK5CYII='
function wav() {
  const rate = 8000, n = rate
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2)
  return b.toString('base64')
}
const AMOSTRAS = {
  imagem: { campo: 'imageMessage', mimetype: 'image/png', base64: PNG },
  audio: { campo: 'audioMessage', mimetype: 'audio/wav', base64: wav(), segundos: 1 },
  video: { campo: 'videoMessage', mimetype: 'video/mp4', base64: Buffer.from('video de teste').toString('base64') },
  documento: { campo: 'documentMessage', mimetype: 'application/pdf', base64: Buffer.from('%PDF-1.4 teste').toString('base64'), fileName: 'proposta.pdf' },
  html: { campo: 'documentMessage', mimetype: 'text/html', base64: Buffer.from('<script>alert(1)</script>').toString('base64'), fileName: 'pagina.html' },
}
// Mídia por id de mensagem (recebida pelo inbound-midia ou enviada pelo app), para /chat/getBase64FromMediaMessage.
const midias = new Map()
const MEDIATYPE_CAMPO = { image: 'imageMessage', video: 'videoMessage', document: 'documentMessage', audio: 'audioMessage' }

const jidOf = (number) => `${String(number).replace(/\D/g, '').replace(/^(?!55)/, '55')}@s.whatsapp.net`

if (process.argv[2] === 'inbound') {
  const [, , , number, text, name] = process.argv
  const out = await webhook('messages.upsert', {
    key: { remoteJid: jidOf(number), fromMe: false, id: `IN-${randomUUID().slice(0, 8)}` },
    pushName: name || 'Contato de teste',
    message: { conversation: text || 'Olá' },
    messageType: 'conversation',
    messageTimestamp: Math.floor(Date.now() / 1000),
  })
  console.log(out)
  process.exit(0)
}

if (process.argv[2] === 'inbound-midia') {
  const [, , , number, tipo, legenda] = process.argv
  const a = AMOSTRAS[tipo] ?? AMOSTRAS.imagem
  const id = `IN-${randomUUID().slice(0, 8)}`
  // Sem servidor rodando no mesmo processo: o mock que está no ar recebe a amostra por /mock/midia.
  await fetch(`http://127.0.0.1:${PORT}/mock/midia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, base64: a.base64, mimetype: a.mimetype }) })
  const out = await webhook('messages.upsert', {
    key: { remoteJid: jidOf(number), fromMe: false, id },
    pushName: 'Contato de teste',
    message: { [a.campo]: { mimetype: a.mimetype, fileLength: Buffer.from(a.base64, 'base64').length, ...(a.segundos ? { seconds: a.segundos } : {}), ...(a.fileName ? { fileName: a.fileName } : {}), ...(legenda ? { caption: legenda } : {}) } },
    messageTimestamp: Math.floor(Date.now() / 1000),
  })
  console.log(out)
  process.exit(0)
}

const read = (req) => new Promise((resolve) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch { resolve({}) } })
})

// Mensagens "guardadas no banco do Evolution", para /chat/findMessages e /chat/findChats.
let registros = []

function findMessages(where = {}, page = 1, offset = 50) {
  const k = where.key || {}
  const ts = where.messageTimestamp || {}
  const gte = ts.gte ? Date.parse(ts.gte) / 1000 : -Infinity
  const lte = ts.lte ? Date.parse(ts.lte) / 1000 : Infinity
  const lista = registros
    .filter((r) => (!k.remoteJid && !k.remoteJidAlt) || (k.remoteJid && r.key.remoteJid === k.remoteJid) || (k.remoteJidAlt && r.key.remoteJidAlt === k.remoteJidAlt))
    .filter((r) => r.messageTimestamp >= gte && r.messageTimestamp <= lte)
    .sort((a, b) => b.messageTimestamp - a.messageTimestamp)
  const records = lista.slice((page - 1) * offset, page * offset)
  return { messages: { total: lista.length, pages: Math.ceil(lista.length / offset), currentPage: page, records } }
}

http.createServer(async (req, res) => {
  const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
  const url = req.url || ''
  const body = req.method === 'POST' ? await read(req) : {}
  console.log(req.method, url)

  if (url.startsWith('/message/sendText/')) {
    if (process.env.MOCK_FAIL_SEND) return send(500, { error: 'mock falhou' })
    const id = `OUT-${randomUUID().slice(0, 8)}`
    // Como o Evolution: o envio volta pelo webhook e depois chega a confirmação de entrega.
    setTimeout(() => webhook('messages.upsert', {
      key: { remoteJid: jidOf(body.number), fromMe: true, id }, message: { conversation: body.text }, messageTimestamp: Math.floor(Date.now() / 1000),
    }).catch(() => {}), 200)
    setTimeout(() => webhook('messages.update', { keyId: id, remoteJid: jidOf(body.number), fromMe: true, status: 'DELIVERY_ACK' }).catch(() => {}), 600)
    return send(201, { key: { remoteJid: jidOf(body.number), fromMe: true, id }, status: 'PENDING' })
  }
  if (url.startsWith('/message/sendMedia/') || url.startsWith('/message/sendWhatsAppAudio/')) {
    if (process.env.MOCK_FAIL_SEND) return send(500, { error: 'mock falhou' })
    const voz = url.startsWith('/message/sendWhatsAppAudio/')
    const id = `OUT-${randomUUID().slice(0, 8)}`
    const mimetype = voz ? 'audio/ogg; codecs=opus' : body.mimetype
    midias.set(id, { base64: voz ? body.audio : body.media, mimetype })
    const campo = voz ? 'audioMessage' : MEDIATYPE_CAMPO[body.mediatype] ?? 'documentMessage'
    const conteudo = { mimetype, ...(body.caption ? { caption: body.caption } : {}), ...(body.fileName ? { fileName: body.fileName } : {}), ...(voz ? { ptt: true } : {}) }
    setTimeout(() => webhook('messages.upsert', {
      key: { remoteJid: jidOf(body.number), fromMe: true, id }, message: { [campo]: conteudo }, messageTimestamp: Math.floor(Date.now() / 1000),
    }).catch(() => {}), 200)
    return send(201, { key: { remoteJid: jidOf(body.number), fromMe: true, id }, status: 'PENDING' })
  }
  if (url === '/mock/midia' && req.method === 'POST') { midias.set(body.id, { base64: body.base64, mimetype: body.mimetype }); return send(201, { ok: true }) }
  if (url.startsWith('/instance/connectionState/')) return send(200, { instance: { instanceName: INSTANCE, state: process.env.MOCK_STATE || 'open' } })
  if (url.startsWith('/instance/connect/')) return send(200, { base64: QR, code: 'mock' })
  if (url === '/instance/create' || url.startsWith('/webhook/set/')) return send(201, { ok: true })
  if (url === '/mock/registros' && req.method === 'POST') { registros.push(...(Array.isArray(body) ? body : [body])); return send(201, { total: registros.length }) }
  if (url === '/mock/registros' && req.method === 'DELETE') { registros = []; return send(200, { total: 0 }) }
  if (url.startsWith('/chat/findMessages/')) return send(200, findMessages(body.where, Number(body.page) || 1, Number(body.offset) || 50))
  if (url.startsWith('/chat/findChats/')) {
    // Como o Evolution: um chat por remoteJid, com o pushName da última mensagem ("Você" se for nossa).
    const ultimas = new Map()
    for (const r of [...registros].sort((a, b) => b.messageTimestamp - a.messageTimestamp)) {
      if (!ultimas.has(r.key.remoteJid)) ultimas.set(r.key.remoteJid, r.key.fromMe ? 'Você' : r.pushName || null)
    }
    const chats = [...ultimas].map(([remoteJid, pushName]) => ({ remoteJid, pushName }))
    const skip = Number(body.skip) || 0
    return send(200, chats.slice(skip, body.take ? skip + Number(body.take) : undefined))
  }
  if (url.startsWith('/chat/getBase64FromMediaMessage/')) {
    const m = midias.get(body.message?.key?.id)
    return send(200, m ?? { base64: Buffer.from('arquivo de teste').toString('base64'), mimetype: 'text/plain' })
  }
  send(404, { error: 'rota do mock não existe' })
}).listen(PORT, '127.0.0.1', () => console.log(`Evolution mock em http://127.0.0.1:${PORT}`))
