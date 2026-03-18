import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import ExecucaoClient from './ExecucaoClient'

export default async function ExecucaoPage() {
  const session = await verifySession()
  if (session.role === 'vendedor') {
    redirect('/sem-permissao')
  }
  return <ExecucaoClient />
}
