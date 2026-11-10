import { verifySession } from '@/lib/dal'
import ClientWorkspace from '@/components/workspace/ClientWorkspace'
import Link from 'next/link'
export default async function ClientWorkspacePage({params}:{params:{cnpj:string}}){
  await verifySession()
  return <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-8"><Link href="/workspace" className="text-sm text-ink-2 hover:text-accent">← Workspace da equipe</Link><ClientWorkspace cnpj={params.cnpj}/></div>
}
