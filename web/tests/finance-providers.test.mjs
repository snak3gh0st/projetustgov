import test from 'node:test'
import assert from 'node:assert/strict'
const p = await import('../src/lib/finance/providers.ts').catch(() => ({}))
const uuid = '00000000-0000-4000-8000-000000000001'
test('Conta Azul paginates through all records instead of stopping at the first page', async () => {
  assert.equal(typeof p.ContaAzulClient,'function')
  const fetcher = async url => {
    const page = Number(new URL(url).searchParams.get('pagina'))
    return Response.json({itens_totais:101,itens:Array.from({length:page===1?100:1},(_,i)=>({id:`${page}-${i}`}))})
  }
  const client = new p.ContaAzulClient(async ()=>'test',fetcher)
  const records = await client.listEntries('receivable','2026-10-01','2026-11-30')
  assert.equal(records.length,101)
  assert.equal(records[100].id,'2-0')
})
test('Conta Azul creation uses the current synchronous contract and a stable external reference', async () => {
  assert.equal(typeof p.ContaAzulClient,'function')
  let actual
  const client = new p.ContaAzulClient(async ()=>'test',async (url,init)=>{
    actual={url,body:JSON.parse(init.body)}
    return Response.json({id:uuid,condicao_pagamento:{parcelas:[{id:uuid}]}},{status:201})
  })
  const result = await client.createEntry({id:uuid,kind:'payable',description:'Comissões',amount_cents:800,competence_date:'2026-10-01',due_date:'2026-11-15',remote_person_id:uuid},
    {financialAccountId:uuid,payableCategoryId:uuid,receivableCategoryId:uuid})
  assert.equal(actual.url,'https://api-v2.contaazul.com/v1/financeiro/contas-a-pagar')
  assert.equal(actual.body.id_fornecedor,uuid)
  assert.equal(actual.body.valor,8)
  assert.equal(actual.body.referencia_externa,`projete:${uuid}`)
  assert.equal(actual.body.condicao_pagamento.parcelas[0].nota,`Projete:${uuid}`)
  assert.equal(result.installmentId,uuid)
})
test('a timeout or malformed success after POST is uncertain and cannot be retried blindly', async () => {
  assert.equal(typeof p.ContaAzulClient,'function')
  const client = new p.ContaAzulClient(async ()=>'test',async ()=>{throw new Error('timeout')})
  await assert.rejects(client.request('/v1/financeiro/contas-a-receber','POST',{}),e=>e.uncertain===true)
  const malformed = new p.ContaAzulClient(async ()=>'test',async ()=>Response.json({protocolo:uuid},{status:202}))
  await assert.rejects(malformed.createEntry({id:uuid,kind:'receivable',amount_cents:100,remote_person_id:uuid},{financialAccountId:uuid,receivableCategoryId:uuid}),e=>e.uncertain===true)
})
test('Conta Azul partial payments preserve actual dated settlements', () => {
  assert.equal(typeof p.normalizeContaAzul,'function')
  const e=p.normalizeContaAzul({id:uuid,total:100,pago:40,nao_pago:60,data_vencimento:'2026-11-05',data_competencia:'2026-10-01',status_traduzido:'RECEBIDO_PARCIAL',cliente:{id:uuid,nome:'Cliente'}},
    {baixas:[{data_pagamento:'2026-11-02',valor_composicao:{valor_liquido:10}},{data_pagamento:'2026-11-05',valor_composicao:{valor_liquido:30}}]},'receivable')
  assert.equal(e.status,'partial')
  assert.equal(e.amountCents,10000)
  assert.deepEqual(e.payments,[{date:'2026-11-02',amountCents:1000},{date:'2026-11-05',amountCents:3000}])
})
test('Hotmart history requests canceled/refunded transactions and follows cursors',async()=>{
  assert.equal(typeof p.HotmartClient,'function')
  let pages=0
  const client=new p.HotmartClient(async()=>'test',async url=>{
    assert.ok(new URL(url).searchParams.has('transaction_status'))
    pages++
    return Response.json({items:[{purchase:{transaction:`HP${pages}`}}],page_info:pages===1?{next_page_token:'next'}:{}})
  })
  const result=await client.history('2026-10-01','2026-11-01',['APPROVED'])
  assert.equal(result.length,2)
})

test('Hotmart commission details preserve participant identity and actual BRL values',async()=>{
  assert.equal(typeof p.HotmartClient.prototype.commissions,'function')
  const client=new p.HotmartClient(async()=>'test',async url=>{
    assert.equal(new URL(url).pathname,'/payments/api/v1/sales/commissions')
    assert.equal(new URL(url).searchParams.get('transaction'),'HP001')
    return Response.json({items:[{transaction:'HP001',commissions:[{source:'AFFILIATE',user:{ucode:'affiliate-user',name:'Vendedor'},commission:{value:25,currency_value:'BRL'}}]}],page_info:{}})
  })
  assert.deepEqual(await client.commissions('HP001'),[{source:'AFFILIATE',user:{ucode:'affiliate-user',name:'Vendedor'},value:25,currency_value:'BRL'}])
})
