import { FinanceError, isoDate, toCents, type EntryStatus, type Payment } from './domain.ts'
import type { FinanceSettings } from './store.ts'

type Row = Record<string, any>
type Fetcher = typeof fetch
export class ProviderError extends FinanceError {
  uncertain: boolean
  constructor(message: string, status: number, uncertain = false) { super(message,status); this.uncertain=uncertain }
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function requireExternalId(value: unknown): string {
  if (typeof value !== 'string' || !(uuidPattern.test(value)||/^\d{1,40}$/.test(value))) throw new FinanceError('Identificador externo inválido.')
  return value
}

export class ContaAzulClient {
  token: () => Promise<string>
  fetcher: Fetcher
  constructor(token: () => Promise<string>, fetcher: Fetcher = fetch) { this.token=token; this.fetcher=fetcher }
  async request(path: string, method = 'GET', body?: unknown): Promise<Row> {
    // Acquire credentials before a write is attempted: an auth/config failure is definitive.
    const token = await this.token()
    let response: Response
    try {
      response = await this.fetcher(`https://api-v2.contaazul.com${path}`, { method, cache:'no-store',signal:AbortSignal.timeout(25000),
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}) })
    } catch { throw new ProviderError('Conta Azul: conexão interrompida. Conferir resultado antes de reenviar.',502,method!=='GET') }
    if (!response.ok) throw new ProviderError(`Conta Azul respondeu HTTP ${response.status}.`,response.status,method!=='GET' && response.status>=500)
    try { return await response.json() }
    catch { throw new ProviderError('Conta Azul retornou resposta inválida.',502,method!=='GET') }
  }
  async listEntries(kind: 'receivable'|'payable', from: string, to: string): Promise<Row[]> {
    isoDate(from);isoDate(to)
    const records:Row[]=[]
    for(let page=1;page<=100;page++) {
      const q=new URLSearchParams({pagina:String(page),tamanho_pagina:'100',data_vencimento_de:from,data_vencimento_ate:to})
      const result=await this.request(`/v1/financeiro/eventos-financeiros/${kind==='receivable'?'contas-a-receber':'contas-a-pagar'}/buscar?${q}`)
      if(!Array.isArray(result.itens)||!Number.isInteger(result.itens_totais)) throw new ProviderError('Formato de listagem Conta Azul não reconhecido.',502)
      records.push(...result.itens)
      if(records.length>=result.itens_totais) return records
      if(result.itens.length===0) throw new ProviderError('Conta Azul: paginação incompleta.',502)
    }
    throw new ProviderError('Conta Azul: intervalo excede 10.000 parcelas; reduza o período.',422)
  }
  detail(id:string) { return this.request(`/v1/financeiro/eventos-financeiros/parcelas/${requireExternalId(id)}`) }
  async accountIdentity(){
    const c=await this.request('/v1/pessoas/conta-conectada')
    if(!c.id_empresa||!c.documento)throw new FinanceError('A Conta Azul não retornou a identificação da empresa conectada.',502)
    return `${c.id_empresa}:${String(c.documento).replace(/\D/g,'')}`
  }
  async resolveCustomer(sale:Row):Promise<string> {
    const doc=String(sale.customer_document).replace(/\D/g,'')
    if(![11,14].includes(doc.length)) throw new FinanceError('Complete o CPF/CNPJ do cliente ou vincule uma pessoa da Conta Azul antes do envio.')
    const result=await this.request(`/v1/pessoas?${new URLSearchParams({pagina:'1',tamanho_pagina:'100',documentos:doc,tipos_pessoa:doc.length===11?'Física':'Jurídica'})}`)
    if(!Array.isArray(result.items)) throw new ProviderError('Formato de pessoas Conta Azul não reconhecido.',502)
    if(result.items.length>1) throw new FinanceError('Mais de uma pessoa encontrada na Conta Azul; faça o vínculo manual.')
    if(result.items.length===1) return requireExternalId(result.items[0].id)
    const created=await this.request('/v1/pessoas','POST',{nome:sale.customer_name,tipo_pessoa:doc.length===11?'Física':'Jurídica',
      [doc.length===11?'cpf':'cnpj']:doc,...(sale.customer_email?{email:sale.customer_email}:{}),perfis:[{tipo_perfil:'Cliente'}],ativo:true})
    if(!uuidPattern.test(created.id)) throw new ProviderError('Cliente criado sem identificador reconhecido. Conciliar antes de reenviar.',502,true)
    return created.id
  }
  async createEntry(entry:Row,settings:Pick<FinanceSettings,'financialAccountId'|'receivableCategoryId'|'payableCategoryId'>) {
    const value=Number(entry.amount_cents)/100
    const key=`projete:${entry.id}`
    const body={descricao:entry.description,data_competencia:String(entry.competence_date).slice(0,10),valor:value,
      conta_financeira:settings.financialAccountId,[entry.kind==='payable'?'id_fornecedor':'id_cliente']:entry.remote_person_id,
      referencia_externa:key,observacao:key,rateio:[{id_categoria:entry.kind==='payable'?settings.payableCategoryId:settings.receivableCategoryId,valor:value}],
      condicao_pagamento:{parcelas:[{descricao:entry.description,data_vencimento:String(entry.due_date).slice(0,10),
        conta_financeira:settings.financialAccountId,nota:`Projete:${entry.id}`,detalhe_valor:{valor_bruto:value}}]}}
    const r=await this.request(`/v1/financeiro/${entry.kind==='payable'?'contas-a-pagar':'contas-a-receber'}`,'POST',body)
    const installmentId=r.condicao_pagamento?.parcelas?.[0]?.id
    if(!uuidPattern.test(r.id)||!uuidPattern.test(installmentId)) throw new ProviderError('Criação sem IDs de evento/parcela. Conciliar antes de reenviar.',502,true)
    return {eventId:r.id,installmentId}
  }
}

export function normalizeContaAzul(item:Row,detail:Row,kind:'receivable'|'payable') {
  requireExternalId(item.id)
  const status=String(item.status_traduzido??detail.status??item.status)
  const amountCents=toCents(item.total)
  const settledCents=toCents(item.pago??0)
  if(amountCents<=0) throw new FinanceError('Parcela Conta Azul sem valor positivo.')
  const payments:Payment[]=(detail.baixas??[]).map((b:Row)=>({date:isoDate(b.data_pagamento),amountCents:toCents(b.valor_composicao?.valor_liquido)}))
  const normalized:EntryStatus=['PERDIDO','CANCELADO','RENEGOCIADO'].includes(status)?'canceled'
    :['RECEBIDO','QUITADO','PAID'].includes(status)?'paid'
    :['RECEBIDO_PARCIAL','PARTIALLY_PAID'].includes(status)?'partial'
    :['EM_ABERTO','PENDENTE','ATRASADO','OVERDUE','PENDING'].includes(status)?'open':'review'
  return {remoteId:item.id,eventId:detail.evento?.id??null,kind,description:String(item.descricao??detail.descricao??'Lançamento Conta Azul'),
    customerName:String((item.cliente??item.fornecedor)?.nome??''),remotePersonId:(item.cliente??item.fornecedor)?.id??null,
    amountCents,settledCents,dueDate:isoDate(item.data_vencimento),competenceDate:isoDate(item.data_competencia??detail.evento?.data_competencia??item.data_vencimento),
    status:normalized,payments,paidDate:payments.length?payments.map(p=>p.date).sort().at(-1):null,
    localEntryId:/^Projete:([0-9a-f-]{36})$/i.exec(String(detail.nota??''))?.[1]??null}
}

export class HotmartClient {
  token: () => Promise<string>
  fetcher: Fetcher
  products:string[]
  constructor(token:()=>Promise<string>,fetcher:Fetcher=fetch,products:string[] = []) { this.token=token;this.fetcher=fetcher;this.products=products }
  async commissions(transaction:string):Promise<Row[]>{
    const token=await this.token(),result:Row[]=[]
    let cursor='';const seen=new Set<string>()
    for(let page=0;page<100;page++){
      const q=new URLSearchParams({transaction,max_results:'100'})
      if(cursor)q.set('page_token',cursor)
      const r=await this.fetcher(`https://developers.hotmart.com/payments/api/v1/sales/commissions?${q}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(25000)})
      if(!r.ok)throw new ProviderError(`Comissões Hotmart responderam HTTP ${r.status}.`,r.status)
      const data=await r.json()
      if(!Array.isArray(data.items))throw new ProviderError('Hotmart retornou comissões em formato inválido.',502)
      for(const item of data.items)if(item.transaction===transaction)for(const c of item.commissions??[]){
        result.push({source:c.source,user:c.user,value:c.commission?.value,currency_value:c.commission?.currency_value})
      }
      cursor=data.page_info?.next_page_token??''
      if(!cursor)return result
      if(seen.has(cursor))throw new ProviderError('Hotmart repetiu cursor de comissões.',502)
      seen.add(cursor)
    }
    throw new ProviderError('Detalhamento de comissões excedeu o limite de paginação.',422)
  }
  async history(from:string,to:string,statuses=['APPROVED','COMPLETE','CANCELLED','REFUNDED','CHARGEBACK','OVERDUE','PARTIALLY_REFUNDED','EXPIRED','WAITING_PAYMENT']):Promise<Row[]> {
    isoDate(from);isoDate(to)
    const token=await this.token()
    const result:Row[]=[]
    for(const product of this.products.length?this.products:[''])for(const status of statuses){
    let cursor='';const seen=new Set<string>()
    for(let page=0;page<100;page++) {
      const q=new URLSearchParams({max_results:'100',start_date:String(Date.parse(`${from}T00:00:00-03:00`)),
        end_date:String(Date.parse(`${to}T23:59:59-03:00`)),transaction_status:status})
      if(product)q.set('product_id',product)
      if(cursor)q.set('page_token',cursor)
      const r=await this.fetcher(`https://developers.hotmart.com/payments/api/v1/sales/history?${q}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(25000)})
      if(!r.ok) throw new ProviderError(`Hotmart respondeu HTTP ${r.status}.`,r.status)
      const data=await r.json()
      if(!Array.isArray(data.items)) throw new ProviderError('Hotmart retornou histórico inválido.',502)
      result.push(...data.items)
      cursor=data.page_info?.next_page_token??''
      if(!cursor)break
      if(seen.has(cursor))throw new ProviderError('Hotmart repetiu cursor de paginação.',502)
      seen.add(cursor)
      if(page===99)throw new ProviderError('Histórico Hotmart excede 10.000 transações; reduza o período.',422)
    }
    }
    return result
  }
}
