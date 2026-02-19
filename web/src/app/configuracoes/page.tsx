import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import ConfiguracoesClient from './ConfiguracoesClient'

export default async function ConfiguracoesPage() {
  const session = await verifySession()

  if (session.role !== 'gestor') {
    redirect('/')
  }

  return <ConfiguracoesClient />
}
