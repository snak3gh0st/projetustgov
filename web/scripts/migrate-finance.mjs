import { readFile } from 'node:fs/promises'
import pg from 'pg'
const connectionString=process.env.DATABASE_URL||process.env.POSTGRES_URL
if(!connectionString)throw new Error('Defina DATABASE_URL/POSTGRES_URL do ambiente a migrar.')
const pool=new pg.Pool({connectionString,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:false}})
try{
  const sql=await readFile(new URL('../../migrations/20261105_financeiro_integrado.sql',import.meta.url),'utf8')
  await pool.query(sql)
  console.log('Migração do financeiro aplicada. Nenhum dado comercial foi modificado.')
}finally{await pool.end()}
