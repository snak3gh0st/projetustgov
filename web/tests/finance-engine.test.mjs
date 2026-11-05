import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { FinanceStore } from '../src/lib/finance/store.ts'
import { ProviderError } from '../src/lib/finance/providers.ts'
import { deliverOnce } from '../src/lib/finance/delivery.ts'
const m=await import('../src/lib/finance/engine.ts').catch(()=>({}))
const url=process.env.FINANCE_TEST_DATABASE_URL
const pool=url?new pg.Pool({connectionString:url}):null
let store,engine
const uid='00000000-0000-4000-8000-000000000001'
const remote='00000000-0000-4000-8000-000000000002'
before(async()=>{
  if(!pool)return
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname))
  await pool.query(await readFile(new URL('../../migrations/20261105_financeiro_integrado.sql',import.meta.url),'utf8'))
  for(const table of ['finance_jobs','finance_entries','finance_commissions','finance_closings','finance_sales','finance_events','finance_runs','finance_settings','finance_audit','finance_deliveries','finance_people'])await pool.query(`DELETE FROM ${table} WHERE tenant_key='test-engine'`)
  store=new FinanceStore(pool,'test-engine')
  if(m.FinanceEngine)engine=new m.FinanceEngine(store)
})
after(async()=>{await pool?.end()})
test('financial synchronization engine exists',()=>assert.equal(typeof m.FinanceEngine,'function'))
async function entry(key){
  const s=await store.ingestCrmSale({external_key:key,customer_name:'Cliente',customer_document:'12345678000190',customer_email:'',description:'Serviço',amount_cents:10000,seller_id:null,seller_name:'',commission_cents:0,closer_id:null,closer_name:'',closer_commission_cents:0,source_updated_at:'2026-10-01T00:00:00Z'})
  await store.confirmSchedule(s.id,{count:1,firstDate:'2026-11-05',billingMode:'single',remotePersonId:uid},uid)
  return (await store.rows('SELECT * FROM finance_entries WHERE sale_id=$1',[s.id]))[0]
}
test('remote writes remain disabled until explicitly configured', {skip:!url},async()=>{
  await entry('disabled')
  let attempted=false
  await assert.rejects(engine.push({accountIdentity:async()=>'test-company',createEntry:async()=>{attempted=true}}))
  assert.equal(attempted,false)
  await store.saveSettings({...await store.settings(),accountFingerprint:'test-company',writesEnabled:true,companyConfirmed:true,financialAccountId:uid,receivableCategoryId:uid,payableCategoryId:uid},uid)
})
test('uncertain POST is not automatically repeated on the next execution',{skip:!url},async()=>{
  let attempted=0
  const client={accountIdentity:async()=>'test-company',listEntries:async()=>[],createEntry:async()=>{attempted++;throw new ProviderError('timeout',502,true)}}
  await engine.push(client)
  await engine.push(client)
  assert.equal(attempted,1)
  assert.equal((await store.rows("SELECT status FROM finance_jobs WHERE tenant_key=$1",[store.tenant]))[0].status,'uncertain')
})
test('pull reconciles a remote entry by stable note, without double-counting it',{skip:!url},async()=>{
  const e=await entry('reconciliation')
  const client={
    accountIdentity:async()=>'test-company',
    listEntries:async kind=>kind==='payable'?[]:[{id:remote,total:100,pago:0,nao_pago:100,descricao:'Serviço',data_vencimento:'2026-11-05',data_competencia:'2026-11-05',status_traduzido:'EM_ABERTO',cliente:{id:uid,nome:'Cliente'}}],
    detail:async()=>({nota:`Projete:${e.id}`,evento:{id:uid},baixas:[]})}
  await engine.pull(client,'2026-11-01','2026-11-30')
  await engine.pull(client,'2026-11-01','2026-11-30')
  const rows=await store.rows('SELECT * FROM finance_entries WHERE tenant_key=$1 AND remote_id=$2',[store.tenant,remote])
  assert.equal(rows.length,1)
  assert.equal(rows[0].id,e.id)
  const report=await engine.report('2026-11-05')
  assert.equal(report.summary.receivableTodayCents,10000)
  assert.equal(report.summary.unsyncedReceivableCents,10000)
})

test('changing the connected company blocks all writes and reads before merging records',{skip:!url},async()=>{
  let attempted=false
  const client={accountIdentity:async()=>'another-company',listEntries:async()=>{attempted=true;return[]},createEntry:async()=>{attempted=true}}
  await assert.rejects(engine.push(client),/empresa conectada mudou/)
  await assert.rejects(engine.pull(client,'2026-11-01','2026-11-30'),/empresa conectada mudou/)
  assert.equal(attempted,false)
})

test('manual ERP entries with the same party, amount and due date block duplicate creation',{skip:!url},async()=>{
  const e=await entry('duplicate-manual')
  let attempted=false
  const client={accountIdentity:async()=>'test-company',listEntries:async()=>[{id:remote,total:100,cliente:{id:uid}}],createEntry:async()=>{attempted=true}}
  await engine.push(client)
  assert.equal(attempted,false)
  const job=(await store.rows('SELECT status,last_error FROM finance_jobs WHERE tenant_key=$1 AND entry_id=$2',[store.tenant,e.id]))[0]
  assert.equal(job.status,'failed')
  assert.match(job.last_error,/mesma pessoa/)
})

test('concurrent delivery calls send only once and uncertain delivery is not repeated',{skip:!url},async()=>{
  let sent=0
  const sender=async()=>{sent++;return'email-1'}
  await Promise.all([deliverOnce(store,'concurrent',sender),deliverOnce(store,'concurrent',sender)])
  assert.equal(sent,1)
  const failure=async()=>{sent++;throw new Error('Timeout')}
  await assert.rejects(deliverOnce(store,'uncertain-delivery',failure))
  const second=await deliverOnce(store,'uncertain-delivery',failure)
  assert.equal(second.skipped,true)
  assert.equal(sent,2)
})

test('Hotmart history enriches and maps actual affiliate commissions without releasing them',{skip:!url},async()=>{
  await store.saveSettings({...await store.settings(),affiliateMap:{'hotmart-seller':uid}},uid)
  const client={history:async()=>[{product:{id:12,name:'Mentoria'},buyer:{name:'Aluno'},purchase:{transaction:'HP-enriched',status:'APPROVED',order_date:1790870400000,approved_date:1790870400000,price:{value:300,currency_code:'BRL'}}}],
    commissions:async()=>[{source:'AFFILIATE',user:{ucode:'hotmart-seller',name:'Vendedor'},value:25,currency_value:'BRL'}]}
  await engine.importHotmart(client,'2026-10-01','2026-11-01')
  const c=(await store.rows("SELECT cm.* FROM finance_commissions cm JOIN finance_sales s ON s.id=cm.sale_id WHERE cm.tenant_key=$1 AND s.external_key='HP-enriched'",[store.tenant]))[0]
  assert.equal(c.beneficiary_id,uid)
  assert.equal(Number(c.amount_cents),2500)
  assert.equal(c.status,'calculated')
})

test('run bookkeeping releases its connection before provider work (transaction-pool compatible)',{skip:!url},async()=>{
  const single=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:150})
  try{
    const oneStore=new FinanceStore(single,'test-engine')
    const one=new m.FinanceEngine(oneStore)
    const result=await one.run('single-connection',{},async()=>({count:Number((await oneStore.rows('SELECT 1 n'))[0].n)}))
    assert.equal(result.count,1)
  }finally{await single.end()}
})
