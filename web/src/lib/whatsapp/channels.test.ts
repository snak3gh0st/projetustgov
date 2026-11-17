import test from 'node:test'
import assert from 'node:assert/strict'
import { freeformAllowed, parseConnectionState, whatsappChannels } from './channels'

const env = { WHATSAPP_EVOLUTION_URL: 'https://evolution.test/', WHATSAPP_EVOLUTION_API_KEY: 'test', WHATSAPP_WEBHOOK_SECRET: 'test' }
test('official channel is opt in and must use a separate instance', () => {
  assert.equal(whatsappChannels(env).length, 1)
  const channels = whatsappChannels({ ...env, WHATSAPP_OFFICIAL_INSTANCE: 'api' })
  assert.deepEqual(channels.map((c) => [c.channel, c.instance, c.integration]), [['qr', 'consultorias', 'WHATSAPP-BAILEYS'], ['oficial', 'api', 'WHATSAPP-BUSINESS']])
  assert.throws(() => whatsappChannels({ ...env, WHATSAPP_OFFICIAL_INSTANCE: 'consultorias' }))
  assert.deepEqual(whatsappChannels({}), [])
})
test('query failures and malformed state do not become a logout', () => {
  assert.equal(parseConnectionState(503, null), 'indisponivel')
  assert.equal(parseConnectionState(200, {}), 'indisponivel')
  assert.equal(parseConnectionState(200, { instance: { state: 'close' } }), 'desconectado')
  assert.equal(parseConnectionState(200, { instance: { state: 'open' } }), 'conectado')
})
test('official free text requires a real inbound in the last 24 hours', () => {
  const now = Date.parse('2026-11-17T12:00:00Z')
  assert.equal(freeformAllowed(null, now), false)
  assert.equal(freeformAllowed('2026-11-16T12:00:00Z', now), false)
  assert.equal(freeformAllowed('2026-11-17T11:59:00Z', now), true)
  assert.equal(freeformAllowed('2026-11-18T12:00:00Z', now), false)
})
