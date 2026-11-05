import { NextRequest,NextResponse } from 'next/server'
import { requireCron } from '@/lib/finance/access'
import { financeFailure,PRIVATE_HEADERS } from '@/lib/finance/api'
import { financeRuntime,hotmartClient,connectorReadiness } from '@/lib/finance/runtime'
import { dailyReport,commissionStatements } from '@/lib/finance/delivery'
import { businessDate,FinanceError } from '@/lib/finance/domain'

export const dynamic='force-dynamic'
export const maxDuration=300

async function sendEmail(input:{to:string;subject:string;html:string;key:string}){
  if(!process.env.RESEND_API_KEY)throw new FinanceError('Canal de e-mail não configurado.',409)
  const {Resend}=await import('resend')
  const r=await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.DIGEST_FROM_EMAIL||'Projete <noreply@projetus.org>',to:input.to,subject:input.subject,html:input.html},{idempotencyKey:input.key})
  if(r.error||!r.data?.id)throw new FinanceError('O provedor não confirmou a entrega do e-mail.',502)
  return r.data.id
}
async function sendSlack(text:string){
  const url=process.env.FINANCE_SLACK_WEBHOOK_URL
  if(!url)throw new FinanceError('Slack não configurado.',409)
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(15000)})
  if(!r.ok)throw new FinanceError(`Slack respondeu HTTP ${r.status}.`,502)
  return 'accepted'
}
export async function GET(request:NextRequest){
  try{
    requireCron(request)
    const {store,engine,contaAzul,refreshMirror}=financeRuntime(),task=request.nextUrl.searchParams.get('task')||'sync'
    if(task==='report')return NextResponse.json(await dailyReport(store,engine,sendEmail,process.env.FINANCE_SLACK_ENABLED==='true'?sendSlack:undefined),{headers:PRIVATE_HEADERS})
    if(task==='statements')return NextResponse.json(await commissionStatements(store,sendEmail),{headers:PRIVATE_HEADERS})
    if(task!=='sync')throw new FinanceError('Tarefa desconhecida.')
    const results:Record<string,unknown>={},errors:string[]=[]
    let cursor:number|null=0,count=0
    do{
      const r=await store.importCrm(cursor);cursor=r.nextCursor;count+=r.imported
    }while(cursor!==null)
    results.projete={count}
    const now=new Date(),start=new Date(now);start.setUTCDate(start.getUTCDate()-365)
    const end=new Date(now);end.setUTCDate(end.getUTCDate()+365)
    const from=request.nextUrl.searchParams.get('from')||businessDate(start),to=request.nextUrl.searchParams.get('to')||businessDate(end)
    try{results.contaAzul=await refreshMirror(from,to)}catch(e){errors.push(e instanceof Error?e.message:'Espelho Conta Azul indisponível')}
    const ready=connectorReadiness()
    if(ready.hotmartCredentials&&ready.hotmartProducts.length){
      try{results.hotmart=await engine.importHotmart(hotmartClient(),from,businessDate())}catch(e){errors.push(e instanceof Error?e.message:'Hotmart indisponível')}
    }else results.hotmart={skipped:true,reason:'Aguardando credenciais/produtos.'}
    if((await store.settings()).writesEnabled){
      try{results.push=await engine.push(contaAzul)}catch(e){errors.push(e instanceof Error?e.message:'Falha nos envios')}
    }
    return NextResponse.json({results,errors},{status:errors.length?207:200,headers:PRIVATE_HEADERS})
  }catch(e){return financeFailure(e)}
}
