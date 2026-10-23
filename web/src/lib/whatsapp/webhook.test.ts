import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMensagem, parseWebhook } from './webhook'

const upsert = (data: Record<string, unknown>, event = 'messages.upsert') => ({ event, instance: 'consultorias', data, apikey: 'x' })
const key = (over: Record<string, unknown> = {}) => ({ remoteJid: '5561998765432@s.whatsapp.net', fromMe: false, id: 'ABC1', ...over })

test('a received text becomes a message from the contact', () => {
  const [ev] = parseWebhook(upsert({ key: key(), pushName: 'Maria', message: { conversation: 'Bom dia' }, messageType: 'conversation', messageTimestamp: 1761130800 }))
  assert.deepEqual(ev, {
    kind: 'mensagem', instancia: 'consultorias', waId: 'ABC1', telefone: '5561998765432', jid: '5561998765432@s.whatsapp.net', lid: null,
    nome: 'Maria', fromMe: false, texto: 'Bom dia', tipo: 'texto', midia: null, enviadaEm: new Date(1761130800 * 1000).toISOString(),
  })
})

test('a text sent from the phone keeps fromMe and no contact name', () => {
  const [ev] = parseWebhook(upsert({ key: key({ fromMe: true }), pushName: 'Consultorias', message: { extendedTextMessage: { text: 'Retorno amanhã' } }, messageTimestamp: '1761130800' }, 'MESSAGES_UPSERT'))
  assert.equal(ev.kind, 'mensagem')
  if (ev.kind !== 'mensagem') return
  assert.equal(ev.fromMe, true)
  assert.equal(ev.texto, 'Retorno amanhã')
  assert.equal(ev.nome, null)
})

test('media keeps its type, caption and file data', () => {
  const [img] = parseWebhook(upsert({ key: key({ id: 'IMG' }), message: { imageMessage: { caption: 'Ofício', mimetype: 'image/jpeg' } }, messageTimestamp: 1 }))
  const [audio] = parseWebhook(upsert({ key: key({ id: 'AUD' }), message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } }, messageTimestamp: 1 }))
  const [doc] = parseWebhook(upsert({ key: key({ id: 'DOC' }), message: { documentMessage: { fileName: 'plano.pdf', mimetype: 'application/pdf' } }, messageTimestamp: 1 }))
  assert.deepEqual([img, audio, doc].map((e) => e.kind === 'mensagem' && [e.tipo, e.texto, e.midia]), [
    ['imagem', 'Ofício', { mimetype: 'image/jpeg' }],
    ['audio', null, { mimetype: 'audio/ogg; codecs=opus' }],
    ['documento', null, { mimetype: 'application/pdf', fileName: 'plano.pdf' }],
  ])
})

test('media keeps size and duration when WhatsApp sends them', () => {
  const [img] = parseWebhook(upsert({ key: key({ id: 'IMG2' }), message: { imageMessage: { mimetype: 'image/jpeg', fileLength: '34567' } }, messageTimestamp: 1 }))
  const [audio] = parseWebhook(upsert({ key: key({ id: 'AUD2' }), message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 7, fileLength: 9100 } }, messageTimestamp: 1 }))
  assert.deepEqual([img, audio].map((e) => e.kind === 'mensagem' && e.midia), [
    { mimetype: 'image/jpeg', tamanho: 34567 },
    { mimetype: 'audio/ogg; codecs=opus', tamanho: 9100, segundos: 7 },
  ])
})

test('groups and broadcasts are ignored', () => {
  assert.equal(parseWebhook(upsert({ key: key({ remoteJid: '120363025246125244@g.us' }), message: { conversation: 'oi' }, messageTimestamp: 1 }))[0].kind, 'ignorado')
  assert.equal(parseWebhook(upsert({ key: key({ remoteJid: 'status@broadcast' }), message: { conversation: 'oi' }, messageTimestamp: 1 }))[0].kind, 'ignorado')
})

test('a @lid contact uses remoteJidAlt for the phone; without it the phone is unknown', () => {
  const [withAlt] = parseWebhook(upsert({ key: key({ remoteJid: '1234@lid', remoteJidAlt: '5561998765432@s.whatsapp.net' }), message: { conversation: 'oi' }, messageTimestamp: 1 }))
  const [noAlt] = parseWebhook(upsert({ key: key({ remoteJid: '1234@lid' }), message: { conversation: 'oi' }, messageTimestamp: 1 }))
  assert.equal(withAlt.kind === 'mensagem' && withAlt.telefone, '5561998765432')
  assert.equal(noAlt.kind === 'mensagem' && noAlt.telefone, null)
  assert.equal(noAlt.kind === 'mensagem' && noAlt.jid, '1234@lid')
})

test('status updates map to enviada, entregue, lida and falhou', () => {
  const st = (s: string) => parseWebhook({ event: 'messages.update', instance: 'consultorias', data: { keyId: 'ABC1', remoteJid: 'x', fromMe: true, status: s } })[0]
  assert.deepEqual(['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED', 'ERROR'].map((s) => { const e = st(s); return e.kind === 'status' ? e.status : e.kind }),
    ['enviada', 'entregue', 'lida', 'lida', 'falhou'])
})

test('connection and QR code events', () => {
  assert.deepEqual(parseWebhook({ event: 'connection.update', instance: 'consultorias', data: { state: 'open' } }), [{ kind: 'conexao', instancia: 'consultorias', estado: 'conectado' }])
  assert.deepEqual(parseWebhook({ event: 'qrcode.updated', instance: 'consultorias', data: { qrcode: { base64: 'data:image/png;base64,AAA' } } }), [{ kind: 'qrcode', instancia: 'consultorias', base64: 'data:image/png;base64,AAA' }])
})

test('a list of messages yields one event each', () => {
  const evs = parseWebhook(upsert([{ key: key({ id: 'A' }), message: { conversation: '1' }, messageTimestamp: 1 }, { key: key({ id: 'B' }), message: { conversation: '2' }, messageTimestamp: 2 }] as never))
  assert.deepEqual(evs.map((e) => e.kind === 'mensagem' && e.waId), ['A', 'B'])
})

test('unknown events and broken bodies never throw', () => {
  assert.equal(parseWebhook({ event: 'chats.update', instance: 'consultorias', data: {} })[0].kind, 'ignorado')
  assert.deepEqual(parseWebhook(null), [])
  assert.deepEqual(parseWebhook('x'), [])
  assert.equal(parseWebhook(upsert({}))[0].kind, 'ignorado')
})

test('a live message keeps both the lid and the phone', () => {
  const [ev] = parseWebhook(upsert({ key: key({ remoteJid: '10415396397278@lid', remoteJidAlt: '556292253866@s.whatsapp.net' }), message: { conversation: 'oi' }, messageTimestamp: 1 }))
  assert.equal(ev.kind === 'mensagem' && ev.lid, '10415396397278@lid')
  assert.equal(ev.kind === 'mensagem' && ev.telefone, '5562992253866')
  assert.equal(ev.kind === 'mensagem' && ev.jid, '556292253866@s.whatsapp.net')
})

test('the lid is kept when Evolution puts the phone first', () => {
  const [ev] = parseWebhook(upsert({ key: key({ remoteJid: '556292253866@s.whatsapp.net', remoteJidAlt: '10415396397278@lid' }), message: { conversation: 'oi' }, messageTimestamp: 1 }))
  assert.equal(ev.kind === 'mensagem' && ev.lid, '10415396397278@lid')
  assert.equal(ev.kind === 'mensagem' && ev.telefone, '5562992253866')
})

test('a history message has only the lid', () => {
  const [ev] = parseWebhook(upsert({ key: key({ remoteJid: '85822355300446@lid' }), message: { conversation: 'antiga' }, messageTimestamp: 1 }))
  assert.equal(ev.kind, 'mensagem')
  if (ev.kind !== 'mensagem') return
  assert.equal(ev.lid, '85822355300446@lid')
  assert.equal(ev.telefone, null)
  assert.equal(ev.jid, '85822355300446@lid')
})

test('a phone-only message has no lid', () => {
  const [ev] = parseWebhook(upsert({ key: key(), message: { conversation: 'oi' }, messageTimestamp: 1 }))
  assert.equal(ev.kind === 'mensagem' && ev.lid, null)
})

test('parseMensagem reads a findMessages record like the webhook data', () => {
  const ev = parseMensagem('consultorias', { key: { remoteJid: '85822355300446@lid', fromMe: true, id: 'H1' }, message: { conversation: 'histórico' }, messageTimestamp: 1761130800 })
  assert.equal(ev.kind === 'mensagem' && ev.waId, 'H1')
  assert.equal(ev.kind === 'mensagem' && ev.fromMe, true)
})

test('a label association becomes an etiqueta event', () => {
  const [ev] = parseWebhook({ event: 'labels.association', instance: 'consultorias', data: { instance: 'consultorias', type: 'add', chatId: '85822355300446@lid', labelId: '4' } })
  assert.deepEqual(ev, { kind: 'etiqueta', instancia: 'consultorias', chatJid: '85822355300446@lid', labelId: '4', tipo: 'add' })
  const [rm] = parseWebhook({ event: 'LABELS_ASSOCIATION', instance: 'consultorias', data: { type: 'remove', chatId: '85822355300446@lid', labelId: 5 } })
  assert.deepEqual(rm, { kind: 'etiqueta', instancia: 'consultorias', chatJid: '85822355300446@lid', labelId: '5', tipo: 'remove' })
})

test('a label association without chat or with an unknown type is ignored', () => {
  assert.equal(parseWebhook({ event: 'labels.association', instance: 'consultorias', data: { type: 'edit', chatId: 'x@lid', labelId: '4' } })[0].kind, 'ignorado')
  assert.equal(parseWebhook({ event: 'labels.association', instance: 'consultorias', data: { type: 'add', labelId: '4' } })[0].kind, 'ignorado')
})
