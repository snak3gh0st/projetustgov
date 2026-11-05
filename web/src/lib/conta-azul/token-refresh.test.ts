import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ContaAzulNotConnectedError,
  ContaAzulReconnectRequiredError,
  refreshUnderLock,
  type RefreshDeps,
  type TokenRow,
} from './token-refresh'

const NOW = Date.parse('2026-10-08T12:00:00Z')

type Fake = {
  deps: RefreshDeps
  row: TokenRow
  refreshCalls: string[]
}

function makeFake(row: Partial<TokenRow>, refresh?: (rt: string) => Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>): Fake {
  const state: Fake = {
    row: {
      id: 'conn-1',
      status: 'active',
      access_token_encrypted: 'enc:access-1',
      refresh_token_encrypted: 'enc:refresh-1',
      token_expires_at: new Date(NOW + 30 * 60_000).toISOString(),
      ...row,
    },
    refreshCalls: [],
    deps: undefined as unknown as RefreshDeps,
  }
  // In-memory row lock that serialises callers like SELECT ... FOR UPDATE would.
  let chain: Promise<unknown> = Promise.resolve()
  let counter = 1
  state.deps = {
    now: () => NOW,
    decrypt: (s) => s.replace(/^enc:/, ''),
    encrypt: (s) => `enc:${s}`,
    readRow: async () => ({ ...state.row }),
    refresh:
      refresh ??
      (async (rt) => {
        state.refreshCalls.push(rt)
        await new Promise((r) => setTimeout(r, 5))
        counter += 1
        return { access_token: `access-${counter}`, refresh_token: `refresh-${counter}`, expires_in: 3600 }
      }),
    withLockedRow: (fn) => {
      const run = chain.then(() =>
        fn({ ...state.row }, {
          save: async (t) => {
            state.row.access_token_encrypted = t.accessEnc
            state.row.refresh_token_encrypted = t.refreshEnc
            state.row.token_expires_at = t.expiresAt.toISOString()
            state.row.status = 'active'
          },
          markExpired: async () => {
            state.row.status = 'expired'
          },
        })
      )
      chain = run.catch(() => undefined)
      return run
    },
  }
  return state
}

test('valid token is returned without refreshing', async () => {
  const f = makeFake({})
  assert.equal(await refreshUnderLock(f.deps), 'access-1')
  assert.equal(f.refreshCalls.length, 0)
})

test('expired token is refreshed and the rotated pair is saved', async () => {
  const f = makeFake({ token_expires_at: new Date(NOW - 1000).toISOString() })
  assert.equal(await refreshUnderLock(f.deps), 'access-2')
  assert.deepEqual(f.refreshCalls, ['refresh-1'])
  assert.equal(f.row.refresh_token_encrypted, 'enc:refresh-2')
  assert.equal(f.row.token_expires_at, new Date(NOW + 3600_000).toISOString())
})

test('token inside the 60s skew window is refreshed', async () => {
  const f = makeFake({ token_expires_at: new Date(NOW + 30_000).toISOString() })
  await refreshUnderLock(f.deps)
  assert.equal(f.refreshCalls.length, 1)
})

test('concurrent callers with an expired token trigger a single refresh', async () => {
  const f = makeFake({ token_expires_at: new Date(NOW - 1000).toISOString() })
  const results = await Promise.all([refreshUnderLock(f.deps), refreshUnderLock(f.deps), refreshUnderLock(f.deps)])
  assert.equal(f.refreshCalls.length, 1)
  assert.deepEqual(results, ['access-2', 'access-2', 'access-2'])
})

test('concurrent forced refreshes after a 401 also refresh once', async () => {
  const f = makeFake({})
  const results = await Promise.all([
    refreshUnderLock(f.deps, { forceRefresh: true }),
    refreshUnderLock(f.deps, { forceRefresh: true }),
  ])
  assert.equal(f.refreshCalls.length, 1)
  assert.deepEqual(results, ['access-2', 'access-2'])
})

test('forceRefresh renews a token that still looks valid', async () => {
  const f = makeFake({})
  assert.equal(await refreshUnderLock(f.deps, { forceRefresh: true }), 'access-2')
})

test('missing refresh token marks the connection expired', async () => {
  const f = makeFake({ token_expires_at: new Date(NOW - 1000).toISOString(), refresh_token_encrypted: null })
  await assert.rejects(refreshUnderLock(f.deps), ContaAzulReconnectRequiredError)
  assert.equal(f.row.status, 'expired')
})

test('invalid_grant from Conta Azul marks the connection expired', async () => {
  const f = makeFake({ token_expires_at: new Date(NOW - 1000).toISOString() }, async () => {
    throw new Error('Conta Azul token exchange failed: invalid_grant')
  })
  await assert.rejects(refreshUnderLock(f.deps), ContaAzulReconnectRequiredError)
  assert.equal(f.row.status, 'expired')
})

test('transient refresh failures do not expire the connection', async () => {
  const f = makeFake({ token_expires_at: new Date(NOW - 1000).toISOString() }, async () => {
    throw new Error('fetch failed')
  })
  await assert.rejects(refreshUnderLock(f.deps), /fetch failed/)
  assert.equal(f.row.status, 'active')
})

test('disconnected row raises not-connected', async () => {
  const f = makeFake({ status: 'revoked', access_token_encrypted: null })
  await assert.rejects(refreshUnderLock(f.deps), ContaAzulNotConnectedError)
})
