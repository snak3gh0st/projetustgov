/**
 * Minimal Conta Azul API v2 client for the pull sync.
 * - throttles to 8 req/s (the API allows 10 req/s and 600 req/min per account)
 * - retries 429, 5xx and network errors with exponential backoff (5 attempts)
 * - on 401 forces a single token refresh and retries once
 * Dependencies are injected so the retry policy is unit-testable.
 */

export const CA_API_BASE = 'https://api-v2.contaazul.com'

export type CaQuery = Record<string, string | number | boolean | string[] | undefined | null>

export type CaClientDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  getToken: (opts?: { forceRefresh?: boolean }) => Promise<string>
  sleep: (ms: number) => Promise<void>
  now: () => number
  baseUrl?: string
  ratePerSec?: number
  maxAttempts?: number
}

export class CaHttpError extends Error {
  constructor(public status: number, public path: string, detail: string) {
    super(`Conta Azul ${status} on ${path}${detail ? `: ${detail}` : ''}`)
    this.name = 'CaHttpError'
  }
}

export function buildQuery(query: CaQuery = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else params.append(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** (attempt - 1))
}

export type CaClient = {
  get<T = unknown>(path: string, query?: CaQuery): Promise<T>
  calls(): number
}

export function createCaClient(deps: CaClientDeps): CaClient {
  const base = deps.baseUrl ?? CA_API_BASE
  const interval = 1000 / (deps.ratePerSec ?? 8)
  const maxAttempts = deps.maxAttempts ?? 5
  let calls = 0
  let nextSlot = Number.NEGATIVE_INFINITY

  async function throttle() {
    const t = deps.now()
    const slot = Math.max(t, nextSlot)
    nextSlot = slot + interval
    if (slot > t) await deps.sleep(slot - t)
  }

  async function get<T>(path: string, query?: CaQuery): Promise<T> {
    const url = `${base}${path}${buildQuery(query)}`
    let refreshed = false
    let attempt = 0
    for (;;) {
      attempt += 1
      await throttle()
      const token = await deps.getToken()
      calls += 1

      let res: Response
      try {
        res = await deps.fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          cache: 'no-store',
        })
      } catch (err) {
        if (attempt >= maxAttempts) throw err
        await deps.sleep(backoffMs(attempt))
        continue
      }

      if (res.status === 401) {
        if (refreshed) throw new CaHttpError(401, path, 'unauthorized after token refresh')
        refreshed = true
        await deps.getToken({ forceRefresh: true })
        continue
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxAttempts) throw new CaHttpError(res.status, path, (await res.text()).slice(0, 300))
        const retryAfter = Number(res.headers.get('retry-after'))
        await deps.sleep(retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt))
        continue
      }

      const text = await res.text()
      if (!res.ok) throw new CaHttpError(res.status, path, text.slice(0, 300))
      return (text ? JSON.parse(text) : null) as T
    }
  }

  return { get, calls: () => calls }
}
