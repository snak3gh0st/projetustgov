import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../src/lib/db'
import { connectionState, connectionStateCached, currentQr, ensureInstanceAndQr, sendText, sendTemplate, mediaBase64 } from '../src/lib/whatsapp/evolution'
import { whatsappChannels } from '../src/lib/whatsapp/channels'

const channels = whatsappChannels({ WHATSAPP_EVOLUTION_URL: 'https://evolution.test', WHATSAPP_EVOLUTION_API_KEY: 'test-key', WHATSAPP_WEBHOOK_SECRET: 'test-secret', WHATSAPP_OFFICIAL_INSTANCE: 'official-test' })
const fetchOriginal = global.fetch
const connectOriginal = getPool().connect
const calls: { url: string; method?: string }[] = []
function fakeFetch(reply: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  calls.length = 0
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method })
    return reply(String(input), init)
  }) as typeof fetch
}
const response = (body: unknown, status = 200) => Response.json(body, { status })
function fakeLock(granted = true, recent = false) {
  const statements: string[] = []
  getPool().connect = (async () => ({
    query: async (sql: string) => { statements.push(sql); return { rows: [{ ok: granted, recent }] } },
    release() {},
  })) as typeof connectOriginal
  return statements
}
afterEach(() => { global.fetch = fetchOriginal; getPool().connect = connectOriginal })

test('sends text, template and media lookup to the selected instance', async () => {
  fakeFetch(() => response({ key: { id: 'wamid.test' }, base64: 'YQ==', mimetype: 'image/jpeg' }))
  assert.deepEqual(await sendText('556100000000', 'reply', channels[1]), { waId: 'wamid.test' })
  assert.deepEqual(await sendTemplate('556100000000', 'welcome', 'pt_BR', channels[1]), { waId: 'wamid.test' })
  await mediaBase64('wamid.test', channels[1])
  assert.ok(calls.every((c) => c.url.endsWith('/official-test')))
  assert.ok(calls[0].url.includes('/sendText/'))
})
test('an API failure is unavailable and cannot start a new connection', async () => {
  const statements = fakeLock()
  fakeFetch(() => response({}, 503))
  assert.equal(await connectionState(5000, channels[0]), 'indisponivel')
  await assert.rejects(ensureInstanceAndQr('https://app.test/webhook', channels[0]))
  assert.ok(calls.every((c) => c.method === 'GET'))
  assert.ok(statements.includes('COMMIT'))
})
test('connecting is observed without reconfiguring webhook or creating another socket', async () => {
  fakeLock()
  fakeFetch(() => response({ instance: { state: 'connecting' } }))
  const result = await ensureInstanceAndQr('https://app.test/webhook', channels[0])
  assert.equal(result.estado, 'conectando')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.includes('/connectionState/'))
})
test('another process holding the pairing lock prevents all provider mutations', async () => {
  fakeLock(false)
  fakeFetch(() => { throw new Error('must not reach provider') })
  assert.equal((await ensureInstanceAndQr('https://app.test/webhook', channels[0])).estado, 'conectando')
  assert.equal(calls.length, 0)
})
test('official API cannot accidentally be converted into a QR instance', async () => {
  await assert.rejects(ensureInstanceAndQr('https://app.test/webhook', channels[1]), /não usa QR/)
})
test('state polling coalesces concurrent requests per channel', async () => {
  const cfg = { ...channels[0], instance: 'cache-test' }
  fakeFetch(async () => { await new Promise((r) => setTimeout(r, 10)); return response({ instance: { state: 'open' } }) })
  assert.deepEqual(await Promise.all([connectionStateCached(cfg), connectionStateCached(cfg)]), ['conectado', 'conectado'])
  assert.equal(calls.length, 1)
})


test('persistent cooldown stops a second request before the provider updates its state', async () => {
  fakeLock(true, true)
  fakeFetch(() => { throw new Error('must not call provider') })
  assert.equal((await ensureInstanceAndQr('https://app.test/webhook', channels[0])).estado, 'conectando')
  assert.equal(calls.length, 0)
})
