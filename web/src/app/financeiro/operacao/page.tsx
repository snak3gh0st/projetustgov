import { redirect } from 'next/navigation'
import { verifySession,canManageContaAzul } from '@/lib/dal'
import FinanceClient from '../FinanceClient'

export const dynamic='force-dynamic'

export default async function OperacaoFinanceiraPage(){
  const session=await verifySession()
  if(!canManageContaAzul(session.role))redirect('/sem-permissao')
  return <FinanceClient />
}
