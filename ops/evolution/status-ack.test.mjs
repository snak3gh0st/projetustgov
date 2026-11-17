// Exercise the REAL compiled receiver; stub only its lower transport layer.
// No account, credentials, database or connection to WhatsApp is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const moduleFile = '/evolution/node_modules/baileys/lib/Socket/messages-recv.js'
async function receiver(failFirst = false) {
  const sent = [], errors = []
  const ws = Object.assign(new EventEmitter(), { isOpen: true })
  const ev = Object.assign(new EventEmitter(), { buffer() {}, flush() {}, isBuffering: () => false })
  const socket = {
    ws, ev, authState: { creds: { me: { id: '5500000000000@s.whatsapp.net' } } },
    processingMutex: { mutex: (fn) => fn() },
    signalRepository: {},
    sendNode: async (node) => { if (failFirst) { failFirst = false; throw new Error('test transport failure') } sent.push(node) },
    onUnexpectedError: (error) => errors.push(error),
  }
  const source = new vm.SourceTextModule(readFileSync(moduleFile, 'utf8'), { identifier: pathToFileURL(moduleFile).href })
  await source.link(async (specifier) => {
    const exports = specifier === './messages-send.js' ? { makeMessagesSocket: () => socket }
      : await import(specifier.startsWith('.') ? new URL(specifier, source.identifier).href : import.meta.resolve(specifier, source.identifier))
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value) })
  })
  await source.evaluate()
  const noop = () => {}
  source.namespace.makeMessagesRecvSocket({
    logger: { trace: noop, debug: noop, info: noop, warn: noop, error: noop, child() { return this } },
    shouldIgnoreJid: () => false, getMessage: async () => undefined,
    msgRetryCounterCache: { get: noop, set: noop, del: noop }, callOfferCache: { get: noop, set: noop, del: noop },
  })
  return { ws, sent, errors }
}
const stanza = (id, offline) => ({ tag: 'status', attrs: { id, from: 'status@broadcast', type: 'media', ...(offline ? { offline: '1' } : {}) }, content: undefined })
const drain = () => new Promise((resolve) => setTimeout(resolve, 30))

test('online status sends ACK with original id and class', async () => {
  const { ws, sent, errors } = await receiver()
  ws.emit('CB:status', stanza('online'))
  await drain()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].tag, 'ack')
  assert.equal(sent[0].attrs.id, 'online')
  assert.equal(sent[0].attrs.class, 'status')
  assert.equal(sent[0].attrs.type, 'media')
  assert.equal(errors.length, 0)
})
test('offline statuses are acknowledged in order', async () => {
  const { ws, sent, errors } = await receiver()
  ws.emit('CB:status', stanza('one', true))
  ws.emit('CB:status', stanza('two', true))
  await drain()
  assert.deepEqual(sent.map((s) => s.attrs.id), ['one', 'two'])
  assert.equal(errors.length, 0)
})
test('failed status ACK does not strand the offline queue', async () => {
  const { ws, sent, errors } = await receiver(true)
  ws.emit('CB:status', stanza('failed', true))
  ws.emit('CB:status', stanza('next', true))
  await drain()
  assert.equal(errors.length, 1)
  assert.deepEqual(sent.map((s) => s.attrs.id), ['next'])
})
