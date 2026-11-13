import { NextRequest } from 'next/server'
import { expenseFailure,expenseRuntime,PRIVATE_HEADERS,requireExpense } from '@/lib/expenses/api'
import { uuid } from '@/lib/expenses/domain'
import { FinanceError } from '@/lib/finance/domain'
export const dynamic='force-dynamic'
export async function GET(_:NextRequest,{params}:{params:{id:string;documentId:string}}){try{
  const a=await requireExpense(),store=expenseRuntime(),id=uuid.parse(params.id)
  await store.get(id,a)
  const doc=(await store.rows('SELECT name,mime_type,content FROM expense_documents WHERE request_id=$1 AND id=$2',[id,uuid.parse(params.documentId)]))[0]
  if(!doc)throw new FinanceError('Documento não encontrado.',404)
  return new Response(new Uint8Array(doc.content),{headers:{...PRIVATE_HEADERS,'Content-Type':doc.mime_type,'Content-Disposition':`attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}})
}catch(e){return expenseFailure(e)}}
