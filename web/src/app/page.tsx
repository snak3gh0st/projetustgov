import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import HomeClient from './HomeClient'

export default async function HomePage() {
  const session = await verifySession()
  if (session.role === 'adm_produto') {
    redirect('/tgov')
  }
  return <HomeClient />
}
