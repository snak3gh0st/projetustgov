import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { expenseFailure,expenseRuntime,PRIVATE_HEADERS,requireExpense } from '@/lib/expenses/api'
import { documentTypes,uuid } from '@/lib/expenses/domain'
import { FinanceError } from '@/lib/finance/domain'
export async function POST(req:NextRequest,{params}:{params:{id:string}}){try{
  const a=await requireExpense(req),length=Number(req.headers.get('content-length'))
  if(!length||length>5*1024*1024+16384)throw new FinanceError('Envie um arquivo de até 5 MB.',413)
  const form=await req.formData(),file=form.get('file')
  if(!(file instanceof File))throw new FinanceError('Selecione o documento.')
  const type=z.enum(documentTypes).parse(form.get('type')),revision=z.coerce.number().int().min(1).parse(form.get('revision'))
  await expenseRuntime().attach(uuid.parse(params.id),revision,{type,name:file.name,mime:file.type,bytes:Buffer.from(await file.arrayBuffer())},a)
  return NextResponse.json({ok:true},{headers:PRIVATE_HEADERS})
}catch(e){return expenseFailure(e)}}
export async function DELETE(req:NextRequest,{params}:{params:{id:string}}){try{
  const a=await requireExpense(req),p=z.object({documentId:uuid,revision:z.number().int().min(1)}).strict().parse(await req.json())
  await expenseRuntime().removeDocument(uuid.parse(params.id),p.documentId,p.revision,a)
  return NextResponse.json({ok:true},{headers:PRIVATE_HEADERS})
}catch(e){return expenseFailure(e)}}
