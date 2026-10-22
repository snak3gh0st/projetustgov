import { isSeller, verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import MeuDiaClient from './MeuDiaClient'

export default async function MeuDiaPage() {
  const session = await verifySession()
  if (!isSeller(session.role)) {
    redirect('/')
  }
  return <MeuDiaClient />
}
