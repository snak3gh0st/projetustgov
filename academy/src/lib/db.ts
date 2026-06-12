import { Pool } from 'pg'
import { getEnv } from '@/lib/env'

let pool: Pool | null = null

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      ssl: { rejectUnauthorized: false },
    })
  }

  return pool
}

export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
  const client = await getPool().connect()

  try {
    const result = await client.query(text, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function withTransaction<T>(fn: (client: PoolClientLike) => Promise<T>) {
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type PoolClientLike = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>
}
