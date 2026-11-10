import { readFile } from 'node:fs/promises'
import pg from 'pg'
const connectionString=process.env.DATABASE_URL||process.env.POSTGRES_URL
if(!connectionString)throw new Error('Defina DATABASE_URL/POSTGRES_URL do ambiente a migrar.')
const pool=new pg.Pool({connectionString,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:false}})
try{
  await pool.query(await readFile(new URL('../../migrations/20261110_google_workspace.sql',import.meta.url),'utf8'))
  console.log('Estrutura do Google Workspace preparada. Nenhum cliente, arquivo ou mensagem foi alterado.')
}finally{await pool.end()}
