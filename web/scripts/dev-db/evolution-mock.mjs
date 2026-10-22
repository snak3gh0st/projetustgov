#!/usr/bin/env node
// Simulador local do Evolution API para desenvolver o WhatsApp sem o número real.
//
//   node scripts/dev-db/evolution-mock.mjs                     # servidor em http://127.0.0.1:8085
//   node scripts/dev-db/evolution-mock.mjs inbound 61998765432 "Bom dia" [Nome]   # mensagem de um contato
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
  if (url.startsWith('/instance/connectionState/')) return send(200, { instance: { instanceName: INSTANCE, state: process.env.MOCK_STATE || 'open' } })
  if (url.startsWith('/instance/connect/')) return send(200, { base64: QR, code: 'mock' })
  if (url === '/instance/create' || url.startsWith('/webhook/set/')) return send(201, { ok: true })
  if (url === '/mock/registros' && req.method === 'POST') { registros.push(...(Array.isArray(body) ? body : [body])); return send(201, { total: registros.length }) }
  if (url === '/mock/registros' && req.method === 'DELETE') { registros = []; return send(200, { total: 0 }) }
  if (url.startsWith('/chat/findMessages/')) return send(200, findMessages(body.where, Number(body.page) || 1, Number(body.offset) || 50))
  if (url.startsWith('/chat/findChats/')) {
    const jids = [...new Set(registros.map((r) => r.key.remoteJid))].sort()
    const skip = Number(body.skip) || 0
    return send(200, jids.slice(skip, body.take ? skip + Number(body.take) : undefined).map((remoteJid) => ({ remoteJid })))
  }
  if (url.startsWith('/chat/getBase64FromMediaMessage/')) return send(200, { base64: Buffer.from('arquivo de teste').toString('base64'), mimetype: 'text/plain' })
  send(404, { error: 'rota do mock não existe' })
}).listen(PORT, '127.0.0.1', () => console.log(`Evolution mock em http://127.0.0.1:${PORT}`))
