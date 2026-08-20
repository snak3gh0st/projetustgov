import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import OperacaoClient from './OperacaoClient'

const ALLOWED_ROLES = [
  'gestor', 'admin', 'adm_produto', 'csm', 'vendedor', 'coordenador', 'visualizador',
  'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao',
]

export default async function OperacaoPage() {
  const session = await verifySession()
  if (!ALLOWED_ROLES.includes(session.role)) redirect('/sem-permissao')
  return <OperacaoClient userRole={session.role} />
}
