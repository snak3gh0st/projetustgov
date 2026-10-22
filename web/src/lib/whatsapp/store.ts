import 'server-only'

import { query } from '@/lib/db'
import { localPhoneSql, phoneVariants } from './phone'
import type { WebhookEvent } from './webhook'

type MensagemEvent = Extract<WebhookEvent, { kind: 'mensagem' }>
type StatusEvent = Extract<WebhookEvent, { kind: 'status' }>

const PREVIA: Record<string, string> = {
  imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', figurinha: 'Figurinha', outro: 'Mensagem',
}
export const previaDe = (ev: Pick<MensagemEvent, 'texto' | 'tipo'>) => (ev.texto ?? PREVIA[ev.tipo] ?? 'Mensagem').slice(0, 160)

/** Liga a conversa ao lead quando o telefone casa com exatamente um CNPJ; 0 ou mais de um fica em aberto. */
export async function linkConversationToLead(conversaId: number, telefone: string): Promise<string | null> {
  const variants = phoneVariants(telefone)
  if (variants.length === 0) return null
  const rows = await query<{ cnpj: string }>(
    `SELECT DISTINCT REGEXP_REPLACE(t.cnpj, '[^0-9]', '', 'g') AS cnpj FROM (
       SELECT lead_cnpj AS cnpj, telefone FROM lead_contacts
       UNION ALL
       SELECT cnpj, telefone FROM vendedor_projetos
     ) t
     WHERE t.cnpj IS NOT NULL AND ${localPhoneSql('t.telefone')} = ANY($1::text[])`,
    [variants]
  )
  if (rows.length !== 1) return null
  await query(`UPDATE whatsapp_conversas SET lead_cnpj = $2 WHERE id = $1 AND lead_cnpj IS NULL`, [conversaId, rows[0].cnpj])
  return rows[0].cnpj
}

/**
 * Grava uma mensagem (idempotente pelo id do WhatsApp) e atualiza o resumo da conversa.
 * origem 'projete' marca uma mensagem enviada pela tela, mesmo que o webhook tenha chegado antes.
 */
export async function recordMessage(
  ev: MensagemEvent,
  opts: { origem?: 'projete'; autorId?: string; status?: 'enviada' | 'falhou' } = {}
): Promise<{ conversaId: number; mensagemId: number; nova: boolean }> {
  const chave = ev.telefone ?? ev.jid
  const [conversa] = await query<{ id: number; lead_cnpj: string | null }>(
    `INSERT INTO whatsapp_conversas (instancia, telefone, jid, nome_contato)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (instancia, telefone) DO UPDATE
       SET jid = EXCLUDED.jid, nome_contato = COALESCE(EXCLUDED.nome_contato, whatsapp_conversas.nome_contato)
     RETURNING id, lead_cnpj`,
    [ev.instancia, chave, ev.jid, ev.nome]
  )

  const direcao = ev.fromMe ? 'enviada' : 'recebida'
  const origem = opts.origem ?? (ev.fromMe ? 'celular' : 'contato')
  const [msg] = await query<{ id: number; nova: boolean }>(
    `INSERT INTO whatsapp_mensagens (conversa_id, wa_id, direcao, origem, autor_id, texto, tipo, midia, status, enviada_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (conversa_id, wa_id) DO UPDATE
       SET origem = CASE WHEN $4 = 'projete' THEN 'projete' ELSE whatsapp_mensagens.origem END,
           autor_id = COALESCE(EXCLUDED.autor_id, whatsapp_mensagens.autor_id)
     RETURNING id, (xmax = 0) AS nova`,
    [conversa.id, ev.waId, direcao, origem, opts.autorId ?? null, ev.texto, ev.tipo, ev.midia ? JSON.stringify(ev.midia) : null,
      opts.status ?? 'enviada', ev.enviadaEm]
  )

  if (msg.nova && opts.status !== 'falhou') {
    await query(
      `UPDATE whatsapp_conversas SET
         ultima_recebida_em = CASE WHEN $2 = 'recebida' THEN GREATEST(ultima_recebida_em, $3::timestamptz) ELSE ultima_recebida_em END,
         ultima_enviada_em = CASE WHEN $2 = 'enviada' THEN GREATEST(ultima_enviada_em, $3::timestamptz) ELSE ultima_enviada_em END,
         nao_lidas = CASE WHEN $2 = 'recebida' THEN nao_lidas + 1 ELSE 0 END,
         -- Quem escreve de novo volta para a fila.
         arquivada_em = CASE WHEN $2 = 'recebida' THEN NULL ELSE arquivada_em END,
         ultima_previa = CASE WHEN ultima_mensagem_em IS NULL OR $3::timestamptz >= ultima_mensagem_em THEN $4 ELSE ultima_previa END,
         ultima_mensagem_em = GREATEST(ultima_mensagem_em, $3::timestamptz)
       WHERE id = $1`,
      [conversa.id, direcao, ev.enviadaEm, previaDe(ev)]
    )
  }

  if (!conversa.lead_cnpj && ev.telefone) await linkConversationToLead(conversa.id, ev.telefone)
  return { conversaId: conversa.id, mensagemId: msg.id, nova: msg.nova }
}

const RANK = `CASE %s WHEN 'enviando' THEN 0 WHEN 'enviada' THEN 1 WHEN 'entregue' THEN 2 WHEN 'lida' THEN 3 ELSE 4 END`

/** Atualiza o status de entrega; nunca volta de "lida" para "entregue". */
export async function recordStatus(ev: StatusEvent): Promise<void> {
  await query(
    `UPDATE whatsapp_mensagens SET status = $2
     WHERE wa_id = $1 AND direcao = 'enviada'
       AND ($2 = 'falhou' OR ${RANK.replace('%s', 'status')} < ${RANK.replace('%s', '$2')})`,
    [ev.waId, ev.status]
  )
}
