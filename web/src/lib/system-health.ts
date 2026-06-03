import { query } from './db'

export type HealthStatus = 'ok' | 'warning' | 'error'

export interface CriticalAccountStatus {
  label: string
  email: string
  expectedRole: string | null
  found: boolean
  active: boolean | null
  role: string | null
  nome: string | null
  status: HealthStatus
}

export interface SystemHealthSnapshot {
  status: HealthStatus
  checked_at: string
  database: {
    status: HealthStatus
    host: string
    name: string | null
    latency_ms: number | null
    error?: string
  }
  auth: {
    status: HealthStatus
    auth_secret: boolean
    nextauth_secret: boolean
    auth_url: boolean
    nextauth_url: boolean
    trust_host: boolean
  }
  users: {
    status: HealthStatus
    total: number
    active: number
    inactive: number
    active_admins: number
    active_gestores: number
    by_role: Array<{ role: string; active: boolean; count: number }>
    critical_accounts: CriticalAccountStatus[]
  }
  notes: string[]
}

const CRITICAL_ACCOUNTS: Array<{ label: string; email: string; expectedRole?: string }> = [
  { label: 'Admin', email: 'admin@projetus.org', expectedRole: 'admin' },
  { label: 'Rooger', email: 'rooger@projetus.org' },
  { label: 'Philipe', email: 'philipe@projetus.org' },
  { label: 'Tito', email: 'tito@projetus.org' },
  { label: 'Paulo', email: 'paulo@projetus.org' },
  { label: 'Bruno', email: 'bruno@projetus.org' },
] as const

function present(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function computeWorstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('warning')) return 'warning'
  return 'ok'
}

function dbHostFromUrl(dbUrl: string): string {
  if (!dbUrl) return 'NOT SET'
  return dbUrl.replace(/^.*@/, '').replace(/\/.*$/, '').replace(/:.*$/, '')
}

export async function collectSystemHealth(): Promise<SystemHealthSnapshot> {
  const checkedAt = new Date().toISOString()
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
  const dbHost = dbHostFromUrl(dbUrl)

  const authSecret = present(process.env.AUTH_SECRET)
  const nextauthSecret = present(process.env.NEXTAUTH_SECRET)
  const authUrl = present(process.env.AUTH_URL)
  const nextauthUrl = present(process.env.NEXTAUTH_URL)
  const trustHost = String(process.env.AUTH_TRUST_HOST ?? '').toLowerCase() === 'true'

  const notes: string[] = []
  const authFlags = [authSecret, nextauthSecret, authUrl, nextauthUrl]
  const authStatus: HealthStatus = authFlags.every(Boolean)
    ? 'ok'
    : authFlags.some(Boolean)
      ? 'warning'
      : 'error'

  if (!authSecret) notes.push('AUTH_SECRET ausente no ambiente.')
  if (!nextauthSecret) notes.push('NEXTAUTH_SECRET ausente no ambiente.')
  if (!authUrl) notes.push('AUTH_URL ausente no ambiente.')
  if (!nextauthUrl) notes.push('NEXTAUTH_URL ausente no ambiente.')

  let databaseStatus: SystemHealthSnapshot['database'] = {
    status: 'error',
    host: dbHost,
    name: null,
    latency_ms: null,
    error: 'Database not checked',
  }

  let userTotals = {
    total: 0,
    active: 0,
    inactive: 0,
    active_admins: 0,
    active_gestores: 0,
  }
  let byRole: Array<{ role: string; active: boolean; count: number }> = []
  let criticalAccounts: CriticalAccountStatus[] = CRITICAL_ACCOUNTS.map(account => ({
    ...account,
    expectedRole: account.expectedRole ?? null,
    found: false,
    active: null,
    role: null,
    nome: null,
    status: 'error',
  }))

  try {
    const startedAt = Date.now()
    const dbRows = await query<{ ok: number; db: string; ts: string }>(
      'SELECT 1 as ok, current_database() as db, now() as ts'
    )
    const latencyMs = Date.now() - startedAt
    databaseStatus = {
      status: 'ok',
      host: dbHost,
      name: dbRows[0]?.db ?? null,
      latency_ms: latencyMs,
    }

    const totalsRows = await query<{
      total: number
      active: number
      inactive: number
      active_admins: number
      active_gestores: number
    }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE active = true)::int AS active,
        COUNT(*) FILTER (WHERE active = false)::int AS inactive,
        COUNT(*) FILTER (WHERE role = 'admin' AND active = true)::int AS active_admins,
        COUNT(*) FILTER (WHERE role = 'gestor' AND active = true)::int AS active_gestores
      FROM users
    `)
    userTotals = totalsRows[0] ?? userTotals

    byRole = await query<{ role: string; active: boolean; count: number }>(`
      SELECT role, active, COUNT(*)::int AS count
      FROM users
      GROUP BY role, active
      ORDER BY role, active DESC
    `)

    const criticalRows = await query<{
      nome: string
      email: string
      role: string
      active: boolean
    }>(
      `SELECT nome, email, role, active
       FROM users
       WHERE lower(email) = ANY($1::text[])`,
      [CRITICAL_ACCOUNTS.map(a => a.email.toLowerCase())]
    )
    const criticalByEmail = new Map(
      criticalRows.map(row => [row.email.toLowerCase(), row])
    )

    criticalAccounts = CRITICAL_ACCOUNTS.map(account => {
      const row = criticalByEmail.get(account.email.toLowerCase())
      if (!row) {
        return {
          ...account,
          expectedRole: account.expectedRole ?? null,
          found: false,
          active: null,
          role: null,
          nome: null,
          status: 'error',
        }
      }

      const roleMatches = !account.expectedRole || row.role === account.expectedRole
      const status: HealthStatus = row.active ? (roleMatches ? 'ok' : 'error') : 'warning'
      return {
        ...account,
        expectedRole: account.expectedRole ?? null,
        found: true,
        active: row.active,
        role: row.role,
        nome: row.nome,
        status,
      }
    })
  } catch (error) {
    databaseStatus = {
      status: 'error',
      host: dbHost,
      name: null,
      latency_ms: null,
      error: String(error),
    }
  }

  const criticalStatuses = criticalAccounts.map(account => account.status)
  const overallStatus = computeWorstStatus([
    databaseStatus.status,
    authStatus,
    userTotals.active_admins > 0 ? 'ok' : 'error',
    ...criticalStatuses,
  ])

  if (databaseStatus.status === 'ok' && databaseStatus.latency_ms != null && databaseStatus.latency_ms > 500) {
    notes.push(`Latência do banco acima de 500ms (${databaseStatus.latency_ms}ms).`)
  }
  if (userTotals.active_admins === 0) {
    notes.push('Nenhum usuário admin ativo encontrado.')
  }
  if (userTotals.inactive > 0) {
    notes.push(`${userTotals.inactive} usuário(s) inativo(s) no cadastro.`)
  }
  for (const account of criticalAccounts) {
    if (!account.found) {
      notes.push(`Conta crítica ausente: ${account.email}.`)
    } else if (account.expectedRole && account.role !== account.expectedRole) {
      notes.push(`Conta crítica com role incorreto: ${account.email} (esperado ${account.expectedRole}, atual ${account.role || 'sem role'}).`)
    } else if (!account.active) {
      notes.push(`Conta crítica inativa: ${account.email}.`)
    }
  }

  return {
    status: overallStatus,
    checked_at: checkedAt,
    database: databaseStatus,
    auth: {
      status: authStatus,
      auth_secret: authSecret,
      nextauth_secret: nextauthSecret,
      auth_url: authUrl,
      nextauth_url: nextauthUrl,
      trust_host: trustHost,
    },
    users: {
      status: userTotals.active_admins > 0 ? (criticalStatuses.includes('error') ? 'error' : criticalStatuses.includes('warning') ? 'warning' : 'ok') : 'error',
      total: userTotals.total,
      active: userTotals.active,
      inactive: userTotals.inactive,
      active_admins: userTotals.active_admins,
      active_gestores: userTotals.active_gestores,
      by_role: byRole,
      critical_accounts: criticalAccounts,
    },
    notes,
  }
}
