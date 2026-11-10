import { NextRequest,NextResponse } from 'next/server'
import { financeFailure,PRIVATE_HEADERS,requireFinance } from '@/lib/finance/api'
import { financeRuntime } from '@/lib/finance/runtime'
import { businessDate } from '@/lib/finance/domain'
import { reportCsv } from '@/lib/finance/engine'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
  try{
    await requireFinance()
    const report=await financeRuntime().engine.report(request.nextUrl.searchParams.get('date')||businessDate())
    if(request.nextUrl.searchParams.get('format')==='csv')return new Response(reportCsv(report),{headers:{...PRIVATE_HEADERS,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="financeiro-${report.date}.csv"`}})
    return NextResponse.json(report,{headers:PRIVATE_HEADERS})
  }catch(e){return financeFailure(e)}
}
