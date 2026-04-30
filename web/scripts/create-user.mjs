#!/usr/bin/env node
/**
 * Upsert one user (nome, email, password, role).
 *
 * Produção CRM (sigmadb): não use `--env-file=.env.production` do Vercel — esse ficheiro
 * costuma trazer SUPABASE_POOLER_URL, não o Postgres em sigmadb.
 *
 *   cp .env.sigmadb.example .env.sigmadb.local   # editar DATABASE_SIGMADB_URL
 *   cd web && node --env-file=.env.sigmadb.local scripts/create-user.mjs <email> <nome> <role> <senha>
 *
 * Ordem das variáveis de conexão (primeira definida ganha):
 *   DATABASE_SIGMADB_URL, DATABASE_URL, POSTGRES_URL
 */
import pg from 'pg'
import bcrypt from 'bcryptjs'

function connectionHostHint(conn) {
  if (!conn || typeof conn !== 'string') return '(sem URL)'
  const abs = conn.replace(/^[a-z]+:\/\//, '') // postgres(ql)?:// ou uri://
  const atHost = abs.match(/@([^:/?]+)(?::(\d+))?/)
  return atHost ? atHost[1] : '(host não encontrado no URL)'
}

const conn =
  process.env.DATABASE_SIGMADB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL

const [, , email, nome, role, password] = process.argv

if (!conn) {
  console.error([
    'Nenhuma variável de conexão encontrada.',
    'Defina DATABASE_SIGMADB_URL no .env.sigmadb.local (recomendado para sigmadb)',
    'ou DATABASE_URL / POSTGRES_URL apontando para o Postgres correto.',
  ].join('\n'))
  process.exit(1)
}
if (!email || !nome || !role || !password) {
  console.error('Uso: node create-user.mjs <email> <nome> <role> <senha>')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: conn,
  max: 1,
  ssl: { rejectUnauthorized: false },
})

const hash = await bcrypt.hash(password, 10)

try {
  const found = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()])
  if (found.rows.length > 0) {
    await pool.query(
      'UPDATE users SET nome = $1, password_hash = $2, role = $3, active = true WHERE email = $4',
      [nome.trim(), hash, role.trim(), email.toLowerCase().trim()]
    )
    console.log('Updated user:', email)
  } else {
    await pool.query(
      'INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [nome.trim(), email.toLowerCase().trim(), hash, role.trim()]
    )
    console.log('Created user:', email, 'role:', role)
  }
} catch (err) {
  const code = /** @type {any} */ (err).code
  const msg = /** @type {any} */ (err).message || String(err)
  const host = connectionHostHint(conn)
  console.error('Falha na conexão ou na query PostgreSQL.')
  console.error('  Host efetivo (do URL):', host)
  console.error('  Código:', code || '(n/a)')
  console.error('  Mensagem:', msg)

  const usesSupabasePooler =
    typeof conn === 'string' &&
    /\.pooler\.supabase\.com/i.test(conn) &&
    !process.env.DATABASE_SIGMADB_URL
  if (usesSupabasePooler && !process.env.DATABASE_SIGMADB_URL) {
    console.error('')
    console.error('Parece URL Supabase/pooler (típico do .env.production do Vercel).')
    console.error('Se o CRM de produção está em sigmadb, configure DATABASE_SIGMADB_URL.')
    console.error('Ver: web/.env.sigmadb.example')
  }

  if (msg.includes('ENOTFOUND') || code === 'ENOTFOUND') {
    console.error('')
    console.error('ENOTFOUND = o hostname do URL não existe no DNS ou o projeto foi removido/suspenso.')
    console.error('Confirme a connection string junto ao servidor sigmadb ou use túnel SSH + 127.0.0.1.')
  }

  process.exitCode = 1
} finally {
  await pool.end()
}
