import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { expenseFailure, expenseRuntime, PRIVATE_HEADERS, requireExpense } from '@/lib/expenses/api'
import { uuid } from '@/lib/expenses/domain'
export const dynamic='force-dynamic'
export async function GET(){try{const a=await requireExpense();return NextResponse.json(await expenseRuntime().dashboard(a),{headers:PRIVATE_HEADERS})}catch(e){return expenseFailure(e)}}
export async function POST(req:NextRequest){try{
  const a=await requireExpense(req),p=z.object({id:uuid,kind:z.enum(['authorization','reimbursement','purchase']),data:z.unknown(),authorizationId:uuid.nullable()}).strict().parse(await req.json())
  return NextResponse.json(await expenseRuntime().create(p.id,p.kind,p.data,p.authorizationId,a),{status:201,headers:PRIVATE_HEADERS})
}catch(e){return expenseFailure(e)}}
