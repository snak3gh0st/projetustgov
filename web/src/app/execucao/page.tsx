import { redirect } from 'next/navigation'
import { legacyExecucaoTarget } from '@/lib/lead-tabs'

// Execução e Prestação de Contas viraram abas da página Leads; links antigos caem na aba certa.
export default function ExecucaoPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') search.set(key, value)
  }
  redirect(legacyExecucaoTarget(search))
}
