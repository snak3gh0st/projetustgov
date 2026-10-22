import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import HomeClient from './HomeClient'

export default async function HomePage() {
  const session = await verifySession()
  if (session.role === 'adm_produto') {
    redirect('/tgov')
  }
  // O consultor abre o dia em Meu dia; o Pipeline dele fica em /pipeline.
  if (session.role === 'vendedor') {
    redirect('/meu-dia')
  }
  return <HomeClient />
}
