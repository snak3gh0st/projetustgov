import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { seesAllConversations } from '@/lib/whatsapp/access'
import { whatsappConfigured } from '@/lib/whatsapp/evolution'
import ConexaoClient from './ConexaoClient'

export default async function ConexaoPage() {
  const session = await verifySession()
  if (!whatsappConfigured() || !seesAllConversations(session.role)) redirect('/')
  return <ConexaoClient />
}
