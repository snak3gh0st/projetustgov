import 'server-only'

import { whatsappConfigured } from './evolution'

/**
 * Mensagens de WhatsApp que contam como contato com o lead, como (cnpj_clean, at).
 * Sem canal configurado a lista é vazia: Leads, Execução e Meu dia não dependem das tabelas do WhatsApp.
 */
export function whatsappContatosSql(): string {
  if (!whatsappConfigured()) return `SELECT NULL::text AS cnpj_clean, NULL::timestamptz AS at WHERE FALSE`
  return `SELECT wc.lead_cnpj AS cnpj_clean, wm.enviada_em AS at FROM whatsapp_mensagens wm
    JOIN whatsapp_conversas wc ON wc.id = wm.conversa_id
    WHERE wc.lead_cnpj IS NOT NULL AND wm.status <> 'falhou'`
}
