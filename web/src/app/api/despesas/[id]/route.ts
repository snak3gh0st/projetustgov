import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { expenseFailure,expenseRuntime,PRIVATE_HEADERS,requireExpense } from '@/lib/expenses/api'
import { uuid } from '@/lib/expenses/domain'
import { exportExpense,reconcileExpense,retryExpense } from '@/lib/expenses/integration'
import { financeRuntime } from '@/lib/finance/runtime'
import { FinanceError } from '@/lib/finance/domain'
export const dynamic='force-dynamic'
export const maxDuration=90
export async function GET(_:NextRequest,{params}:{params:{id:string}}){try{
  const a=await requireExpense();return NextResponse.json(await expenseRuntime().detail(uuid.parse(params.id),a),{headers:PRIVATE_HEADERS})
}catch(e){return expenseFailure(e)}}
export async function POST(req:NextRequest,{params}:{params:{id:string}}){try{
  const a=await requireExpense(req),store=expenseRuntime(),id=uuid.parse(params.id)
  const p=z.object({action:z.enum(['save','submit','cancel','return','reject','approve','escalate','release','export','retry','reconcile']),revision:z.number().int().min(1),data:z.unknown().optional(),note:z.string().max(2000).optional(),amountCents:z.number().int().optional(),mode:z.enum(['company','employee']).optional(),conditions:z.string().max(2000).optional(),validUntil:z.string().max(10).optional(),remoteId:uuid.optional()}).strict().parse(await req.json())
  if(p.action==='save')await store.save(id,p.revision,p.data,a)
  else if(p.action==='export')return NextResponse.json(await exportExpense(store,financeRuntime().contaAzul,id,a),{headers:PRIVATE_HEADERS})
  else if(p.action==='retry'){
    await retryExpense(store,id,a);return NextResponse.json(await exportExpense(store,financeRuntime().contaAzul,id,a),{headers:PRIVATE_HEADERS})
  }else if(p.action==='reconcile'){
    if(!p.remoteId)throw new FinanceError('Informe o ID da parcela existente no Conta Azul.')
    await reconcileExpense(store,financeRuntime().contaAzul,id,p.remoteId,a)
  }else{
    const result=await store.command(id,p.revision,p.action,a,p)
    if(p.action==='release'){
      let integration:unknown
      try{integration=await exportExpense(store,financeRuntime().contaAzul,id,a)}catch{integration={error:'Liberação registrada. Confira a pendência de integração e tente o envio pela solicitação.'}}
      return NextResponse.json({...(await store.detail(id,a)),integration,release:result.id},{headers:PRIVATE_HEADERS})
    }
  }
  return NextResponse.json(await store.detail(id,a),{headers:PRIVATE_HEADERS})
}catch(e){return expenseFailure(e)}}
