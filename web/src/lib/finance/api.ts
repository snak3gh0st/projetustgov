import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getApiSession } from '@/lib/dal'
import { FinanceError } from './domain'
import { canOperateFinance } from './access'

export function financeFailure(error:unknown){
  if(error instanceof SyntaxError)return NextResponse.json({error:'JSON inválido.'},{status:400})
  if(error instanceof ZodError)return NextResponse.json({error:'Dados inválidos.',issues:error.issues.map(i=>({path:i.path,message:i.message}))},{status:400})
  if(error instanceof FinanceError)return NextResponse.json({error:error.message},{status:error.status>=400&&error.status<600?error.status:502})
  if((error as {code?:string})?.code==='42P01')return NextResponse.json({error:'A migração do financeiro ainda não foi aplicada neste ambiente.'},{status:503})
  console.error('[financeiro]',error instanceof Error?error.name:'unknown')
  return NextResponse.json({error:'Falha no financeiro. Consulte o histórico da integração.'},{status:500})
}
export async function requireFinance(request?:Request){
  const session=await getApiSession()
  if(!session)throw new FinanceError('Não autorizado.',401)
  if(!canOperateFinance(session.role))throw new FinanceError('Acesso restrito ao financeiro.',403)
  if(request&&request.method!=='GET'){
    const origin=request.headers.get('origin')
    const expected=new URL(process.env.NEXTAUTH_URL||request.url).origin
    if(origin&&origin!==expected)throw new FinanceError('Origem não autorizada.',403)
  }
  return session
}
export const PRIVATE_HEADERS={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'}
