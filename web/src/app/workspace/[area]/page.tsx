import {verifySession} from '@/lib/dal'
import {notFound} from 'next/navigation'
import WorkspaceHome from '@/components/workspace/WorkspaceHome'
import {WORKSPACE_AREAS,type WorkspaceArea} from '@/lib/workspace/presentation'
export default async function WorkspaceAreaPage({params,searchParams}:{params:{area:string};searchParams:Record<string,string|undefined>}) {
  await verifySession()
  if(!WORKSPACE_AREAS.some(a=>a.id===params.area))notFound()
  const kind=['cliente','comercial','convenio'].includes(searchParams.projectKind||'')?searchParams.projectKind:'cliente'
  return <WorkspaceHome key={`${params.area}:${searchParams.cliente||''}:${kind}:${searchParams.projectKey||''}`} area={params.area as WorkspaceArea} initialCnpj={searchParams.cliente||''} initialSelection={`${kind}:${searchParams.projectKey||''}`}/>
}
