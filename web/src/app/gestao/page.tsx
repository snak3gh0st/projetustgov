import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import VisaoGeralClient from './VisaoGeralClient'

export default async function GestaoPage() {
  const session = await verifySession()
  if (session.role !== 'diretoria' && session.role !== 'admin') {
    redirect('/sem-permissao')
  }
  return <VisaoGeralClient />
}
