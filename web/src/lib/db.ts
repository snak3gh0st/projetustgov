import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      ssl: { rejectUnauthorized: false },
    })
  }
  return pool
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const maxRetries = 2
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let client
    try {
      client = await getPool().connect()
      const result = await client.query(text, params)
      return result.rows as T[]
    } catch (err) {
      lastError = err
      // Reset pool reference so next getPool() creates a fresh pool.
      // Do NOT call pool.end() — it would invalidate pools held by concurrent long-running
      // operations like syncLeadsFromRepo() which hold the same pool reference.
      if (attempt < maxRetries) {
        pool = null
      }
    } finally {
      if (client) client.release()
    }
  }

  throw lastError
}
