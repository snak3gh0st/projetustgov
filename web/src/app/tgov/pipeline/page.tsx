import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import TGovPipelineClient from './TGovPipelineClient'

export default async function TGovPipelinePage() {
  const session = await verifySession()

  // Same roles as /tgov — all TGov roles (aprovação + prestação)
  const ALLOWED_ROLES = [
    'gestor', 'admin', 'adm_produto', 'csm',
    'coord_aprovacao', 'assistente_aprovacao', 'projetista',
    'coord_prestacao', 'assistente_prestacao',
  ]
  if (!ALLOWED_ROLES.includes(session.role)) {
    redirect('/sem-permissao')
  }

  return <TGovPipelineClient userRole={session.role} />
}
