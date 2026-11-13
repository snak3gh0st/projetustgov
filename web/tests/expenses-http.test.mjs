import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {ExpenseStore} from '../src/lib/expenses/store.ts'
import {actor,data,uid,password,tenant,prepare,reset,localOnly} from './expenses-fixture.mjs'
const base=process.env.EXPENSE_TEST_BASE_URL,database=process.env.EXPENSE_TEST_DATABASE_URL,enabled=!!(base&&database)
let pool,store,cookies={}
async function login(n){
  const jar=new Map(),merge=r=>{for(const line of r.headers.getSetCookie()){const pair=line.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1))}},cookie=()=>Array.from(jar,([k,v])=>`${k}=${v}`).join('; ')
  const csrf=await fetch(`${base}/api/auth/csrf`);merge(csrf)
  const response=await fetch(`${base}/api/auth/callback/credentials`,{method:'POST',redirect:'manual',headers:{Cookie:cookie(),'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email:`pessoa${n}@expenses.example.test`,password,csrfToken:(await csrf.json()).csrfToken,callbackUrl:`${base}/despesas`})})
  merge(response);assert.ok(Array.from(jar.keys()).some(k=>k.includes('session-token')));return cookie()
}
async function post(path,body,n=1,status=200,origin=base){
  const r=await fetch(`${base}${path}`,{method:'POST',headers:{Cookie:cookies[n],Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await r.json()
  assert.equal(r.status,status,JSON.stringify(result));assert.match(r.headers.get('cache-control'),/no-store/);return result
}
before(async()=>{
  if(!enabled)return;localOnly(database);assert.equal(new URL(base).hostname,'localhost')
  pool=new pg.Pool({connectionString:database});await prepare(pool);store=new ExpenseStore(pool,tenant);await reset(pool,store)
  for(const n of [1,2,3,5,8])cookies[n]=await login(n)
})
after(async()=>{await pool?.end()})
const http=(name,fn)=>test(name,{skip:!enabled},fn)
http('expense routes require active authentication and are shared across employee areas',async()=>{
  assert.equal((await fetch(`${base}/api/despesas`)).status,401)
  for(const n of [1,3,5,8]){
    const r=await fetch(`${base}/despesas`,{headers:{Cookie:cookies[n]},redirect:'manual'});assert.equal(r.status,200)
    assert.match(await r.text(),/Do pedido ao pagamento/)
    const api=await fetch(`${base}/api/despesas`,{headers:{Cookie:cookies[n]}});assert.equal(api.status,200);assert.match(api.headers.get('cache-control'),/no-store/)
  }
})
http('cross origin and missing origin mutations fail closed',async()=>{
  await post('/api/despesas',{id:randomUUID(),kind:'authorization',data,authorizationId:null},1,403,'https://attacker.example')
  assert.equal((await fetch(`${base}/api/despesas`,{method:'POST',headers:{Cookie:cookies[1],'Content-Type':'application/json'},body:'{}'})).status,403)
})
http('private drafts and attachments remain inaccessible to unrelated users',async()=>{
  const r=await post('/api/despesas',{id:randomUUID(),kind:'reimbursement',data:{...data,categoryId:'pequenas',exemptionReason:'Dispensada conforme política de pequenas despesas'},authorizationId:null},1,201)
  assert.equal((await fetch(`${base}/api/despesas/${r.id}`,{headers:{Cookie:cookies[2]}})).status,404)
  const form=new FormData();form.set('file',new Blob(['%PDF-1.4\nfixture-http'],{type:'application/pdf'}),'recibo.pdf');form.set('type','receipt');form.set('revision',String(r.revision))
  const upload=await fetch(`${base}/api/despesas/${r.id}/documentos`,{method:'POST',headers:{Cookie:cookies[1],Origin:base},body:form});assert.equal(upload.status,200,await upload.text())
  const detail=await fetch(`${base}/api/despesas/${r.id}`,{headers:{Cookie:cookies[1]}}).then(r=>r.json()),doc=detail.documents[0]
  const download=await fetch(`${base}/api/despesas/${r.id}/documentos/${doc.id}`,{headers:{Cookie:cookies[1]}})
  assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.match(download.headers.get('content-security-policy'),/sandbox/)
  assert.equal((await fetch(`${base}/api/despesas/${r.id}/documentos/${doc.id}`,{headers:{Cookie:cookies[2]}})).status,404)
  let next=await post(`/api/despesas/${r.id}`,{action:'submit',revision:detail.request.revision})
  await post(`/api/despesas/${r.id}`,{action:'approve',revision:next.request.revision,note:'Tentativa sem alçada de aprovação'},1,403)
  next=await post(`/api/despesas/${r.id}`,{action:'approve',revision:next.request.revision,note:'Finalidade e comprovantes conferidos'},2)
  assert.equal(next.request.status,'finance_review');assert.equal(next.financial,null)
  await post(`/api/despesas/${r.id}`,{action:'release',revision:next.request.revision,note:'Tentativa de liberação sem alçada'},2,403)
  next=await post(`/api/despesas/${r.id}`,{action:'release',revision:next.request.revision,note:'Documentação e política financeira conferidas'},5)
  assert.equal(next.request.status,'released');assert.equal(next.financial.integration_status,'pending');assert.equal(next.integration.skipped,true)
})
http('configuration denies normal users and deactivated users lose issued sessions',async()=>{
  const {version,...config}=await store.policy()
  assert.equal((await fetch(`${base}/api/despesas/politica`,{method:'PUT',headers:{Cookie:cookies[1],Origin:base,'Content-Type':'application/json'},body:JSON.stringify({version,config})})).status,403)
  await pool.query('UPDATE users SET active=false WHERE id=$1',[uid(1)])
  try{assert.equal((await fetch(`${base}/api/despesas`,{headers:{Cookie:cookies[1]}})).status,401)}finally{await pool.query('UPDATE users SET active=true WHERE id=$1',[uid(1)])}
})
