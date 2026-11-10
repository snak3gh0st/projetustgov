import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { FinanceStore } from '../src/lib/finance/store.ts'
import { FinanceEngine } from '../src/lib/finance/engine.ts'
import { ContaAzulMirrorClient,refreshFromMirror } from '../src/lib/finance/mirror.ts'

const url=process.env.FINANCE_TEST_DATABASE_URL
let pool,store,engine
const connection='00000000-0000-4000-8000-000000000080'
before(async()=>{
  if(!url)return
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname))
  pool=new pg.Pool({connectionString:url})
  await pool.query(await readFile(new URL('../../migrations/20261105_financeiro_integrado.sql',import.meta.url),'utf8'))
  await pool.query(`CREATE TABLE IF NOT EXISTS conta_azul_connections(id uuid PRIMARY KEY,tenant_key text UNIQUE,status text,metadata jsonb)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS conta_azul_sync_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid,direction text,status text,started_at timestamptz DEFAULT now(),finished_at timestamptz,metadata jsonb)`)
  // Matches the existing ERP mirror's persisted column types, including legacy text IDs.
  await pool.query(`CREATE TABLE IF NOT EXISTS conta_azul_parcelas(id text PRIMARY KEY,connection_id uuid,tipo text,evento_id text,status text,status_busca text,descricao text,
    data_vencimento date,data_competencia date,valor_total numeric,valor_pago numeric,nao_pago numeric,pessoa_id text,pessoa_nome text,
    busca_payload jsonb,payload jsonb,deleted_at timestamptz)`)
  for(const table of ['finance_jobs','finance_entries','finance_commissions','finance_closings','finance_sales','finance_runs','finance_settings','finance_audit'])await pool.query(`DELETE FROM ${table} WHERE tenant_key='test-mirror'`)
  await pool.query('DELETE FROM conta_azul_parcelas WHERE connection_id=$1',[connection])
  await pool.query('DELETE FROM conta_azul_sync_runs WHERE connection_id=$1',[connection])
  await pool.query(`INSERT INTO conta_azul_connections(id,tenant_key,status,metadata) VALUES($1,'test-mirror','active',$2)
    ON CONFLICT(id) DO UPDATE SET status='active',metadata=EXCLUDED.metadata`,[connection,{company:{id_empresa:'company',documento:'12345678000190'}}])
  store=new FinanceStore(pool,'test-mirror');engine=new FinanceEngine(store)
})
after(async()=>{await pool?.end()})

test('mirror requires an existing finished BI sync and never falls back to external API',{skip:!url},async()=>{
  await assert.rejects(new ContaAzulMirrorClient(store).freshness(),/sincronização finalizada/)
})

test('mirror imports legacy IDs and retains actual source freshness instead of copy time',{skip:!url},async()=>{
  await pool.query(`INSERT INTO conta_azul_sync_runs(connection_id,direction,status,finished_at,metadata) VALUES($1,'pull','completed','2026-01-01', '{}')`,[connection])
  await pool.query(`INSERT INTO conta_azul_parcelas(id,connection_id,tipo,status_busca,descricao,data_vencimento,data_competencia,valor_total,valor_pago,nao_pago,pessoa_id,pessoa_nome,busca_payload,payload)
    VALUES('123456',$1,'RECEITA','EM_ABERTO','Título do BI','2026-11-05','2026-11-01',100,20,80,'654321','Cliente','{}',$2)`,[connection,{evento:{id:'123'},baixas:[{data_pagamento:'2026-11-05',valor_composicao:{valor_liquido:20}}]}])
  await refreshFromMirror(engine,new ContaAzulMirrorClient(store),'2026-01-01','2027-01-01')
  const report=await engine.report('2026-11-05')
  assert.equal(report.summary.receivableTodayCents,8000)
  assert.equal(report.summary.receivedTodayCents,2000)
  assert.ok(report.lastSync.startsWith('2026-01-01'))
  assert.ok(report.warnings.some(w=>w.includes('24 horas')))
  assert.equal(report.entries[0].remote_id,'123456')
})

test('deleted ERP titles are canceled and partial source sync remains visible',{skip:!url},async()=>{
  await pool.query("UPDATE conta_azul_parcelas SET deleted_at=now() WHERE connection_id=$1",[connection])
  await pool.query("UPDATE conta_azul_sync_runs SET status='partial' WHERE connection_id=$1",[connection])
  await refreshFromMirror(engine,new ContaAzulMirrorClient(store),'2026-01-01','2027-01-01')
  const report=await engine.report('2026-11-05')
  assert.equal(report.summary.receivableTodayCents,0)
  assert.equal(report.entries[0].status,'canceled')
  assert.ok(report.warnings.some(w=>w.includes('não foi concluída')))
})

test('mirror copy is blocked while the BI is writing a new snapshot',{skip:!url},async()=>{
  await pool.query(`INSERT INTO conta_azul_sync_runs(connection_id,direction,status,metadata) VALUES($1,'pull','running','{}')`,[connection])
  await assert.rejects(new ContaAzulMirrorClient(store).freshness(),/está sincronizando/)
})
