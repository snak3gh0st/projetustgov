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

// Erro de SQL (ex.: 23505) deixa a conexão utilizável. Erro de conexão
// (SQLSTATE 08*, término 57P*, ou ECONNRESET/socket fechado) a descarta do pool.
function isConnectionError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) return true
  return code.startsWith('08') || code.startsWith('57P')
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const maxRetries = 2
  let lastError: unknown

  // Só repete quando não conseguiu conexão: aí nada foi executado, então
  // repetir um INSERT é seguro. Não recria o pool (cada recriação deixava
  // conexões órfãs no pgbouncer até esgotar o max_client_conn).
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let client
    try {
      client = await getPool().connect()
    } catch (err) {
      lastError = err
      continue
    }
    try {
      const result = await client.query(text, params)
      client.release()
      return result.rows as T[]
    } catch (err) {
      client.release(isConnectionError(err) ? (err as Error) : undefined)
      throw err
    }
  }

  throw lastError
}

// Quem está alterando, lido pelo trigger de histórico (lead_events) via
// app.user_id / app.origem. Origens: 'manual', 'distribuicao', 'sincronizacao'.
export interface DbActor {
  userId?: string | null
  origem: string
}

// Roda um único statement numa transação com o ator definido, para que o
// trigger de histórico saiba quem fez a mudança. Sem retry: escrita.
export async function queryAs<T = Record<string, unknown>>(
  actor: DbActor,
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.origem', $2, true)`,
      [actor.userId ?? '', actor.origem]
    )
    const result = await client.query(text, params)
    await client.query('COMMIT')
    return result.rows as T[]
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
