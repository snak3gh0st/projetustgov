import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
export const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`
export const actor=n=>({userId:uid(n),role:n===8?'admin':n===5?'gestor_financeiro':'vendedor'})
export const password='expenses-local-acceptance-only'
export const tenant='test-expenses'
export const config={enabled:true,exportsEnabled:false,reference:'Política fictícia para testes isolados',areas:[{id:'comercial',name:'Comercial',headId:uid(2),alternateHeadId:uid(7),costCenterId:uid(92)}],adminIds:[uid(3)],financeIds:[uid(5)],authorities:[{userId:uid(4),title:'COO',limitCents:100000},{userId:uid(6),title:'CEO',limitCents:1000000}],categories:[{id:'viagem',name:'Viagens',requiresAuthorization:true,exemptionLimitCents:0,categoryId:uid(91),authorizationDocs:['quote']},{id:'pequenas',name:'Pequenas despesas',requiresAuthorization:false,exemptionLimitCents:20000,categoryId:uid(91),authorizationDocs:[]}],holidays:['2026-11-16'],calendarYears:[2026,2027]}
export const data={title:'Visita técnica ao cliente',purpose:'Reunião de acompanhamento do projeto',justification:'Deslocamento para atendimento presencial',areaId:'comercial',categoryId:'viagem',amountCents:10000,periodStart:'2026-11-12',periodEnd:'2026-11-12',projectReference:'Projeto fictício Alfa',exemptionReason:'',supplierId:null,paymentDueDate:null}
export const now=new Date('2026-11-12T16:00:00Z')
export function localOnly(url){const parsed=new URL(url);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||!parsed.pathname.includes('expenses_test'))throw new Error('Despesas exige PostgreSQL local isolado com expenses_test no nome.')}
export async function prepare(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY,nome text,email text UNIQUE,role text,active boolean,password_hash text,last_login_at timestamptz,last_seen_at timestamptz,login_count int,last_login_ip text,last_login_user_agent text,updated_at timestamptz)`)
  for(const file of ['20261105_financeiro_integrado.sql','20261112_despesas_reembolsos.sql','20261112_despesas_reembolsos.sql'])await pool.query(await readFile(new URL(`../../migrations/${file}`,import.meta.url),'utf8'))
  const hash=await bcrypt.hash(password,6)
  const names=['Solicitante','Head Comercial','Administrativo','Diretor Operacional','Financeiro','Presidência','Head Substituto','Administrador']
  for(let n=1;n<=8;n++)await pool.query(`INSERT INTO users(id,nome,email,role,active,password_hash) VALUES($1,$2,$3,$4,true,$5) ON CONFLICT(id) DO UPDATE SET active=true,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role`,[uid(n),names[n-1],`pessoa${n}@expenses.example.test`,actor(n).role,hash])
}
export async function reset(pool,store){
  for(const table of ['expense_notifications','expense_history'])await pool.query(`DELETE FROM ${table} WHERE tenant_key=$1`,[tenant])
  await pool.query('DELETE FROM expense_documents WHERE request_id IN (SELECT id FROM expense_requests WHERE tenant_key=$1)',[tenant])
  await pool.query('DELETE FROM expense_requests WHERE tenant_key=$1 AND authorization_id IS NOT NULL',[tenant]);await pool.query('DELETE FROM expense_requests WHERE tenant_key=$1',[tenant])
  for(const table of ['finance_jobs','finance_entries','finance_runs','finance_audit','finance_people','finance_settings','expense_policies'])await pool.query(`DELETE FROM ${table} WHERE tenant_key=$1`,[tenant])
  await store.savePolicy(config,0,actor(8))
  await store.saveSettings({...await store.settings(),companyConfirmed:true,financialAccountId:uid(90),receivableCategoryId:uid(91),payableCategoryId:uid(93)},uid(8))
  await pool.query('INSERT INTO finance_people(tenant_key,user_id,remote_person_id) VALUES($1,$2,$3)',[tenant,uid(1),uid(89)])
}
