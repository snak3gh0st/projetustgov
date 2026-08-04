import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { getContaAzulConfig } from './config'

type StatePayload = {
  u: string // userId
  n: string // nonce
  t: number // issued at ms
}

function signingKey() {
  const { encryptionKey, clientSecret } = getContaAzulConfig()
  return `${encryptionKey}:${clientSecret}`
}

export function createOAuthState(userId: string): string {
  const payload: StatePayload = {
    u: userId,
    n: createHmac('sha256', signingKey()).update(`${userId}:${Date.now()}`).digest('hex').slice(0, 16),
    t: Date.now(),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', signingKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyOAuthState(state: string, maxAgeMs = 15 * 60 * 1000): StatePayload {
  const [body, sig] = state.split('.')
  if (!body || !sig) throw new Error('Invalid OAuth state')

  const expected = createHmac('sha256', signingKey()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid OAuth state signature')
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload
  if (!payload?.u || !payload?.t) throw new Error('Invalid OAuth state payload')
  if (Date.now() - payload.t > maxAgeMs) throw new Error('OAuth state expired')
  return payload
}
