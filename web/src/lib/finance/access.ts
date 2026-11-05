import { timingSafeEqual } from 'node:crypto'
import { FinanceError } from './domain.ts'

export function validSecret(actual:string|null,expected:string|undefined){
  if(!actual||!expected)return false
  const a=Buffer.from(actual),b=Buffer.from(expected)
  return a.length===b.length&&timingSafeEqual(a,b)
}
export function canOperateFinance(role:string|undefined){return role==='gestor'||role==='admin'||role==='gestor_financeiro'}
export function requireCron(request:Request){
  if(!validSecret(request.headers.get('authorization'),process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:undefined))throw new FinanceError('Não autorizado.',401)
}
