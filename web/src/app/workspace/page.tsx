import { verifySession } from '@/lib/dal'
import WorkspaceHome from '@/components/workspace/WorkspaceHome'
export default async function WorkspacePage(){await verifySession();return <WorkspaceHome/>}
