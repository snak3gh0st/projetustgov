import test,{before,beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {ExpenseStore} from '../src/lib/expenses/store.ts'
import {addBusinessDays,chooseAuthority,emptyPolicy,policySchema,validateFile} from '../src/lib/expenses/domain.ts'
import {ContaAzulClient} from '../src/lib/finance/providers.ts'
import {FinanceEngine} from '../src/lib/finance/engine.ts'
import {exportExpense,retryExpense,reconcileExpense} from '../src/lib/expenses/integration.ts'
import {uid,actor,config,data,tenant,now,localOnly,prepare,reset} from './expenses-fixture.mjs'
const url=process.env.EXPENSE_TEST_DATABASE_URL
let pool,store
before(async()=>{if(!url)return;localOnly(url);pool=new pg.Pool({connectionString:url,max:6});await prepare(pool);store=new ExpenseStore(pool,tenant)})
beforeEach(async()=>{if(pool)await reset(pool,store)})
after(async()=>{await pool?.end()})
const db=(name,fn)=>test(name,{skip:!url},fn)
const note={note:'Documentação e finalidade conferidas'}
async function attach(r,type='receipt',bytes=Buffer.from(`%PDF-1.4\n${r.id}`)){return store.attach(r.id,r.revision,{type,name:'comprovante.pdf',mime:'application/pdf',bytes},actor(r.kind==='purchase'?3:1))}
async function create(kind='reimbursement',value={},parent=null,owner=1){return store.create(randomUUID(),kind,{...data,...(kind==='reimbursement'?{categoryId:'pequenas',exemptionReason:'Dispensada conforme política de pequenas despesas'}:{}),...value},parent,actor(owner))}
async function command(r,action,who,extra=note,at=now){return store.command(r.id,r.revision,action,actor(who),extra,at)}
async function authorized(mode='employee',amount=10000){let r=await create('authorization',{amountCents:amount});r=await attach(r,'quote');r=await command(r,'submit',1);r=await command(r,'approve',2);r=await command(r,'approve',3);return command(r,'approve',4,{...note,amountCents:amount,mode,conditions:'Realizar a despesa no período e limite aprovados',validUntil:'2026-11-12'})}
async function financial(){let r=await create();r=await attach(r);r=await command(r,'submit',1);return command(r,'approve',2)}
function provider(mode='success'){
  const calls=[]
  const client=new ContaAzulClient(async()=>'test-access',async(url,init)=>{
    calls.push({url,method:init.method,body:init.body?JSON.parse(init.body):null})
    if(url.endsWith('/v1/pessoas/conta-conectada'))return Response.json({id_empresa:'company-test',documento:'12345678000190'})
    if(init.method==='POST'){
      if(mode==='uncertain')throw new Error('connection lost after accepting write')
      return Response.json({id:uid(95),condicao_pagamento:{parcelas:[{id:uid(96)}]}},{status:201})
    }
    return Response.json({itens:[],itens_totais:0})
  });return {client,calls}
}

test('D+2 uses São Paulo release date, weekends, holidays and confirmed years',()=>{
  assert.equal(addBusinessDays(new Date('2026-11-14T01:30:00Z'),['2026-11-16'],[2026]),'2026-11-18')
  assert.throws(()=>addBusinessDays(new Date('2026-12-31T15:00Z'),[],[2026]),/2027/)
  assert.equal(addBusinessDays(now,[],[2026]),'2026-11-16')
})
test('authority routing respects limits and skips requester',()=>{
  assert.equal(chooseAuthority({...emptyPolicy,...config},200000,uid(1)),uid(6))
  assert.equal(chooseAuthority({...emptyPolicy,...config},10000,uid(4)),uid(6))
  assert.throws(()=>chooseAuthority({...emptyPolicy,...config},1000001,uid(1)))
})
test('policy stays inactive until explicit rules and distinct substitutes exist',()=>{
  assert.equal(policySchema.safeParse({...config,reference:''}).success,false)
  assert.equal(policySchema.safeParse({...config,areas:[{...config.areas[0],alternateHeadId:uid(2)}]}).success,false)
})
test('attachments check bytes, MIME, size and disallow executable markup',()=>{
  assert.throws(()=>validateFile(Buffer.from('<svg onload="alert(1)">'),'image/svg+xml'))
  assert.throws(()=>validateFile(Buffer.from('<html>'),'application/pdf'))
  assert.throws(()=>validateFile(Buffer.alloc(5242881),'application/pdf'))
  validateFile(Buffer.from('%PDF-1.4\nfixture'),'application/pdf')
})
db('migration is repeatable; draft never creates an ERP entry; exact creation replay is idempotent',async()=>{
  const id=randomUUID(),r=await store.create(id,'authorization',data,null,actor(1))
  assert.equal((await store.create(id,'authorization',data,null,actor(1))).id,r.id)
  assert.equal((await pool.query('SELECT * FROM finance_entries WHERE tenant_key=$1',[tenant])).rowCount,0)
  await assert.rejects(store.create(id,'authorization',{...data,title:'Outro pedido'},null,actor(1)),/já utilizado/)
})
db('policy management uses current database role and optimistic versions',async()=>{
  await assert.rejects(store.savePolicy(config,1,actor(1)),/Somente/)
  await assert.rejects(store.savePolicy(config,0,actor(8)),/mudou/)
  await pool.query('UPDATE users SET role=$2 WHERE id=$1',[uid(8),'vendedor'])
  await assert.rejects(store.savePolicy(config,1,actor(8)),/Somente/)
  await pool.query('UPDATE users SET role=$2 WHERE id=$1',[uid(8),'admin'])
})
db('missing evidence, policy and authorization block submission',async()=>{
  let r=await create('reimbursement',{categoryId:'viagem',exemptionReason:''})
  await assert.rejects(command(r,'submit',1),/documentos/)
  r=await attach(r);await assert.rejects(command(r,'submit',1),/autorização/)
  await store.savePolicy({...config,enabled:false},1,actor(8))
  await assert.rejects(command(r,'submit',1),/ativada/)
})
db('prior authorization cannot silently authorize a period already started',async()=>{
  let r=await create('authorization',{periodStart:'2026-11-11'});r=await attach(r,'quote')
  await assert.rejects(command(r,'submit',1),/período ainda não iniciado/)
})
db('authorization passes Head, Administrative and authority, freezes conditions and generates one protocol',async()=>{
  const r=await authorized()
  assert.equal(r.status,'approved');assert.equal(r.execution_mode,'employee');assert.match(r.protocol,/^AUT-2026-/)
  assert.equal(Number(r.approved_amount_cents),10000)
  await assert.rejects(command({...r,revision:r.revision-1},'approve',4,{...note,amountCents:10000,mode:'employee',conditions:'Condições aprovadas'}),/mudou/)
  assert.equal((await pool.query('SELECT * FROM finance_entries WHERE tenant_key=$1',[tenant])).rowCount,0)
})
db('private drafts, cross-tenant access and nonassigned actors are denied',async()=>{
  const r=await create()
  await assert.rejects(store.get(r.id,actor(2)),/não encontrada/)
  await assert.rejects(new ExpenseStore(pool,'other').get(r.id,actor(1)),/não encontrada/)
  assert.equal((await store.dashboard(actor(2))).requests.length,0)
  assert.equal((await store.dashboard(actor(1))).requests.length,1)
})
db('Head cannot approve own claim; alternate can; Finance cannot release own reimbursement',async()=>{
  await store.savePolicy({...config,areas:[{...config.areas[0],headId:uid(1)}],financeIds:[uid(1),uid(5)]},1,actor(8))
  let r=await create();r=await attach(r);r=await command(r,'submit',1)
  await assert.rejects(command(r,'approve',1),/outro responsável/)
  r=await command(r,'approve',7)
  await assert.rejects(command(r,'release',1),/outro responsável/)
  assert.equal((await store.dashboard(actor(5))).requests.length,1)
})
db('financial release alone creates one frozen payable, D+2 and queue; simultaneous release cannot duplicate',async()=>{
  const r=await financial(),out=await Promise.allSettled([command(r,'release',5,note,new Date('2026-11-13T16:00Z')),command(r,'release',5,note,new Date('2026-11-13T16:00Z'))])
  assert.equal(out.filter(r=>r.status==='fulfilled').length,1)
  const entries=await pool.query('SELECT *,due_date::text FROM finance_entries WHERE tenant_key=$1',[tenant])
  assert.equal(entries.rowCount,1);assert.equal(entries.rows[0].due_date,'2026-11-18')
  assert.equal(entries.rows[0].expense_config.payableCategoryId,uid(91))
  assert.equal((await pool.query('SELECT * FROM finance_jobs WHERE tenant_key=$1',[tenant])).rowCount,1)
})
db('linked partial reimbursements reserve authorized balance atomically',async()=>{
  const parent=await authorized('employee',10000)
  const createChild=async()=>{let r=await create('reimbursement',{categoryId:'viagem',amountCents:7000},parent.id);return attach(r)}
  const a=await createChild(),b=await createChild()
  const out=await Promise.allSettled([command(a,'submit',1),command(b,'submit',1)])
  assert.equal(out.filter(r=>r.status==='fulfilled').length,1)
  assert.match(out.find(r=>r.status==='rejected').reason.message,/saldo/)
})
db('duplicate receipt content across claims is rejected even concurrently',async()=>{
  const bytes=Buffer.from('%PDF-1.4 shared evidence'),a=await attach(await create(),'receipt',bytes),b=await attach(await create(),'receipt',bytes)
  const out=await Promise.allSettled([command(a,'submit',1),command(b,'submit',1)])
  assert.equal(out.filter(r=>r.status==='fulfilled').length,1)
  assert.match(out.find(r=>r.status==='rejected').reason.message,/comprovante/)
})
db('returned claims require new Head review; removed evidence remains in historical custody',async()=>{
  let r=await financial();r=await command(r,'return',5)
  const doc=(await store.documents(r.id))[0]
  r=await store.removeDocument(r.id,doc.id,r.revision,actor(1))
  assert.equal((await store.documents(r.id)).length,0)
  assert.equal((await pool.query('SELECT content FROM expense_documents WHERE id=$1',[doc.id])).rows[0].content.length>0,true)
  await assert.rejects(command(r,'submit',1),/documentos/)
  r=await attach(r);r=await command(r,'submit',1);assert.equal(r.status,'head_review')
})
db('exceptions require a competent authority; finance gate remains mandatory',async()=>{
  let r=await financial();r=await command(r,'escalate',5,{note:'Despesa exige avaliação de excepcionalidade'})
  assert.equal(r.status,'exception_review');await assert.rejects(command(r,'release',5),/outro responsável/)
  r=await command(r,'approve',4);assert.equal(r.status,'finance_review');assert.equal(r.finance_entry_id,null)
})
db('company purchase follows authorized modality, requires supplier and keeps agreed due date',async()=>{
  const p=await authorized('company')
  let r=await create('purchase',{supplierId:uid(88),paymentDueDate:'2026-11-25'},p.id,3)
  r=await attach(r);r=await command(r,'submit',3);assert.equal(r.status,'finance_review')
  r=await command(r,'release',5)
  const entry=(await pool.query('SELECT due_date::text,remote_person_id FROM finance_entries WHERE id=$1',[r.finance_entry_id])).rows[0]
  assert.equal(entry.due_date,'2026-11-25');assert.equal(entry.remote_person_id,uid(88))
  await assert.rejects(store.create(randomUUID(),'purchase',data,p.id,actor(1)),/Administrativo/)
})
db('current financial settings and confirmed holiday calendar gate release',async()=>{
  const r=await financial();await store.savePolicy({...config,calendarYears:[]},1,actor(8))
  await assert.rejects(command(r,'release',5),/calendário/)
  assert.equal((await store.get(r.id,actor(1))).status,'finance_review')
})
db('existing financial push excludes expenses; dedicated export honors both flags and frozen classifications',async()=>{
  const r=await command(await financial(),'release',5),{client,calls}=provider()
  assert.equal((await exportExpense(store,client,r.id,actor(5))).skipped,true);assert.equal(calls.length,0)
  await store.saveSettings({...await store.settings(),writesEnabled:true},uid(8))
  assert.equal((await new FinanceEngine(store).push(client)).count,0)
  assert.equal(calls.filter(c=>c.method==='POST').length,0)
  await store.savePolicy({...config,exportsEnabled:true},1,actor(8))
  const result=await exportExpense(store,client,r.id,actor(5));assert.equal(result.count,1)
  const post=calls.find(c=>c.method==='POST');assert.ok(post.url.endsWith('/v1/financeiro/contas-a-pagar'))
  assert.equal(post.body.rateio[0].id_categoria,uid(91));assert.equal(post.body.rateio[0].rateio_centro_custo[0].id_centro_custo,uid(92))
  await exportExpense(store,client,r.id,actor(5));assert.equal(calls.filter(c=>c.method==='POST').length,1)
})
db('unknown provider result cannot be retried automatically or marked paid',async()=>{
  const r=await command(await financial(),'release',5),{client}=provider('uncertain')
  await store.saveSettings({...await store.settings(),writesEnabled:true},uid(8));await store.savePolicy({...config,exportsEnabled:true},1,actor(8))
  assert.equal((await exportExpense(store,client,r.id,actor(5))).uncertain,1)
  await assert.rejects(retryExpense(store,r.id,actor(5)),/incertos/)
  const detail=await store.detail(r.id,actor(1));assert.equal(detail.financial.status,'open');assert.equal(detail.financial.integration_status,'uncertain')
})
db('manual reconciliation verifies the released obligation and only then confirms settlement',async()=>{
  const r=await command(await financial(),'release',5)
  const entry=(await pool.query('SELECT *,due_date::text FROM finance_entries WHERE id=$1',[r.finance_entry_id])).rows[0]
  let total=101
  const client=new ContaAzulClient(async()=>'fixture',async url=>{
    if(url.endsWith('/v1/pessoas/conta-conectada'))return Response.json({id_empresa:'company-test',documento:'12345678000190'})
    if(url.includes('/buscar?'))return Response.json({itens:[{id:uid(96),fornecedor:{id:uid(89)},total,pago:total,status_traduzido:'QUITADO',data_vencimento:entry.due_date}],itens_totais:1})
    return Response.json({evento:{id:uid(95)},nota:`Projete:${entry.id}`,baixas:[{data_pagamento:entry.due_date,valor_composicao:{valor_liquido:total}}]})
  })
  await assert.rejects(reconcileExpense(store,client,r.id,uid(96),actor(5)),/não corresponde/)
  assert.equal((await store.detail(r.id,actor(1))).financial.status,'open')
  total=100;await reconcileExpense(store,client,r.id,uid(96),actor(5))
  const detail=await store.detail(r.id,actor(1));assert.equal(detail.financial.status,'paid');assert.equal(detail.financial.remote_id,uid(96));assert.equal(detail.financial.integration_status,'done')
  await assert.rejects(exportExpense(store,client,r.id,actor(1)),/restrito/)
})
db('inactive users cannot act, and notifications follow responsible stage',async()=>{
  let r=await create();r=await attach(r);r=await command(r,'submit',1)
  assert.ok((await store.dashboard(actor(2))).notifications.some(n=>n.request_id===r.id))
  await pool.query('UPDATE users SET active=false WHERE id=$1',[uid(2)])
  await assert.rejects(command(r,'approve',2),/inativa/)
  await pool.query('UPDATE users SET active=true WHERE id=$1',[uid(2)])
})
