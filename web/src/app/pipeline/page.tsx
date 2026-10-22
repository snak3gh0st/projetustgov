import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import HomeClient from '../HomeClient'

// Pipeline do consultor: a mesma tela inicial, num endereço próprio porque / abre o Meu dia dele.
export default async function PipelinePage() {
  const session = await verifySession()
  if (session.role !== 'vendedor') {
    redirect('/')
  }
  return <HomeClient />
}
