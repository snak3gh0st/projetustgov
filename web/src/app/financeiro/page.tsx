import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { canOperateFinance } from '@/lib/finance/access'
import FinanceClient from './FinanceClient'
export const dynamic='force-dynamic'
export default async function FinanceiroPage(){
  const session=await verifySession()
  if(!canOperateFinance(session.role))redirect('/sem-permissao')
  return <FinanceClient />
}
