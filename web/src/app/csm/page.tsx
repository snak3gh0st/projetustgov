import { verifySession, canCsm } from '@/lib/dal'
import { redirect } from 'next/navigation'
import CsmTabsClient from './CsmTabsClient'

interface CsmPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function CsmPage({ searchParams }: CsmPageProps) {
  const session = await verifySession()
  if (!canCsm(session.role)) {
    redirect('/sem-permissao')
  }
  const { tab } = await searchParams
  return <CsmTabsClient userRole={session.role} userName={session.name ?? null} initialTab={tab} />
}
