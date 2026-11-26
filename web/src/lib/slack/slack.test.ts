import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { configurationIssues, reportDue, slackConfig } from './config'
import { SlackClient, SlackError } from './client'
import { approvalMessage, connectionMessage, connectionTransition, dailyMessage } from './messages'
import { slackSignature } from './signature'
const config = () => slackConfig({ SLACK_COMMERCIAL_ENABLED:'true', SLACK_BOT_TOKEN:'xoxb-synthetic', SLACK_SIGNING_SECRET:'synthetic', SLACK_WORKSPACE_ID:'T00000001', SLACK_COMMERCIAL_CHANNEL_ID:'C00000001', SLACK_COMMERCIAL_REPORT_TIME:'18:00' })
test('activation requires explicit workspace, destinations, signing secret and report time', () => {
  const empty=slackConfig({})
  assert.equal(empty.enabled,false);assert.equal(empty.reportTime,'')
  assert.ok(configurationIssues(empty).length>=4)
  assert.deepEqual(configurationIssues(config()),[])
  assert.ok(configurationIssues({...config(),channel:'https://attacker.test'}).length)
  assert.ok(configurationIssues({...config(),approvalUser:'<!channel>'}).length)
})
test('daily cutoff follows Brasilia, business days and the configured minute', () => {
  const c=config()
  assert.equal(reportDue(new Date('2026-11-26T20:59:59Z'),c),null)
  assert.deepEqual(reportDue(new Date('2026-11-26T21:00:00Z'),c),{day:'2026-11-26',time:'18:00'})
  assert.equal(reportDue(new Date('2026-11-28T21:01:00Z'),c),null)
  assert.deepEqual(reportDue(new Date('2026-11-27T02:00:00Z'),c),{day:'2026-11-26',time:'18:00'})
})
test('provider outages are confirmed after two minutes and recovery requires a tracked incident', () => {
  const start=new Date('2026-11-26T12:00:00Z')
  assert.equal(connectionTransition(null,'desconectado',start),'pending')
  const pending={badSince:start,incident:null,lastChecked:start}
  assert.equal(connectionTransition(pending,'desconectado',new Date(+start+10000)),'ignore')
  assert.equal(connectionTransition(pending,'indisponivel',new Date(+start+60000)),'pending')
  assert.equal(connectionTransition(pending,'desconectado',new Date(+start+120000)),'down')
  assert.equal(connectionTransition({...pending,incident:'tracked'},'desconectado',new Date(+start+180000)),'pending')
  assert.equal(connectionTransition({...pending,incident:'tracked'},'conectado',new Date(+start+180000)),'recovered')
  assert.equal(connectionTransition(pending,'conectado',new Date(+start+60000)),'healthy')
})
test('CRM text cannot inject Slack mentions and links always point to authenticated Projete pages', () => {
  const m=approvalMessage({nome:'<!channel> & <script>',cnpj:'12.345.678/0001-90',consultor:'<@OTHER>',lead_id:10},'U00000001')
  assert.ok(!m.text.includes('<!channel>'))
  assert.equal((m.blocks[1].text as {type:string}).type,'plain_text')
  assert.equal((m.blocks[2].elements as {url:string}[])[0].url,'https://projete.projetus.org/lead/12345678000190')
  assert.match(connectionMessage('Consultorias','indisponivel',false,null).text,/não confirma/)
  const daily=dailyMessage('2026-11-26','18:00',[],3)
  assert.match(daily.text,/até 18:00/);assert.match(daily.text,/momento da geração: 3/)
})
test('Slack bot authentication is pinned to the configured workspace', async () => {
  const methods:string[]=[]
  const client=new SlackClient('xoxb-synthetic','T00000001',async (url,init)=>{
    methods.push(String(url));assert.equal(new Headers(init?.headers).get('authorization'),'Bearer xoxb-synthetic')
    return Response.json({ok:true,team_id:'T00000002',bot_id:'B00000001'})
  })
  await assert.rejects(client.verify(),e=>e instanceof SlackError&&e.code==='workspace_mismatch')
  assert.equal(methods.length,1)
})
test('only explicit throttling retries; timeouts and incomplete confirmations remain uncertain', async () => {
  const post = (request:typeof fetch) => new SlackClient('xoxb-synthetic','T00000001',request).post('C00000001',{text:'Teste',blocks:[]})
  await assert.rejects(post(async()=>new Response('',{status:429,headers:{'retry-after':'17'}})),e=>e instanceof SlackError&&e.outcome==='retry'&&e.retryAfter===17)
  await assert.rejects(post(async()=>{throw new Error('private transport details')}),e=>e instanceof SlackError&&e.outcome==='uncertain'&&!e.message.includes('private'))
  await assert.rejects(post(async()=>Response.json({ok:true})),e=>e instanceof SlackError&&e.outcome==='uncertain')
  await assert.rejects(post(async()=>Response.json({ok:false,error:'not_in_channel'})),e=>e instanceof SlackError&&e.outcome==='failed')
  assert.equal(await post(async()=>Response.json({ok:true,channel:'C00000001',ts:'123.456'})),'123.456')
})
test('Slack requests require an authentic signature, recent timestamp and unchanged raw body', () => {
  const raw='payload=%7B%22type%22%3A%22block_actions%22%7D', timestamp='1795708800', secret='synthetic-signing-secret'
  const signature=`v0=${createHmac('sha256',secret).update(`v0:${timestamp}:${raw}`).digest('hex')}`
  const headers=new Headers({'x-slack-request-timestamp':timestamp,'x-slack-signature':signature})
  assert.equal(slackSignature(headers,raw,secret,Number(timestamp)*1000),true)
  assert.equal(slackSignature(headers,raw+'x',secret,Number(timestamp)*1000),false)
  assert.equal(slackSignature(headers,raw,secret,Number(timestamp)*1000+301000),false)
  assert.equal(slackSignature(headers,raw,undefined,Number(timestamp)*1000),false)
})
