import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import ProdutosDigitaisClient from './ProdutosDigitaisClient'

export const dynamic = 'force-dynamic'

export default async function ProdutosDigitaisPage() {
  const session = await verifySession()
  if (session.role !== 'gestor' && session.role !== 'admin' && session.role !== 'adm_produto') {
    redirect('/sem-permissao')
  }

  return <ProdutosDigitaisClient />
}
