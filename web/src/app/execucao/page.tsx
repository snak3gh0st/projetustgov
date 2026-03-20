import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import ExecucaoClient from './ExecucaoClient'

export default async function ExecucaoPage() {
  const session = await verifySession()
  // Vendedores can see execucao — filtered to their CNPJs via API
  return <ExecucaoClient userRole={session.role} />
}
