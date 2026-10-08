import type { ContaAzulTokenResponse } from './oauth'

/**
 * Conta Azul refresh tokens rotate and are single-use: two processes refreshing
 * the same token at once leave the connection dead (invalid_grant). Every refresh
 * therefore runs while holding the connection row lock (SELECT ... FOR UPDATE),
 * and re-reads the row after acquiring it so a caller that waited reuses the
 * token another caller just obtained.
 */

export type TokenRow = {
  id: string
  status: string
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | Date | null
}

export type SavedTokens = {
  accessEnc: string
  refreshEnc: string | null
  expiresAt: Date
}

export type LockedTx = {
  save(tokens: SavedTokens): Promise<void>
  markExpired(): Promise<void>
}

export type RefreshDeps = {
  readRow(): Promise<TokenRow | null>
  /** Runs fn inside a transaction holding the row lock; commits when fn resolves. */
  withLockedRow<T>(fn: (row: TokenRow | null, tx: LockedTx) => Promise<T>): Promise<T>
  decrypt(payload: string): string
  encrypt(plain: string): string
  refresh(refreshToken: string): Promise<ContaAzulTokenResponse>
  now(): number
}

export class ContaAzulNotConnectedError extends Error {
  constructor() {
    super('Conta Azul is not connected')
    this.name = 'ContaAzulNotConnectedError'
  }
}

export class ContaAzulReconnectRequiredError extends Error {
  constructor(detail: string) {
    super(`Conta Azul token expired; reconnect required (${detail})`)
    this.name = 'ContaAzulReconnectRequiredError'
  }
}

const DEFAULT_SKEW_MS = 60_000

function expiresAtMs(row: TokenRow): number {
  return row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
}

function assertActive(row: TokenRow | null): asserts row is TokenRow & { access_token_encrypted: string } {
  if (!row?.access_token_encrypted || row.status !== 'active') {
    throw new ContaAzulNotConnectedError()
  }
}

function isRevokedGrant(err: unknown): boolean {
  return /invalid_grant|invalid_refresh_token/i.test(err instanceof Error ? err.message : String(err))
}

type LockedOutcome =
  | { kind: 'token'; token: string }
  | { kind: 'reconnect'; detail: string }

export async function refreshUnderLock(
  deps: RefreshDeps,
  opts: { forceRefresh?: boolean; skewMs?: number } = {}
): Promise<string> {
  const skew = opts.skewMs ?? DEFAULT_SKEW_MS
  const row = await deps.readRow()
  assertActive(row)

  if (!opts.forceRefresh && expiresAtMs(row) - deps.now() > skew) {
    return deps.decrypt(row.access_token_encrypted)
  }

  const seenAccess = row.access_token_encrypted

  // Expected failures are returned (not thrown) so the transaction commits the
  // status change before we raise.
  const outcome = await deps.withLockedRow<LockedOutcome>(async (locked, tx) => {
    assertActive(locked)
    const stillFresh = expiresAtMs(locked) - deps.now() > skew
    const rotatedMeanwhile = locked.access_token_encrypted !== seenAccess
    if (stillFresh && (rotatedMeanwhile || !opts.forceRefresh)) {
      return { kind: 'token', token: deps.decrypt(locked.access_token_encrypted) }
    }

    if (!locked.refresh_token_encrypted) {
      await tx.markExpired()
      return { kind: 'reconnect', detail: 'no refresh token' }
    }

    let tokens: ContaAzulTokenResponse
    try {
      tokens = await deps.refresh(deps.decrypt(locked.refresh_token_encrypted))
    } catch (err) {
      if (isRevokedGrant(err)) {
        await tx.markExpired()
        return { kind: 'reconnect', detail: 'refresh token rejected' }
      }
      throw err
    }

    await tx.save({
      accessEnc: deps.encrypt(tokens.access_token),
      refreshEnc: tokens.refresh_token ? deps.encrypt(tokens.refresh_token) : locked.refresh_token_encrypted,
      expiresAt: new Date(deps.now() + (tokens.expires_in ?? 3600) * 1000),
    })
    return { kind: 'token', token: tokens.access_token }
  })

  if (outcome.kind === 'reconnect') throw new ContaAzulReconnectRequiredError(outcome.detail)
  return outcome.token
}
