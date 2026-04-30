#!/usr/bin/env node
/**
 * Upsert one user (nome, email, password, role).
 *
 * Usage:
 *   cd web && node --env-file=.env.production scripts/create-user.mjs <email> <nome> <role> <senha>
 *
 * Requires DATABASE_URL or POSTGRES_URL in the environment (or via --env-file).
 */
import pg from 'pg'
import bcrypt from 'bcryptjs'

const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL
const [, , email, nome, role, password] = process.argv

if (!conn) {
  console.error('Missing DATABASE_URL or POSTGRES_URL')
  process.exit(1)
}
if (!email || !nome || !role || !password) {
  console.error('Usage: node create-user.mjs <email> <nome> <role> <senha>')
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
} finally {
  await pool.end()
}
