// Reset vendedor_projetos and contact_notes tables
// Run from web/ directory: node scripts/reset-db.mjs
import { readFileSync } from 'fs'
import pg from 'pg'

const envContent = readFileSync('.env.local', 'utf8')
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1]
if (!dbUrl) { console.error('No DATABASE_URL found in .env.local'); process.exit(1) }

const pool = new pg.Pool({
  connectionString: dbUrl,
  max: 2,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  // Show current counts
  const vpCount = await pool.query('SELECT COUNT(*) as cnt FROM vendedor_projetos')
  const cnCount = await pool.query('SELECT COUNT(*) as cnt FROM contact_notes').catch(() => ({ rows: [{ cnt: 0 }] }))
  const usersCount = await pool.query('SELECT COUNT(*) as cnt FROM users')

  console.log('Current DB state:')
  console.log(`  vendedor_projetos: ${vpCount.rows[0].cnt} rows`)
  console.log(`  contact_notes: ${cnCount.rows[0].cnt} rows`)
  console.log(`  users: ${usersCount.rows[0].cnt} rows (KEEPING)`)

  // Truncate all dependent tables together using CASCADE
  await pool.query('TRUNCATE TABLE contact_notes, commission_overrides, vendedor_projetos RESTART IDENTITY CASCADE').catch(async (err) => {
    console.log(`  CASCADE truncate failed: ${err.message}, trying individually...`)
    await pool.query('TRUNCATE TABLE contact_notes').catch(() => {})
    await pool.query('TRUNCATE TABLE commission_overrides').catch(() => {})
    await pool.query('TRUNCATE TABLE vendedor_projetos RESTART IDENTITY CASCADE')
  })
  console.log('Truncated contact_notes, commission_overrides, vendedor_projetos')

  // Verify
  const vpAfter = await pool.query('SELECT COUNT(*) as cnt FROM vendedor_projetos')
  console.log(`\nAfter reset: vendedor_projetos has ${vpAfter.rows[0].cnt} rows`)

  await pool.end()
  console.log('DB reset complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
