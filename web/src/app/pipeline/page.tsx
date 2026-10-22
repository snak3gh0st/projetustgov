import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import HomeClient from '../HomeClient'
import { landingPath } from '@/lib/areas'

// Pipeline de quem abre em outra tela (consultor em Meu dia, diretoria em Visão geral): a mesma tela inicial.
export default async function PipelinePage() {
  const session = await verifySession()
  if (!landingPath(session.role)) {
    redirect('/')
  }
  return <HomeClient />
}
