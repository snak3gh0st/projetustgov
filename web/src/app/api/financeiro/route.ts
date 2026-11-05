import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { financeFailure,PRIVATE_HEADERS,requireFinance } from '@/lib/finance/api'
import { connectorReadiness,financeRuntime,hotmartClient } from '@/lib/finance/runtime'
import { DEFAULT_SETTINGS } from '@/lib/finance/store'
import { FinanceError,isoDate,toCents } from '@/lib/finance/domain'
import { normalizeContaAzul } from '@/lib/finance/providers'

export const dynamic='force-dynamic'
export const maxDuration=300
const uuid=z.string().uuid()
const externalId=z.union([uuid,z.string().regex(/^\d{1,40}$/)])
const date=z.string().refine(v=>{try{isoDate(v);return true}catch{return false}},'Data inválida')
const reason=z.string().trim().min(10).max(2000)
const optionalId=z.union([externalId,z.literal('')]).default('')
const settingsSchema=z.object({writesEnabled:z.boolean(),companyConfirmed:z.boolean(),financialAccountId:optionalId,
  receivableCategoryId:optionalId,payableCategoryId:optionalId,reportRecipientId:optionalId,dailyEmailEnabled:z.boolean(),
  statementsEnabled:z.boolean(),affiliateMap:z.record(z.string().max(200),uuid),accountFingerprint:z.string().max(200),
  hotmartRules:z.record(z.string().regex(/^\d+$/),z.object({billingMode:z.enum(['single','fixed','subscription']),count:z.number().int().min(1).max(120),dueOffsetDays:z.number().int().min(0).max(365)}).refine(r=>r.billingMode==='fixed'||r.count===1,'Assinaturas e pagamentos únicos têm uma cobrança por transação.'))}).strict()

export async function GET(){
  try{
    await requireFinance()
    const {store,engine}=financeRuntime()
    const [data,report]=await Promise.all([store.list(),engine.report()])
    return NextResponse.json({...data,report,readiness:connectorReadiness()},{headers:PRIVATE_HEADERS})
  }catch(e){return financeFailure(e)}
}
export async function POST(request:NextRequest){
  try{
    const session=await requireFinance(request)
    const {store,engine,contaAzul,refreshMirror}=financeRuntime()
    const raw=await request.json()
    const action=z.string().parse(raw.action)
    let result:unknown={ok:true}
    switch(action){
      case 'settings':{
        const settings=settingsSchema.parse({...DEFAULT_SETTINGS,...raw.settings})
        settings.accountFingerprint=(await store.settings()).accountFingerprint
        if(settings.companyConfirmed)settings.accountFingerprint=await engine.checkAccount(contaAzul)
        await store.saveSettings(settings,session.userId);break
      }
      case 'import_crm':{
        const p=z.object({cursor:z.number().int().nonnegative().default(0)}).parse(raw)
        result=await store.importCrm(p.cursor);break
      }
      case 'import_hotmart':case 'pull':{
        const p=z.object({from:date,to:date}).parse(raw)
        if(p.from>p.to)throw new FinanceError('Intervalo inválido.')
        result=action==='pull'?await refreshMirror(p.from,p.to):await engine.importHotmart(hotmartClient(),p.from,p.to)
        break
      }
      case 'push':result=await engine.push(contaAzul);break
      case 'schedule':{
        const p=z.object({saleId:uuid,count:z.number().int().min(1).max(120),firstDate:date,billingMode:z.enum(['single','fixed','subscription']),remotePersonId:optionalId}).parse(raw)
        result=await store.confirmSchedule(p.saleId,p,session.userId);break
      }
      case 'release':{
        const p=z.object({id:uuid,date,evidence:reason}).parse(raw)
        await store.releaseCommission(p.id,p.date,p.evidence,session.userId);break
      }
      case 'close':{
        const p=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).parse(raw)
        result=await store.closeMonth(p.period,session.userId);break
      }
      case 'sale_details':{
        const p=z.object({id:uuid,document:z.string().max(30),email:z.union([z.string().email(),z.literal('')]),remotePersonId:optionalId}).parse(raw)
        await store.transaction(async c=>{
          const r=await c.query('UPDATE finance_sales SET customer_document=$3,customer_email=$4,remote_person_id=$5,updated_at=now() WHERE tenant_key=$1 AND id=$2 RETURNING id',
            [store.tenant,p.id,p.document.replace(/\D/g,''),p.email,p.remotePersonId||null])
          if(!r.rowCount)throw new FinanceError('Venda não encontrada.',404)
          await c.query('UPDATE finance_entries SET remote_person_id=$3 WHERE tenant_key=$1 AND sale_id=$2 AND remote_id IS NULL',[store.tenant,p.id,p.remotePersonId||null])
          await store.audit(c,session.userId,'sale.details.updated',p.id)
        });break
      }
      case 'person':{
        const p=z.object({userId:uuid,remotePersonId:externalId}).parse(raw)
        await store.transaction(async c=>{
          if(!(await c.query('SELECT 1 FROM users WHERE id=$1 AND active',[p.userId])).rowCount)throw new FinanceError('Usuário inativo ou inexistente.')
          await c.query(`INSERT INTO finance_people(tenant_key,user_id,remote_person_id) VALUES($1,$2,$3)
            ON CONFLICT(tenant_key,user_id) DO UPDATE SET remote_person_id=EXCLUDED.remote_person_id`,[store.tenant,p.userId,p.remotePersonId])
          await c.query('UPDATE finance_entries SET remote_person_id=$3 WHERE tenant_key=$1 AND beneficiary_id=$2 AND remote_id IS NULL',[store.tenant,p.userId,p.remotePersonId])
          await store.audit(c,session.userId,'person.linked',p.userId,{remotePersonId:p.remotePersonId})
        });break
      }
      case 'hotmart_seller':{
        const p=z.object({code:z.string().trim().min(1).max(200),userId:uuid}).parse(raw)
        const u=(await store.rows('SELECT nome FROM users WHERE id=$1 AND active',[p.userId]))[0]
        if(!u)throw new FinanceError('Beneficiário inativo ou inexistente.')
        const settings=await store.settings()
        await store.saveSettings({...settings,affiliateMap:{...settings.affiliateMap,[p.code]:p.userId}},session.userId)
        await store.transaction(async c=>{
          await c.query(`UPDATE finance_commissions cm SET beneficiary_id=$3,beneficiary_name=$4,updated_at=now()
            FROM finance_sales s WHERE cm.tenant_key=$1 AND cm.sale_id=s.id AND s.tenant_key=$1 AND s.origin='hotmart'
            AND s.snapshot->>'affiliateCode'=$2 AND cm.status='calculated'`,[store.tenant,p.code,p.userId,u.nome])
          await store.audit(c,session.userId,'hotmart.seller.linked',p.userId,{code:p.code})
        });break
      }
      case 'add_commission':{
        const p=z.object({saleId:uuid,requestId:uuid,userId:uuid,amount:z.union([z.string(),z.number()]),role:z.enum(['consultor','gestor','afiliado']),evidence:reason,paidByHotmart:z.boolean().default(false)}).parse(raw)
        const cents=toCents(p.amount)
        if(!cents)throw new FinanceError('Comissão deve ser positiva.')
        await store.transaction(async c=>{
          const sale=(await c.query("SELECT id FROM finance_sales WHERE tenant_key=$1 AND id=$2 AND status='active' FOR UPDATE",[store.tenant,p.saleId])).rows[0]
          const u=(await c.query('SELECT nome FROM users WHERE id=$1 AND active',[p.userId])).rows[0]
          if(!sale||!u)throw new FinanceError('Venda ou beneficiário inválido.')
          await c.query(`INSERT INTO finance_commissions(tenant_key,source_ref,sale_id,beneficiary_id,beneficiary_name,role,amount_cents,evidence,paid_by_hotmart)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant_key,source_ref) DO NOTHING`,
            [store.tenant,`manual:${p.requestId}`,p.saleId,p.userId,u.nome,p.role,cents,p.evidence,p.paidByHotmart])
          await store.audit(c,session.userId,'commission.added',p.saleId,{amountCents:cents,beneficiaryId:p.userId,evidence:p.evidence})
        });break
      }
      case 'commission_details':{
        const p=z.object({id:uuid,userId:uuid,paidByHotmart:z.boolean(),evidence:reason}).parse(raw)
        await store.transaction(async c=>{
          const r=await c.query(`UPDATE finance_commissions cm SET beneficiary_id=u.id,beneficiary_name=u.nome,paid_by_hotmart=$4,evidence=$5,updated_at=now()
            FROM users u WHERE cm.tenant_key=$1 AND cm.id=$2 AND cm.status='calculated' AND u.id=$3 AND u.active RETURNING cm.id`,[store.tenant,p.id,p.userId,p.paidByHotmart,p.evidence])
          if(!r.rowCount)throw new FinanceError('Comissão já liberada ou beneficiário inválido.',409)
          await store.audit(c,session.userId,'commission.details.updated',p.id,{beneficiaryId:p.userId,paidByHotmart:p.paidByHotmart})
        });break
      }
      case 'invoice':{
        const p=z.object({id:uuid,number:z.string().trim().min(1).max(100),date,url:z.union([z.literal(''),z.string().url().refine(v=>/^https?:\/\//.test(v))])}).parse(raw)
        await store.transaction(async c=>{
          const r=await c.query(`UPDATE finance_entries SET invoice_number=$3,invoice_date=$4,invoice_url=$5,updated_at=now()
            WHERE tenant_key=$1 AND id=$2 AND kind='receivable' RETURNING id`,[store.tenant,p.id,p.number,p.date,p.url||null])
          if(!r.rowCount)throw new FinanceError('Recebível não encontrado.',404)
          await store.audit(c,session.userId,'invoice.recorded',p.id,{number:p.number,date:p.date})
        });break
      }
      case 'retry':{
        const p=z.object({id:uuid}).parse(raw)
        const r=await store.rows(`UPDATE finance_jobs SET status='pending',last_error=NULL,updated_at=now() WHERE tenant_key=$1 AND id=$2 AND status='failed' RETURNING id`,[store.tenant,p.id])
        if(!r.length)throw new FinanceError('Somente falhas definitivas podem ser reenviadas. Resultados desconhecidos exigem conciliação.',409)
        break
      }
      case 'reconcile':{
        const p=z.object({id:uuid,remoteId:externalId}).parse(raw)
        await engine.checkAccount(contaAzul)
        const local=(await store.rows('SELECT kind,due_date::text FROM finance_entries WHERE tenant_key=$1 AND id=$2',[store.tenant,p.id]))[0]
        if(!local)throw new FinanceError('Lançamento não encontrado.',404)
        const items=await contaAzul.listEntries(local.kind,local.due_date,local.due_date)
        const item=items.find(r=>r.id===p.remoteId)
        if(!item)throw new FinanceError('Parcela não encontrada na Conta Azul neste vencimento.')
        result=await engine.reconcile(normalizeContaAzul(item,await contaAzul.detail(p.remoteId),local.kind),session.userId,p.id)
        break
      }
      case 'ack_review':{
        const p=z.object({id:uuid,evidence:reason}).parse(raw)
        await store.transaction(async c=>{
          const r=await c.query(`UPDATE finance_sales SET needs_review=NULL,updated_at=now() WHERE tenant_key=$1 AND id=$2 AND status='active' AND schedule_confirmed RETURNING id`,[store.tenant,p.id])
          if(!r.rowCount)throw new FinanceError('Venda precisa de calendário confirmado e situação ativa.')
          await store.audit(c,session.userId,'sale.reviewed',p.id,{evidence:p.evidence})
        });break
      }
      default:throw new FinanceError('Ação financeira desconhecida.')
    }
    return NextResponse.json(result??{ok:true},{headers:PRIVATE_HEADERS})
  }catch(e){return financeFailure(e)}
}
