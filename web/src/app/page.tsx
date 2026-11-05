import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import HomeClient from './HomeClient'
import { landingPath } from '@/lib/areas'

export default async function HomePage() {
  const session = await verifySession()
  if (session.role === 'adm_produto') {
    redirect('/tgov')
  }
  // Consultor abre em Meu dia e diretoria em Visão geral; o Pipeline deles fica em /pipeline.
  const landing = landingPath(session.role)
  if (landing) {
    redirect(landing)
  }
  return <HomeClient />
}
