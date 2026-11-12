import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { expenseFailure,expenseRuntime,PRIVATE_HEADERS,requireExpense } from '@/lib/expenses/api'
export async function PUT(req:NextRequest){try{
  const a=await requireExpense(req),p=z.object({version:z.number().int().min(0),config:z.unknown()}).strict().parse(await req.json())
  return NextResponse.json(await expenseRuntime().savePolicy(p.config,p.version,a),{headers:PRIVATE_HEADERS})
}catch(e){return expenseFailure(e)}}
