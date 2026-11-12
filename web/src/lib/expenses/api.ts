import 'server-only'
import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { getPool } from '@/lib/db'
import { FinanceError } from '../finance/domain'
import { financeFailure, PRIVATE_HEADERS } from '../finance/api'
import { ExpenseStore } from './store'

export { PRIVATE_HEADERS }
export function expenseRuntime(){return new ExpenseStore(getPool(),process.env.CONTA_AZUL_TENANT_KEY?.trim()||'projetus')}
export async function requireExpense(request?:Request){
  const session=await getApiSession()
  if(!session)throw new FinanceError('Não autorizado.',401)
  const user=(await getPool().query('SELECT role FROM users WHERE id=$1 AND active',[session.userId])).rows[0]
  if(!user)throw new FinanceError('Não autorizado.',401)
  if(request&&request.method!=='GET'){
    const expected=new URL(process.env.NEXTAUTH_URL||request.url).origin,origin=request.headers.get('origin')
    if(!origin||origin!==expected)throw new FinanceError('Origem não autorizada.',403)
    if(request.headers.get('sec-fetch-site')==='cross-site')throw new FinanceError('Origem não autorizada.',403)
  }
  return {userId:session.userId,role:String(user.role)}
}
export function expenseFailure(error:unknown){
  if((error as {code?:string})?.code==='42P01')return NextResponse.json({error:'O módulo de despesas aguarda a migração do banco neste ambiente.'},{status:503,headers:PRIVATE_HEADERS})
  const response=financeFailure(error)
  for(const [key,value] of Object.entries(PRIVATE_HEADERS))response.headers.set(key,value)
  return response
}
