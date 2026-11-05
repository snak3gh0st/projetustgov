import { Suspense } from 'react'
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import RelatorioSemanalClient from './RelatorioSemanalClient'

export const dynamic = 'force-dynamic'

export default async function RelatorioSemanalPage() {
  const session = await verifySession()
  if (session.role !== 'diretoria' && session.role !== 'admin') {
    redirect('/sem-permissao')
  }
  return (
    <Suspense>
      <RelatorioSemanalClient />
    </Suspense>
  )
}
