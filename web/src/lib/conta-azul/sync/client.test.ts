import assert from 'node:assert/strict'
import test from 'node:test'

import { buildQuery, CaHttpError, createCaClient } from './client'

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error

function harness(replies: Reply[]) {
  let clock = 0
  const sleeps: number[] = []
  const urls: string[] = []
  const tokenCalls: Array<{ forceRefresh?: boolean } | undefined> = []
  const client = createCaClient({
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
    getToken: async (opts) => {
      tokenCalls.push(opts)
      return opts?.forceRefresh ? 'fresh' : 'tok'
    },
    fetch: async (url) => {
      urls.push(url)
      const r = replies.shift() ?? { status: 200, body: {} }
      if (r instanceof Error) throw r
      return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: r.headers })
    },
  })
  return { client, sleeps, urls, tokenCalls }
}

test('buildQuery repeats array params and skips undefined', () => {
  assert.equal(buildQuery({ pagina: 1, status: ['A', 'B'], vazio: undefined, ok: true }), '?pagina=1&status=A&status=B&ok=true')
  assert.equal(buildQuery({}), '')
})

test('returns parsed JSON on success', async () => {
  const h = harness([{ status: 200, body: { itens: [1] } }])
  assert.deepEqual(await h.client.get('/v1/x', { pagina: 1 }), { itens: [1] })
  assert.equal(h.urls[0], 'https://api-v2.contaazul.com/v1/x?pagina=1')
  assert.equal(h.client.calls(), 1)
})

test('429 is retried with exponential backoff', async () => {
  const h = harness([{ status: 429 }, { status: 429 }, { status: 200, body: { ok: 1 } }])
  assert.deepEqual(await h.client.get('/v1/x'), { ok: 1 })
  assert.deepEqual(h.sleeps.filter((s) => s >= 500), [500, 1000])
})

test('Retry-After header wins over the default backoff', async () => {
  const h = harness([{ status: 429, headers: { 'retry-after': '3' } }, { status: 200, body: {} }])
  await h.client.get('/v1/x')
  assert.ok(h.sleeps.includes(3000))
})

test('401 forces one token refresh, then succeeds', async () => {
  const h = harness([{ status: 401 }, { status: 200, body: { ok: true } }])
  assert.deepEqual(await h.client.get('/v1/x'), { ok: true })
  assert.equal(h.tokenCalls.filter((c) => c?.forceRefresh).length, 1)
})

test('a second 401 after refreshing fails', async () => {
  const h = harness([{ status: 401 }, { status: 401 }])
  await assert.rejects(h.client.get('/v1/x'), (e: unknown) => e instanceof CaHttpError && e.status === 401)
})

test('5xx gives up after five attempts', async () => {
  const h = harness(Array.from({ length: 6 }, () => ({ status: 503 })))
  await assert.rejects(h.client.get('/v1/x'), (e: unknown) => e instanceof CaHttpError && e.status === 503)
  assert.equal(h.urls.length, 5)
})

test('network errors are retried', async () => {
  const h = harness([new Error('fetch failed'), { status: 200, body: { ok: 1 } }])
  assert.deepEqual(await h.client.get('/v1/x'), { ok: 1 })
})

test('4xx other than 401/429 fails immediately', async () => {
  const h = harness([{ status: 404, body: { message: 'not found' } }])
  await assert.rejects(h.client.get('/v1/x'), (e: unknown) => e instanceof CaHttpError && e.status === 404 && /not found/.test(e.message))
  assert.equal(h.urls.length, 1)
})

test('throttle spaces consecutive calls by 125ms (8 req/s)', async () => {
  const h = harness([{ status: 200, body: {} }, { status: 200, body: {} }, { status: 200, body: {} }])
  await h.client.get('/a')
  await h.client.get('/b')
  await h.client.get('/c')
  assert.deepEqual(h.sleeps, [125, 125])
})
