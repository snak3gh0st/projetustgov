import { readFile } from 'node:fs/promises'
import pg from 'pg'
const connectionString=process.env.DATABASE_URL||process.env.POSTGRES_URL
if(!connectionString)throw new Error('Defina DATABASE_URL/POSTGRES_URL do ambiente a migrar.')
const pool=new pg.Pool({connectionString,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:false}})
try {
  await pool.query(await readFile(new URL('../../migrations/20261112_despesas_reembolsos.sql',import.meta.url),'utf8'))
  console.log('Migração de despesas aplicada. Política e envios permanecem desativados até configuração.')
} finally { await pool.end() }
