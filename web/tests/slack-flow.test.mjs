import test,{before,beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {prepareWorkspaceDb,requireLocalTestDb,alice,clientA} from './workspace-fixture.mjs'
import {slackConfig} from '../src/lib/slack/config.ts'
import {SlackStore} from '../src/lib/slack/store.ts'
import {SlackClient} from '../src/lib/slack/client.ts'
import {runSlackJob} from '../src/lib/slack/job.ts'
import {commercialActivity} from '../src/lib/commercial-activity.ts'
import {getPool} from '../src/lib/db.ts'
const url=process.env.SLACK_TEST_DATABASE_URL,schema=`slack_${randomUUID().replaceAll('-','')}`
let admin,pool
const config=slackConfig({SLACK_COMMERCIAL_ENABLED:'true',SLACK_BOT_TOKEN:'xoxb-synthetic',SLACK_SIGNING_SECRET:'synthetic',SLACK_WORKSPACE_ID:'T00000001',SLACK_COMMERCIAL_CHANNEL_ID:'C00000001',SLACK_COMMERCIAL_REPORT_TIME:'18:00'})
const message={text:'Synthetic test',blocks:[]},pause=async()=>{}
const dbClient=async()=>{const c=await pool.connect();return{c,store:new SlackStore(c,config)}}
async function manual(c,id,status){await c.query('BEGIN');await c.query("SELECT set_config('app.origem','manual',true),set_config('app.user_id',$1,true)",[alice]);await c.query('UPDATE vendedor_projetos SET status_contato=$1 WHERE id=$2',[status,id]);await c.query('COMMIT')}
function provider(handler=async()=>Response.json({ok:true,channel:config.channel,ts:'123.456'})){
 const sent=[];const client=new SlackClient(config.token,config.teamId,async(url,init)=>{
  if(String(url).endsWith('/auth.test'))return Response.json({ok:true,team_id:config.teamId,bot_id:'B00000001'})
  sent.push(JSON.parse(init.body));return handler(sent.at(-1))
 });return{client,sent}
}
const job=(client,more={})=>runSlackJob({config,pool,client,now:new Date('2026-11-26T18:00:00Z'),channels:[],pause,...more})
before(async()=>{
 if(!url)return;requireLocalTestDb(url)
 admin=new pg.Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`)
 const local=new URL(url);local.searchParams.set('options',`-c search_path=${schema},public`)
 process.env.DATABASE_URL=local.toString();process.env.DATABASE_SSL='disable'
 pool=new pg.Pool({connectionString:local.toString()});await prepareWorkspaceDb(pool)
 for(const col of ['codigo_programa','nome_programa','link_externo','orgao_concedente','qualificacao','parlamentar','valor_emenda','valor_global','valor_empenhado','valor_liberado','nr_convenio','objeto','modalidade','situacao','saldo_conta','status_contato_execucao','comissao_valor'])await pool.query(`ALTER TABLE vendedor_projetos ADD COLUMN IF NOT EXISTS ${col} text`)
 await pool.query('CREATE TABLE contact_notes(id bigserial PRIMARY KEY,lead_cnpj text,vendedor_id uuid,tipo text,created_at timestamptz DEFAULT now())')
 for(const file of ['create_lead_events.sql','20261126_slack_commercial.sql','20261126_slack_commercial.sql'])await pool.query(await readFile(new URL(`../../migrations/${file}`,import.meta.url),'utf8'))
})
beforeEach(async()=>{if(!url)return;await pool.query('TRUNCATE projete_slack_notifications,projete_slack_connections,projete_slack_state,lead_events,contact_notes RESTART IDENTITY CASCADE');await pool.query("UPDATE vendedor_projetos SET status_contato='Em Atendimento'");await pool.query('TRUNCATE lead_events RESTART IDENTITY')})
after(async()=>{if(!url)return;await getPool().end();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end()})

test('first activation skips historical approvals; new manual requests queue once',{skip:!url},async()=>{
 const{c,store}=await dbClient();try{
  await manual(c,10001,'Em Aprovação');await store.initialize();assert.equal(await store.approvals(),0)
  await manual(c,10001,'Em Atendimento');await manual(c,10001,'Em Aprovação')
  assert.equal(await store.approvals(),1);assert.equal(await store.approvals(),0)
  assert.match((await c.query('SELECT payload FROM projete_slack_notifications')).rows[0].payload.text,/Cliente Alfa/)
 }finally{c.release()}
})
test('a transaction committing after a higher event ID is captured',{skip:!url},async()=>{
 const{c,store}=await dbClient(),a=await pool.connect(),b=await pool.connect();try{
  await store.initialize();await a.query('BEGIN');await a.query("SELECT set_config('app.origem','manual',true)");await a.query("UPDATE vendedor_projetos SET status_contato='Em Aprovação' WHERE id=10001")
  await manual(b,10002,'Em Aprovação');assert.equal(await store.approvals(),1)
  await a.query('COMMIT');assert.equal(await store.approvals(),1)
 }finally{await a.query('ROLLBACK');a.release();b.release();c.release()}
})
test('concurrent workers cannot claim the same notification',{skip:!url},async()=>{
 const a=await dbClient(),b=await dbClient();try{
  await a.store.initialize();await a.store.enqueue('race','daily',config.channel,message)
  assert.equal((await Promise.all([a.store.claim(),b.store.claim()])).filter(Boolean).length,1)
 }finally{a.c.release();b.c.release()}
})
test('uncertain and interrupted deliveries are not automatically retried',{skip:!url},async()=>{
 const d=await dbClient();try{await d.store.initialize();await d.store.enqueue('uncertain','daily',config.channel,message)}finally{d.c.release()}
 const p=provider(async()=>{throw new Error('timeout after acceptance')});await job(p.client);await job(p.client);assert.equal(p.sent.length,1)
 assert.equal((await pool.query('SELECT status FROM projete_slack_notifications')).rows[0].status,'uncertain')
 const{c,store}=await dbClient();try{
  await store.enqueue('interrupted','daily',config.channel,message);await store.claim()
  await c.query("UPDATE projete_slack_notifications SET sending_at=now()-interval '4 minutes' WHERE notification_key='interrupted'")
  assert.equal(await store.claim(),null)
  assert.equal((await c.query("SELECT status FROM projete_slack_notifications WHERE notification_key='interrupted'")).rows[0].status,'uncertain')
 }finally{c.release()}
})
test('explicit throttling retries after its deadline and successful replay posts once',{skip:!url},async()=>{
 const d=await dbClient();try{await d.store.initialize();await d.store.enqueue('throttle','daily',config.channel,message)}finally{d.c.release()}
 const p=provider(async()=>new Response('',{status:429,headers:{'retry-after':'7'}}));await job(p.client);await job(p.client);assert.equal(p.sent.length,1)
 assert.equal((await pool.query('SELECT status FROM projete_slack_notifications')).rows[0].status,'retry')
 await pool.query("UPDATE projete_slack_notifications SET next_attempt_at=now()-interval '1 second'")
 const ok=provider();await job(ok.client);await job(ok.client);assert.equal(ok.sent.length,1)
 assert.equal((await pool.query('SELECT attempts FROM projete_slack_notifications')).rows[0].attempts,2)
})
test('approval changed before delivery is cancelled without posting',{skip:!url},async()=>{
 const{c,store}=await dbClient();try{await store.initialize();await manual(c,10001,'Em Aprovação');await store.approvals();await manual(c,10001,'Churn')}finally{c.release()}
 const p=provider();await job(p.client);assert.equal(p.sent.length,0)
 assert.equal((await pool.query('SELECT status FROM projete_slack_notifications')).rows[0].status,'cancelled')
})
test('one alert per persisted outage and one recovery; short outages stay silent',{skip:!url},async()=>{
 const{c,store}=await dbClient(),start=new Date('2026-11-26T10:00:00Z');try{
  await store.initialize();await store.observe('qr','QR','desconectado',start)
  await store.observe('qr','QR','conectado',new Date(+start+60000));assert.equal((await c.query('SELECT * FROM projete_slack_notifications')).rowCount,0)
  await store.observe('qr','QR','desconectado',new Date(+start+120000));await store.observe('qr','QR','desconectado',new Date(+start+240000));await store.observe('qr','QR','desconectado',new Date(+start+300000))
  const alert=await store.claim();assert.equal(alert.kind,'connection_down');await store.finish(alert.id,'sent',null,'123.456')
  await store.observe('qr','QR','conectado',new Date(+start+360000));await store.observe('qr','QR','conectado',new Date(+start+420000))
  assert.deepEqual((await c.query('SELECT kind FROM projete_slack_notifications ORDER BY id')).rows.map(x=>x.kind),['connection_down','connection_recovered'])
 }finally{c.release()}
})
test('recovery cancels an unsent disconnect instead of sending outdated alarms',{skip:!url},async()=>{
 const{c,store}=await dbClient(),start=new Date('2026-11-26T10:00:00Z');try{
  await store.initialize();await store.observe('qr','QR','indisponivel',start);await store.observe('qr','QR','indisponivel',new Date(+start+120000));await store.observe('qr','QR','conectado',new Date(+start+180000))
  assert.equal((await c.query('SELECT status FROM projete_slack_notifications')).rows[0].status,'cancelled');assert.equal(await store.claim(),null)
 }finally{c.release()}
})
test('daily snapshot freezes at configured cutoff and is not regenerated',{skip:!url},async()=>{
 let calls=0,cutoff;const activity=async(day,seller,through)=>{calls++;cutoff=through;return{consultores:[],data:day,fuso:'America/Sao_Paulo',voip_integrado:false}}
 const p=provider(),more={now:new Date('2026-11-26T21:01:00Z'),activity};await job(p.client,more);await job(p.client,more)
 assert.equal(calls,1);assert.equal(cutoff.toISOString(),'2026-11-26T21:00:00.000Z');assert.equal(p.sent.length,1)
})
test('commercial counts normalize CNPJ and exclude activity after cutoff',{skip:!url},async()=>{
 for(const[cnpj,time]of[['12.345.678/0001-90','17:00'],[clientA,'17:30'],['98765432000190','18:30']])await pool.query("INSERT INTO contact_notes(lead_cnpj,vendedor_id,tipo,created_at) VALUES($1,$2,'whatsapp',($3::date+$4::time) AT TIME ZONE 'America/Sao_Paulo')",[cnpj,alice,'2026-11-26',time])
 const r=await commercialActivity('2026-11-26',alice,new Date('2026-11-26T21:00:00Z'))
 assert.equal(r.consultores[0].contatos,1);assert.equal(r.consultores[0].registros,2)
 assert.equal((await commercialActivity('2026-11-26',alice)).consultores[0].contatos,2)
})
test('overlapping jobs skip before authentication or side effects',{skip:!url},async()=>{
 let started,release;const entered=new Promise(r=>started=r),gate=new Promise(r=>release=r),p=provider(),verify=p.client.verify.bind(p.client)
 p.client.verify=async()=>{started();await gate;await verify()};const running=job(p.client);await entered
 assert.deepEqual(await job(provider().client),{skipped:true,reason:'running'});release();await running
})
test('disabled integration performs no database or provider calls',{skip:!url},async()=>{
 const p=provider();assert.deepEqual(await runSlackJob({config:{...config,enabled:false},pool:{connect(){throw new Error('must not connect')}},client:p.client}),{skipped:true,reason:'disabled'});assert.equal(p.sent.length,0)
})

test('destination changes cancel queued snapshots rather than leaking into another channel',{skip:!url},async()=>{
 const{c,store}=await dbClient();try{
  await store.initialize();await store.enqueue('old-destination','daily',config.channel,message)
  const changed=new SlackStore(c,{...config,channel:'C00000002'})
  assert.equal(await changed.claim(),null)
  assert.equal((await c.query('SELECT status,error_code FROM projete_slack_notifications')).rows[0].error_code,'destination_changed')
 }finally{c.release()}
})

test('a worker losing its database lease stops before sending and cannot release the new owner',{skip:!url},async()=>{
 const owner=randomUUID(),p=provider(),verify=p.client.verify.bind(p.client)
 p.client.verify=async()=>{await verify();await pool.query("UPDATE projete_slack_state SET job_owner=$1,job_until=now()+interval '3 minutes' WHERE team_id=$2",[owner,config.teamId])}
 await assert.rejects(job(p.client),/job_lease_lost/)
 assert.equal(p.sent.length,0)
 assert.equal((await pool.query('SELECT job_owner FROM projete_slack_state')).rows[0].job_owner,owner)
})
