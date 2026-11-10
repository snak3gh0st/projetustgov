import { verifySession } from '@/lib/dal'
import {redirect} from 'next/navigation'
import {legacyWorkspaceArea,workspaceHref} from '@/lib/workspace/presentation'
export default async function ClientWorkspacePage({params,searchParams}:{params:{cnpj:string};searchParams:Record<string,string|undefined>}){
  await verifySession()
  const href=workspaceHref(legacyWorkspaceArea(searchParams.tab),params.cnpj,`${searchParams.projectKind||'cliente'}:${searchParams.projectKey||''}`)
  const url=new URL(href,'https://projete.projetus.org')
  for(const key of ['googleError','googleConnected'])if(searchParams[key])url.searchParams.set(key,searchParams[key]!)
  redirect(url.pathname+url.search)
}
