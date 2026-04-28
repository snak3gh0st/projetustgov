import { verifySession, canCsm } from '@/lib/dal'
import { redirect } from 'next/navigation'
import CsmBiClient from './CsmBiClient'

export default async function CsmBiPage() {
  const session = await verifySession()
  if (!canCsm(session.role)) {
    redirect('/sem-permissao')
  }
  return <CsmBiClient userRole={session.role} userName={session.name ?? null} />
}
