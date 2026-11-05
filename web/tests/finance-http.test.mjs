import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import bcrypt from 'bcryptjs'

// Optional HTTP acceptance against a locally running app backed by an isolated DB.
const base=process.env.FINANCE_TEST_BASE_URL
const database=process.env.FINANCE_TEST_DATABASE_URL
const enabled=!!(base&&database)
let pool,financeCookie,sellerCookie
const fin='00000000-0000-4000-8000-000000000030',seller='00000000-0000-4000-8000-000000000031'
const password='local-http-validation-only'
async function login(email){
  const jar=new Map()
  function merge(r){for(const line of r.headers.getSetCookie()){const pair=line.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1))}}
  const r=await fetch(`${base}/api/auth/csrf`);merge(r)
  const csrf=(await r.json()).csrfToken
  const cookie=()=>Array.from(jar,([k,v])=>`${k}=${v}`).join('; ')
  const result=await fetch(`${base}/api/auth/callback/credentials`,{method:'POST',redirect:'manual',
    headers:{Cookie:cookie(),'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},
    body:new URLSearchParams({email,password,csrfToken:csrf,callbackUrl:`${base}/financeiro`})})
  merge(result)
  assert.ok(Array.from(jar.keys()).some(k=>k.includes('session-token')),'local test login should issue a session')
  return cookie()
}
before(async()=>{
  if(!enabled)return
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'HTTP acceptance is local-only')
  assert.ok(['localhost','127.0.0.1'].includes(new URL(database).hostname),'database is local-only')
  pool=new pg.Pool({connectionString:database})
  const hash=await bcrypt.hash(password,6)
  for(const [id,role,email]of [[fin,'gestor_financeiro','http-finance@example.test'],[seller,'vendedor','http-seller@example.test']]){
    await pool.query(`INSERT INTO users(id,nome,email,role,active,password_hash) VALUES($1,'HTTP validation',$2,$3,true,$4)
      ON CONFLICT(id) DO UPDATE SET active=true,password_hash=EXCLUDED.password_hash`,[id,email,role,hash])
  }
  financeCookie=await login('http-finance@example.test');sellerCookie=await login('http-seller@example.test')
})
after(async()=>{
  if(!pool)return
  const sales=(await pool.query("SELECT id FROM finance_sales WHERE origin='hotmart' AND external_key='HP-HTTP-VALIDATION'")).rows.map(r=>r.id)
  if(sales.length){
    await pool.query('DELETE FROM finance_jobs WHERE entry_id IN (SELECT id FROM finance_entries WHERE sale_id=ANY($1::uuid[]))',[sales])
    await pool.query('DELETE FROM finance_entries WHERE sale_id=ANY($1::uuid[])',[sales])
    await pool.query('DELETE FROM finance_commissions WHERE sale_id=ANY($1::uuid[])',[sales])
    await pool.query('DELETE FROM finance_sales WHERE id=ANY($1::uuid[])',[sales])
  }
  await pool.query("DELETE FROM finance_events WHERE provider='hotmart' AND event_id='http-validation-1'")
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[fin,seller]])
  await pool.end()
})
test('HTTP finance API rejects anonymous and seller requests',{skip:!enabled},async()=>{
  assert.equal((await fetch(`${base}/api/financeiro`)).status,401)
  assert.equal((await fetch(`${base}/api/financeiro`,{headers:{Cookie:sellerCookie}})).status,403)
  assert.equal((await fetch(`${base}/api/financeiro`,{headers:{Cookie:financeCookie}})).status,200)
})
test('HTTP finance mutation rejects a foreign origin and malformed JSON',{skip:!enabled},async()=>{
  assert.equal((await fetch(`${base}/api/financeiro`,{method:'POST',headers:{Cookie:financeCookie,Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403)
  assert.equal((await fetch(`${base}/api/financeiro`,{method:'POST',headers:{Cookie:financeCookie,Origin:base,'Content-Type':'application/json'},body:'{'})).status,400)
})
test('HTTP scheduler and Hotmart webhook require their own secrets',{skip:!enabled},async()=>{
  assert.equal((await fetch(`${base}/api/cron/financeiro?task=report`)).status,401)
  assert.equal((await fetch(`${base}/api/integrations/hotmart/webhook`,{method:'POST',body:'{}'})).status,401)
})
test('HTTP CSV report is private, authenticated and includes consolidated entries',{skip:!enabled},async()=>{
  const r=await fetch(`${base}/api/financeiro/report?format=csv`,{headers:{Cookie:financeCookie}})
  assert.equal(r.status,200)
  assert.match(r.headers.get('content-type'),/text\/csv/)
  assert.match(r.headers.get('cache-control'),/no-store/)
  assert.match(await r.text(),/Baixado/)
})
test('HTTP finance API rejects inactive operators even with an issued session',{skip:!enabled},async()=>{
  await pool.query('UPDATE users SET active=false WHERE id=$1',[fin])
  try{assert.equal((await fetch(`${base}/api/financeiro`,{headers:{Cookie:financeCookie}})).status,401)}
  finally{await pool.query('UPDATE users SET active=true WHERE id=$1',[fin])}
})

test('HTTP authenticated Hotmart webhook deduplicates real ingestion',{skip:!enabled||!process.env.FINANCE_TEST_HOTTOK},async()=>{
  const payload={id:'http-validation-1',event:'PURCHASE_APPROVED',creation_date:Date.now(),data:{product:{id:12,name:'Produto de validação HTTP'},buyer:{name:'Aluno HTTP fictício',document:'12345678901'},purchase:{transaction:'HP-HTTP-VALIDATION',status:'APPROVED',approved_date:Date.now(),price:{value:20.01,currency_value:'BRL'},payment:{installments_number:1}}}}
  const options={method:'POST',headers:{'Content-Type':'application/json','X-HOTMART-HOTTOK':process.env.FINANCE_TEST_HOTTOK},body:JSON.stringify(payload)}
  const first=await fetch(`${base}/api/integrations/hotmart/webhook`,options)
  assert.equal(first.status,200)
  const repeat=await fetch(`${base}/api/integrations/hotmart/webhook`,options)
  assert.equal(repeat.status,200)
  assert.equal((await repeat.json()).duplicate,true)
  const rows=await pool.query("SELECT amount_cents FROM finance_sales WHERE origin='hotmart' AND external_key='HP-HTTP-VALIDATION'")
  assert.equal(rows.rowCount,1)
  assert.equal(Number(rows.rows[0].amount_cents),2001)
})
