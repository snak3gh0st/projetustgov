import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import LeadsClient from './LeadsClient'

export default async function LeadsPage() {
  const session = await verifySession()
  if (session.role === 'adm_produto') {
    redirect('/sem-permissao')
  }
  return <LeadsClient />
}
