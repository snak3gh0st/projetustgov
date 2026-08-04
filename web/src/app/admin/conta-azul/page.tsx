import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canManageContaAzul } from '@/lib/dal'
import ContaAzulAdminClient from './ContaAzulAdminClient'

export const dynamic = 'force-dynamic'

export default async function ContaAzulAdminPage() {
  const session = await auth()
  if (!session?.user || !canManageContaAzul(session.user.role)) {
    redirect('/sem-permissao')
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando…</div>}>
      <ContaAzulAdminClient />
    </Suspense>
  )
}
