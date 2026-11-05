import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const module = await import('../src/lib/finance/store.ts').catch(() => ({}))
const url = process.env.FINANCE_TEST_DATABASE_URL
const pool = url ? new pg.Pool({ connectionString: url }) : null
let store
before(async () => {
  if (!pool) return
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname), 'tests require isolated local PostgreSQL')
  await pool.query(await readFile(new URL('../../migrations/20261105_financeiro_integrado.sql', import.meta.url), 'utf8'))
  for (const table of ['finance_jobs','finance_entries','finance_commissions','finance_closings','finance_sales','finance_events','finance_runs','finance_audit','finance_deliveries','finance_settings','finance_people']) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_key IN ('test-finance','other-tenant')`)
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY,nome text,email text,active boolean,role text)`)
  await pool.query(`INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001','Vendedor','seller@example.test',true,'vendedor') ON CONFLICT DO NOTHING`)
  if (module.FinanceStore) store = new module.FinanceStore(pool, 'test-finance')
})
after(async () => { await pool?.end() })
const uid = '00000000-0000-4000-8000-000000000001'
const sale = { external_key: 'crm-1', customer_name: 'Cliente', customer_document: '12345678000190', customer_email: '',
  description: 'Serviço Projete', amount_cents: 10000, seller_id: uid, seller_name: 'Vendedor', commission_cents: 500,
  closer_id: uid, closer_name: 'Vendedor', closer_commission_cents: 300, source_updated_at: '2026-10-02T00:00:00Z' }

test('store implementation exists', () => assert.equal(typeof module.FinanceStore, 'function'))
test('CRM replay creates one sale and two roles, without auto-releasing commissions', { skip: !url }, async () => {
  const s = await store.ingestCrmSale(sale)
  await store.ingestCrmSale(sale)
  assert.equal((await pool.query(`SELECT * FROM finance_sales WHERE tenant_key='test-finance' AND external_key='crm-1'`)).rowCount, 1)
  const c = await pool.query(`SELECT * FROM finance_commissions WHERE sale_id=$1`, [s.id])
  assert.equal(c.rowCount, 2)
  assert.equal(c.rows.every(r => r.status === 'calculated'), true)
})
test('confirmed schedule cannot be silently rebuilt or duplicated', { skip: !url }, async () => {
  const s = await store.ingestCrmSale({ ...sale, external_key: 'schedule-1' })
  await store.confirmSchedule(s.id, { count: 3, firstDate: '2026-10-31', billingMode: 'fixed', remotePersonId: null }, uid)
  await assert.rejects(store.confirmSchedule(s.id, { count: 2, firstDate: '2026-10-31', billingMode: 'fixed' }, uid))
  const entries = await pool.query('SELECT amount_cents,due_date::text FROM finance_entries WHERE sale_id=$1 ORDER BY due_date', [s.id])
  assert.deepEqual(entries.rows.map(r => Number(r.amount_cents)), [3334,3333,3333])
  assert.equal(entries.rows[1].due_date, '2026-11-30')
})
test('closing is immutable and repeat approval does not duplicate payables', { skip: !url }, async () => {
  const s = await store.ingestCrmSale({ ...sale, external_key: 'closing-1' })
  const c = await pool.query('SELECT id FROM finance_commissions WHERE sale_id=$1', [s.id])
  for (const r of c.rows) await store.releaseCommission(r.id, '2026-10-20', 'Recebimento conferido pelo financeiro', uid)
  const closing = await store.closeMonth('2026-10', uid)
  assert.equal(Number(closing.total_cents), 800)
  assert.equal((await store.closeMonth('2026-10', uid)).id, closing.id)
  const payable = await pool.query('SELECT amount_cents,due_date::text FROM finance_entries WHERE closing_id=$1', [closing.id])
  assert.equal(payable.rowCount, 1)
  assert.equal(Number(payable.rows[0].amount_cents), 800)
  assert.equal(payable.rows[0].due_date, '2026-11-15')
  await store.ingestCrmSale({ ...sale, external_key: 'closing-1', commission_cents: 900, source_updated_at: '2026-11-01T00:00:00Z' })
  const frozen = await pool.query("SELECT amount_cents FROM finance_commissions WHERE sale_id=$1 AND role='consultor'", [s.id])
  assert.equal(Number(frozen.rows[0].amount_cents), 500)
})
test('another tenant cannot inspect or mutate a sale', { skip: !url }, async () => {
  const s = await store.ingestCrmSale({ ...sale, external_key: 'tenant-1' })
  const other = new module.FinanceStore(pool, 'other-tenant')
  await assert.rejects(other.confirmSchedule(s.id, { count:1,firstDate:'2026-10-01',billingMode:'single' }, uid))
})
test('stale and repeated Hotmart events do not resurrect refunded sales', { skip: !url }, async () => {
  const base = { externalKey:'HP-test',eventId:'h1',eventDate:'2026-10-01T00:00:00Z',eventType:'PURCHASE_APPROVED',customerName:'Aluno',customerEmail:'',customerDocument:'',description:'Mentoria',amountCents:30000,paymentStatus:'paid',billingMode:'review',approvedDate:'2026-10-01',affiliateCode:null,affiliateName:null,affiliateCents:null,snapshot:{} }
  await store.ingestHotmart(base)
  await store.ingestHotmart({...base,eventId:'h2',eventDate:'2026-10-02T00:00:00Z',paymentStatus:'refunded'})
  await store.ingestHotmart(base)
  await store.ingestHotmart({...base,eventId:'h3',eventDate:'2026-10-03T00:00:00Z'})
  const s = await pool.query("SELECT status FROM finance_sales WHERE tenant_key='test-finance' AND external_key='HP-test'")
  assert.equal(s.rows[0].status, 'refunded')
})

test('a confirmed product rule automatically builds Hotmart installments exactly once', {skip:!url},async()=>{
  const config=await store.settings()
  await store.saveSettings({...config,hotmartRules:{'12':{billingMode:'fixed',count:3,dueOffsetDays:0}}},uid)
  const p={externalKey:'HP-auto',eventId:'auto-1',eventDate:'2026-10-01T00:00:00Z',eventType:'PURCHASE_APPROVED',customerName:'Aluno',customerEmail:'',customerDocument:'12345678901',description:'Mentoria',amountCents:10000,paymentStatus:'paid',billingMode:'review',approvedDate:'2026-10-31',affiliateCode:null,affiliateName:null,affiliateCents:null,snapshot:{productId:12,status:'APPROVED'}}
  await store.ingestHotmart(p)
  await store.ingestHotmart(p)
  const entries=await pool.query("SELECT e.amount_cents,e.due_date::text FROM finance_entries e JOIN finance_sales s ON s.id=e.sale_id WHERE s.tenant_key='test-finance' AND s.external_key='HP-auto' ORDER BY e.due_date")
  assert.deepEqual(entries.rows.map(r=>Number(r.amount_cents)),[3334,3333,3333])
  assert.equal(entries.rows[1].due_date,'2026-11-30')
})

test('CRM commission removal voids an unapproved amount rather than leaving it payable',{skip:!url},async()=>{
  const s=await store.ingestCrmSale({...sale,external_key:'zero-commission'})
  await store.ingestCrmSale({...sale,external_key:'zero-commission',commission_cents:0})
  const row=(await pool.query("SELECT status FROM finance_commissions WHERE sale_id=$1 AND role='consultor'",[s.id])).rows[0]
  assert.equal(row.status,'void')
})

test('source corrections revoke an unreconciled release and require a new explicit release',{skip:!url},async()=>{
  const s=await store.ingestCrmSale({...sale,external_key:'corrected-release'})
  const id=(await pool.query("SELECT id FROM finance_commissions WHERE sale_id=$1 AND role='consultor'",[s.id])).rows[0].id
  await store.releaseCommission(id,'2026-11-01','Recebimento conferido no extrato',uid)
  await store.ingestCrmSale({...sale,external_key:'corrected-release'})
  assert.equal((await pool.query('SELECT status FROM finance_commissions WHERE id=$1',[id])).rows[0].status,'released')
  await store.ingestCrmSale({...sale,external_key:'corrected-release',commission_cents:200})
  const row=(await pool.query('SELECT status,amount_cents,eligibility_date FROM finance_commissions WHERE id=$1',[id])).rows[0]
  assert.equal(row.status,'calculated')
  assert.equal(Number(row.amount_cents),200)
  assert.equal(row.eligibility_date,null)
})

test('an old approved Hotmart event cannot create a schedule after a newer overdue event',{skip:!url},async()=>{
  const p={externalKey:'HP-stale-schedule',eventId:'stale-newer',eventDate:'2026-10-02T00:00:00Z',eventType:'PURCHASE_DELAYED',customerName:'Aluno',customerEmail:'',customerDocument:'',description:'Mentoria',amountCents:10000,paymentStatus:'overdue',billingMode:'review',approvedDate:'2026-10-01',affiliateCode:null,affiliateName:null,affiliateCents:null,snapshot:{productId:12,status:'OVERDUE'}}
  await store.ingestHotmart(p)
  await store.ingestHotmart({...p,eventId:'stale-older',eventDate:'2026-10-01T00:00:00Z',eventType:'PURCHASE_APPROVED',paymentStatus:'paid',snapshot:{productId:12,status:'APPROVED'}})
  const rows=await pool.query("SELECT schedule_confirmed FROM finance_sales WHERE tenant_key='test-finance' AND external_key='HP-stale-schedule'")
  assert.equal(rows.rows[0].schedule_confirmed,false)
})

test('reopening a CRM sale voids unapproved commissions and cancels local obligations',{skip:!url},async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS vendedor_projetos(id bigint PRIMARY KEY,nome text,cnpj text,email text,tipo_servico text,
    valor_venda numeric,vendedor_id uuid,closer_id uuid,comissao_valor numeric,closer_comissao_valor numeric,status_contato text,fechamento_at timestamptz,updated_at timestamptz)`)
  await pool.query("INSERT INTO vendedor_projetos(id,nome,cnpj,status_contato) VALUES(2147483601,'Fixture CRM','12345678000190','Em Atendimento') ON CONFLICT(id) DO UPDATE SET status_contato='Em Atendimento'")
  try{
    const s=await store.ingestCrmSale({...sale,external_key:'2147483601'})
    await store.confirmSchedule(s.id,{count:1,firstDate:'2026-11-01',billingMode:'single'},uid)
    const cm=(await pool.query("SELECT id FROM finance_commissions WHERE sale_id=$1 AND role='consultor'",[s.id])).rows[0]
    await store.releaseCommission(cm.id,'2026-11-01','Recebimento fictício conferido antes da reabertura',uid)
    await store.importCrm()
    assert.ok((await pool.query('SELECT status FROM finance_commissions WHERE sale_id=$1',[s.id])).rows.every(r=>r.status==='void'))
    assert.ok((await pool.query('SELECT status FROM finance_entries WHERE sale_id=$1',[s.id])).rows.every(r=>r.status==='canceled'))
    assert.ok((await pool.query('SELECT j.status FROM finance_jobs j JOIN finance_entries e ON e.id=j.entry_id WHERE e.sale_id=$1',[s.id])).rows.every(r=>r.status==='canceled'))
  }finally{await pool.query('DELETE FROM vendedor_projetos WHERE id=2147483601')}
})
