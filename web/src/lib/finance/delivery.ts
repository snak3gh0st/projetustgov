import { businessDate, FinanceError } from './domain.ts'
import { FinanceEngine } from './engine.ts'
import { FinanceStore } from './store.ts'

type EmailSender=(input:{to:string;subject:string;html:string;key:string})=>Promise<string>
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100)

export async function deliverOnce(store:FinanceStore,key:string,send:()=>Promise<string>){
  await store.rows(`UPDATE finance_deliveries SET status='uncertain',error='Envio interrompido; conferir o canal antes de reenviar.',updated_at=now()
    WHERE tenant_key=$1 AND delivery_key=$2 AND status='sending' AND created_at<now()-interval '5 minutes'`,[store.tenant,key])
  const claimed=await store.rows(`INSERT INTO finance_deliveries(tenant_key,delivery_key,status) VALUES($1,$2,'sending') ON CONFLICT DO NOTHING RETURNING delivery_key`,[store.tenant,key])
  if(!claimed.length)return{skipped:true}
  try{
    const id=await send()
    await store.rows("UPDATE finance_deliveries SET status='sent',provider_id=$3,updated_at=now() WHERE tenant_key=$1 AND delivery_key=$2",[store.tenant,key,id])
    return{sent:true}
  }catch(error){
    // A missing response can mean the message was accepted. Never repeat automatically.
    await store.rows("UPDATE finance_deliveries SET status='uncertain',error=$3,updated_at=now() WHERE tenant_key=$1 AND delivery_key=$2",[store.tenant,key,error instanceof Error?error.message:'Falha de entrega'])
    throw error
  }
}

export async function dailyReport(store:FinanceStore,engine:FinanceEngine,send:EmailSender,slack?: (text:string)=>Promise<string>){
  const settings=await store.settings(),report=await engine.report()
  const s=report.summary
  const rows=[['A receber hoje',s.receivableTodayCents],['A pagar hoje',s.payableTodayCents],['Recebimentos hoje (baixas)',s.receivedTodayCents],
    ['Pagamentos hoje (baixas)',s.paidTodayCents],['Recebíveis vencidos',s.overdueReceivableCents],['Pagáveis vencidos',s.overduePayableCents],
    ['A receber nos próximos 7 dias',s.upcomingReceivableCents],['A pagar nos próximos 7 dias',s.upcomingPayableCents],
    ['Previsões locais a receber (fora dos totais ERP)',s.unsyncedReceivableCents],['Previsões locais a pagar (fora dos totais ERP)',s.unsyncedPayableCents]] as const
  const results:unknown[]=[]
  if(settings.dailyEmailEnabled){
    const user=(await store.rows("SELECT id,nome,email FROM users WHERE id=$1 AND active AND role IN ('gestor','admin','gestor_financeiro')",[settings.reportRecipientId||null]))[0]
    if(!user?.email)throw new FinanceError('Destinatário do relatório financeiro indisponível.',409)
    const key=`daily:${report.date}:email:${user.id}`
    results.push(await deliverOnce(store,key,()=>send({to:user.email,subject:`Projete · Financeiro ${report.date}`,key:`${store.tenant}:${key}`,
      html:`<h1>Financeiro · ${escape(report.date)}</h1><p>Olá, ${escape(user.nome)}.</p><p>Atualização Conta Azul: ${escape(report.lastSync??'não realizada')}. Intervalo de vencimentos importado: ${escape(report.coverage?.from??'—')} a ${escape(report.coverage?.to??'—')}.</p>${report.warnings.map(w=>`<p><strong>${escape(w)}</strong></p>`).join('')}<table>${rows.map(([name,value])=>`<tr><td>${escape(name)}</td><td>${money(value)}</td></tr>`).join('')}</table><p>Recebimentos e pagamentos realizados usam as datas das baixas detalhadas no ERP.</p>`})))
  }
  if(slack){
    const text=`Projete · Financeiro ${report.date}\n${rows.map(([name,value])=>`${name}: ${money(value)}`).join('\n')}\nAtualização: ${report.lastSync??'não sincronizado'}\n${report.warnings.join('\n')}`
    results.push(await deliverOnce(store,`daily:${report.date}:slack`,()=>slack(text)))
  }
  return{date:report.date,deliveries:results}
}

export async function commissionStatements(store:FinanceStore,send:EmailSender){
  if(!(await store.settings()).statementsEnabled)return{skipped:true}
  const closings=await store.rows('SELECT *,due_date::text FROM finance_closings WHERE tenant_key=$1 ORDER BY period DESC',[store.tenant])
  let sent=0
  for(const closing of closings){
    const ids=Array.from(new Set<string>(closing.snapshot.map((i:Record<string,any>)=>i.beneficiary_id)))
    for(const id of ids){
      const u=(await store.rows('SELECT nome,email FROM users WHERE id=$1 AND active',[id]))[0]
      if(!u?.email)continue
      const items=closing.snapshot.filter((i:Record<string,any>)=>i.beneficiary_id===id)
      const key=`statement:${closing.id}:${id}`
      const r=await deliverOnce(store,key,()=>send({to:u.email,key,subject:`Projete · Demonstrativo de comissões ${closing.period}`,
        html:`<h1>Demonstrativo de comissões · ${escape(closing.period)}</h1><p>${escape(u.nome)}, valor aprovado: ${money(items.reduce((a:number,i:Record<string,any>)=>a+Number(i.amount_cents),0))}. Vencimento previsto: ${escape(String(closing.due_date).slice(0,10))}.</p><table>${items.map((i:Record<string,any>)=>`<tr><td>${escape(i.origin)} · ${escape(i.sale_description)} · ${escape(i.role)}</td><td>${money(Number(i.amount_cents))}</td></tr>`).join('')}</table><p>Este demonstrativo registra o fechamento aprovado. O pagamento é confirmado separadamente.</p>`}))
      if('sent' in r)sent++
    }
  }
  return{sent,date:businessDate()}
}
