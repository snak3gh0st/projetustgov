import { redirect } from 'next/navigation'
import { canManageContaAzul, canReadBiFinanceiro, verifySession } from '@/lib/dal'
import FinanceiroShell from './FinanceiroShell'

export const dynamic = 'force-dynamic'

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (!canReadBiFinanceiro(session.role)) {
    redirect('/sem-permissao')
  }
  return <FinanceiroShell canSync={canManageContaAzul(session.role)}>{children}</FinanceiroShell>
}
