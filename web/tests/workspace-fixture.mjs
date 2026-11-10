import {readFile} from 'node:fs/promises'
import bcrypt from 'bcryptjs'
export const alice='10000000-0000-4000-8000-000000000001',bob='10000000-0000-4000-8000-000000000002',viewer='10000000-0000-4000-8000-000000000003'
export const clientA='12345678000190',clientB='98765432000190',testPassword='local-workspace-acceptance-only'
export function requireLocalTestDb(url){
  const parsed=new URL(url)
  if(!['localhost','127.0.0.1'].includes(parsed.hostname)||!parsed.pathname.endsWith('_test'))throw new Error('Workspace tests require a local database named *_test.')
}
export async function prepareWorkspaceDb(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY,nome text,email text UNIQUE,role text,active boolean,password_hash text,
    last_login_at timestamptz,last_seen_at timestamptz,login_count int,last_login_ip text,last_login_user_agent text,updated_at timestamptz);
    CREATE TABLE IF NOT EXISTS vendedor_projetos(id integer PRIMARY KEY,cnpj text,nome text,email text,tipo_servico text,status_contato text,nr_emenda text,vendedor_id uuid,closer_id uuid);
    CREATE TABLE IF NOT EXISTS lead_contacts(id integer PRIMARY KEY,lead_cnpj text,nome_pessoa text,cargo text,email text,principal boolean);
    CREATE TABLE IF NOT EXISTS projetos_execucao(nr_convenio text PRIMARY KEY,cnpj text,objeto text,situacao text);`)
  const password=await bcrypt.hash(testPassword,6)
  for(const [id,name,role]of [[alice,'Alice','vendedor'],[bob,'Bob','vendedor'],[viewer,'Leitura','visualizador']]){
    await pool.query(`INSERT INTO users(id,nome,email,role,active,password_hash) VALUES($1,$2,$3,$4,true,$5)
      ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,active=true,password_hash=EXCLUDED.password_hash`,[id,name,`${name.toLowerCase()}@workspace.example.test`,role,password])
  }
  await pool.query(`INSERT INTO vendedor_projetos VALUES
    (10001,'12.345.678/0001-90','Cliente Alfa','client@example.test','Aprovação','Em Atendimento','1',$1,$3),
    (10002,$4,'Cliente Alfa','client@example.test','Execução','Em Atendimento','2',$1,NULL),
    (10003,$5,'Cliente Beta','shared@example.test','Aprovação','Em Atendimento','3',$2,NULL)
    ON CONFLICT DO NOTHING`,[alice,bob,viewer,clientA,clientB])
  await pool.query(`INSERT INTO lead_contacts VALUES(10001,$1,'Ana','Presidente','client@example.test',true),
    (10002,$1,'Contador','Contabilidade','shared@example.test',false),(10003,$2,'Contador','Contabilidade','shared@example.test',true)
    ON CONFLICT DO NOTHING`,[clientA,clientB])
  await pool.query(`INSERT INTO projetos_execucao VALUES('900001',$1,'Escola','Em Execução'),('900002',$2,'Hospital','Em Execução') ON CONFLICT DO NOTHING`,[clientA,clientB])
  const migration=await readFile(new URL('../../migrations/20261110_google_workspace.sql',import.meta.url),'utf8')
  await pool.query(migration)
  await pool.query(migration) // Reapplying the additive migration is safe.
}
