import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { canManageConversations, canUseWhatsapp } from '@/lib/whatsapp/access'
import { whatsappConfigured } from '@/lib/whatsapp/evolution'
import { officialTemplates, whatsappChannels } from '@/lib/whatsapp/channels'
import ConversasClient from './ConversasClient'

export default async function ConversasPage() {
  const session = await verifySession()
  if (!whatsappConfigured() || !canUseWhatsapp(session.role)) redirect('/')
  return <ConversasClient gestao={canManageConversations(session.role)} canais={whatsappChannels().map((c) => ({ id: c.channel, nome: c.label }))} modelos={officialTemplates()} />
}
