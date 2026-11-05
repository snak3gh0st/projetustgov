import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireFinance,financeFailure,PRIVATE_HEADERS } from '@/lib/finance/api'
import { financeRuntime } from '@/lib/finance/runtime'
import { csvCell,FinanceError } from '@/lib/finance/domain'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
  try{
    await requireFinance()
    const id=z.string().uuid().parse(request.nextUrl.searchParams.get('id'))
    const user=request.nextUrl.searchParams.get('user')
    if(user)z.string().uuid().parse(user)
    const {store}=financeRuntime()
    const closing=(await store.rows('SELECT *,due_date::text FROM finance_closings WHERE tenant_key=$1 AND id=$2',[store.tenant,id]))[0]
    if(!closing)throw new FinanceError('Fechamento não encontrado.',404)
    const items=closing.snapshot.filter((r:Record<string,any>)=>!user||r.beneficiary_id===user)
    const content=[['Competência','Vencimento','Beneficiário','Origem','Venda','Papel','Valor aprovado'],...items.map((r:Record<string,any>)=>
      [closing.period,closing.due_date,r.beneficiary_name,r.origin,r.sale_description,r.role,(Number(r.amount_cents)/100).toFixed(2)])]
      .map(row=>row.map(csvCell).join(';')).join('\r\n')
    return new Response('\uFEFF'+content,{headers:{...PRIVATE_HEADERS,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="comissoes-${closing.period}.csv"`}})
  }catch(e){return financeFailure(e)}
}
