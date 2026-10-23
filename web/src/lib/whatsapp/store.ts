import 'server-only'

import { getPool, query } from '@/lib/db'
import { mensagensDoChat, parDoContato } from './evolution'
import { localPhoneSql, phoneFromJid, phoneVariants } from './phone'
import { parseMensagem, type WebhookEvent } from './webhook'

type MensagemEvent = Extract<WebhookEvent, { kind: 'mensagem' }>
type StatusEvent = Extract<WebhookEvent, { kind: 'status' }>
type EtiquetaEvent = Extract<WebhookEvent, { kind: 'etiqueta' }>

const PREVIA: Record<string, string> = {
  imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', figurinha: 'Figurinha', outro: 'Mensagem',
}
export const previaDe = (ev: Pick<MensagemEvent, 'texto' | 'tipo'>) => (ev.texto ?? PREVIA[ev.tipo] ?? 'Mensagem').slice(0, 160)

/** CNPJs (só dígitos) com esse telefone num contato ou no próprio lead. */
export async function cnpjsDoTelefone(telefone: string): Promise<string[]> {
  const variants = phoneVariants(telefone)
  if (variants.length === 0) return []
  const rows = await query<{ cnpj: string }>(
    `SELECT DISTINCT REGEXP_REPLACE(t.cnpj, '[^0-9]', '', 'g') AS cnpj FROM (
       SELECT lead_cnpj AS cnpj, telefone FROM lead_contacts
       UNION ALL
       SELECT cnpj, telefone FROM vendedor_projetos
     ) t
     WHERE t.cnpj IS NOT NULL AND ${localPhoneSql('t.telefone')} = ANY($1::text[])`,
    [variants]
  )
  return rows.map((r) => r.cnpj)
}

/** Liga a conversa ao lead quando o telefone casa com exatamente um CNPJ; 0 ou mais de um fica em aberto. */
export async function linkConversationToLead(conversaId: number, telefone: string): Promise<string | null> {
  const cnpjs = await cnpjsDoTelefone(telefone)
  if (cnpjs.length !== 1) return null
  await query(`UPDATE whatsapp_conversas SET lead_cnpj = $2 WHERE id = $1 AND lead_cnpj IS NULL`, [conversaId, cnpjs[0]])
  return cnpjs[0]
}

interface ConversaChave { id: number; telefone: string; lid: string | null; lead_cnpj: string | null }

const CHAVE = `id, telefone, lid, lead_cnpj`
// Sem telefone, a coluna telefone guarda o JID (…@lid).
const temTelefone = (c: ConversaChave | null) => !!c && !c.telefone.includes('@')

/** Vendedor da etiqueta do chat (pelo lid); com mais de uma etiqueta de vendedor, a de menor id. */
export async function vendedorDaEtiqueta(instancia: string, lid: string): Promise<string | null> {
  const [r] = await query<{ user_id: string }>(
    `SELECT e.user_id FROM whatsapp_chat_etiquetas ce
     JOIN whatsapp_etiquetas e ON e.instancia = ce.instancia AND e.label_id = ce.label_id
     WHERE ce.instancia = $1 AND ce.chat_jid = $2 AND e.user_id IS NOT NULL
     ORDER BY LENGTH(ce.label_id), ce.label_id LIMIT 1`,
    [instancia, lid]
  )
  return r?.user_id ?? null
}

/** Junta duas conversas do mesmo contato: mensagens, lead, direcionamento e resumo ficam em `ficaId`. */
export async function unirConversas(ficaId: number, saiId: number): Promise<void> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT id FROM whatsapp_conversas WHERE id IN ($1, $2) FOR UPDATE`, [ficaId, saiId])
    // A mesma mensagem nas duas (chegou ao vivo e de novo no histórico) fica uma vez só.
    await client.query(
      `DELETE FROM whatsapp_mensagens s USING whatsapp_mensagens f
       WHERE s.conversa_id = $2 AND f.conversa_id = $1 AND f.wa_id = s.wa_id`,
      [ficaId, saiId]
    )
    await client.query(`UPDATE whatsapp_mensagens SET conversa_id = $1 WHERE conversa_id = $2`, [ficaId, saiId])
    await client.query(
      `UPDATE whatsapp_conversas f SET
         lead_cnpj = COALESCE(f.lead_cnpj, s.lead_cnpj),
         atendente_id = COALESCE(f.atendente_id, s.atendente_id),
         nome_contato = COALESCE(f.nome_contato, s.nome_contato),
         arquivada_em = CASE WHEN f.arquivada_em IS NULL OR s.arquivada_em IS NULL THEN NULL ELSE GREATEST(f.arquivada_em, s.arquivada_em) END,
         historico_ate = GREATEST(f.historico_ate, s.historico_ate),
         nao_lidas = f.nao_lidas + s.nao_lidas,
         ultima_recebida_em = GREATEST(f.ultima_recebida_em, s.ultima_recebida_em),
         ultima_enviada_em = GREATEST(f.ultima_enviada_em, s.ultima_enviada_em),
         ultima_previa = CASE WHEN f.ultima_mensagem_em IS NULL OR s.ultima_mensagem_em > f.ultima_mensagem_em THEN s.ultima_previa ELSE f.ultima_previa END,
         ultima_mensagem_em = GREATEST(f.ultima_mensagem_em, s.ultima_mensagem_em)
       FROM whatsapp_conversas s WHERE f.id = $1 AND s.id = $2`,
      [ficaId, saiId]
    )
    // O lid é único: sai da conversa apagada antes de passar para a que fica.
    const { rows } = await client.query<{ lid: string | null }>(`DELETE FROM whatsapp_conversas WHERE id = $1 RETURNING lid`, [saiId])
    await client.query(`UPDATE whatsapp_conversas SET lid = COALESCE(lid, $2) WHERE id = $1`, [ficaId, rows[0]?.lid ?? null])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * A conversa do contato, achada pelo telefone ou pelo lid (o histórico e as etiquetas só têm o lid; a mensagem ao vivo
 * chega com o telefone). Falta metade do par: pergunta ao Evolution. Achou duas: une. Nenhuma: cria.
 */
export async function conversaDoContato(
  c: { instancia: string; telefone: string | null; lid: string | null; jid: string; nome: string | null },
  // historico: a importação já resolveu o par uma vez por chat e lê as mensagens da mais nova para a mais antiga.
  opts: { historico?: boolean } = {}
): Promise<{ id: number; lead_cnpj: string | null; telefone: string | null; criada: boolean }> {
  let { telefone, lid } = c
  const buscar = async () => ({
    porTelefone: telefone
      ? (await query<ConversaChave>(`SELECT ${CHAVE} FROM whatsapp_conversas WHERE instancia = $1 AND telefone = $2`, [c.instancia, telefone]))[0] ?? null
      : null,
    // Conversas antigas sem a coluna lid guardam o lid no lugar do telefone.
    porLid: lid
      ? (await query<ConversaChave>(`SELECT ${CHAVE} FROM whatsapp_conversas WHERE instancia = $1 AND (lid = $2 OR telefone = $2) ORDER BY id LIMIT 1`, [c.instancia, lid]))[0] ?? null
      : null,
  })
  let { porTelefone, porLid } = await buscar()

  const faltaLid = !lid && !porTelefone?.lid
  const faltaTelefone = !telefone && !temTelefone(porLid)
  if ((faltaLid || faltaTelefone) && !opts.historico) {
    const par = await parDoContato(lid ?? c.jid)
    const novoLid = lid ?? par.lid
    const novoTelefone = telefone ?? par.telefone
    if (novoLid !== lid || novoTelefone !== telefone) {
      lid = novoLid
      telefone = novoTelefone
      ;({ porTelefone, porLid } = await buscar())
    }
  }
  if (!telefone && temTelefone(porLid)) telefone = porLid!.telefone

  if (porTelefone && porLid && porTelefone.id !== porLid.id) await unirConversas(porTelefone.id, porLid.id)
  const existente = porTelefone ?? porLid
  const atendente = lid ? await vendedorDaEtiqueta(c.instancia, lid) : null
  const jid = telefone ? `${telefone}@s.whatsapp.net` : c.jid

  if (existente) {
    const [row] = await query<{ id: number; lead_cnpj: string | null }>(
      `UPDATE whatsapp_conversas SET
         lid = COALESCE(lid, $2),
         telefone = CASE WHEN $3::text IS NOT NULL AND telefone LIKE '%@%' THEN $3 ELSE telefone END,
         jid = CASE WHEN $3::text IS NOT NULL OR jid NOT LIKE '%@s.whatsapp.net' THEN $4 ELSE jid END,
         -- No histórico o primeiro nome lido é o mais recente.
         nome_contato = CASE WHEN $7 THEN COALESCE(nome_contato, $5) ELSE COALESCE($5, nome_contato) END,
         -- A etiqueta direciona só quando o lid chega; depois vale o que a gestão ou a etiqueta mudarem.
         atendente_id = CASE WHEN lid IS NULL THEN COALESCE(atendente_id, $6) ELSE atendente_id END
       WHERE id = $1 RETURNING id, lead_cnpj`,
      [existente.id, lid, telefone, jid, c.nome, atendente, !!opts.historico]
    )
    return { id: row.id, lead_cnpj: row.lead_cnpj, telefone, criada: false }
  }

  const [row] = await query<{ id: number; lead_cnpj: string | null; criada: boolean }>(
    `INSERT INTO whatsapp_conversas (instancia, telefone, jid, lid, nome_contato, atendente_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (instancia, telefone) DO UPDATE
       SET jid = EXCLUDED.jid, lid = COALESCE(whatsapp_conversas.lid, EXCLUDED.lid),
           nome_contato = COALESCE(EXCLUDED.nome_contato, whatsapp_conversas.nome_contato)
     RETURNING id, lead_cnpj, (xmax = 0) AS criada`,
    [c.instancia, telefone ?? lid ?? c.jid, jid, lid, c.nome, atendente]
  )
  return { id: row.id, lead_cnpj: row.lead_cnpj, telefone, criada: row.criada }
}

/**
 * Grava uma mensagem (idempotente pelo id do WhatsApp) e atualiza o resumo da conversa.
 * origem 'projete' marca uma mensagem enviada pela tela, mesmo que o webhook tenha chegado antes.
 */
export async function recordMessage(ev: MensagemEvent, opts: GravarOpts = {}): Promise<Gravada> {
  // Duas mensagens do mesmo contato novo ao mesmo tempo (uma pelo lid, outra pelo telefone) disputam os índices únicos
  // ou a união; quem perde procura de novo e acha a conversa que a outra criou.
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await gravarMensagem(ev, opts)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (tentativa >= 3 || (code !== '23505' && code !== '23503')) throw error
    }
  }
}

// historico: mensagem antiga importada; não soma não lidas, não tira do arquivo e não conta como esperando resposta.
type GravarOpts = { origem?: 'projete'; autorId?: string; status?: 'enviada' | 'falhou'; historico?: true }
type Gravada = { conversaId: number; mensagemId: number; nova: boolean; conversaCriada: boolean; telefone: string | null; leadCnpj: string | null }

async function gravarMensagem(ev: MensagemEvent, opts: GravarOpts): Promise<Gravada> {
  const conversa = await conversaDoContato(
    { instancia: ev.instancia, telefone: ev.telefone, lid: ev.lid, jid: ev.jid, nome: ev.nome },
    { historico: !!opts.historico }
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
         nao_lidas = CASE WHEN $5 THEN nao_lidas WHEN $2 = 'recebida' THEN nao_lidas + 1 ELSE 0 END,
         -- Quem escreve de novo volta para a fila.
         arquivada_em = CASE WHEN NOT $5 AND $2 = 'recebida' THEN NULL ELSE arquivada_em END,
         historico_ate = CASE WHEN $5 THEN GREATEST(historico_ate, $3::timestamptz) ELSE historico_ate END,
         ultima_previa = CASE WHEN ultima_mensagem_em IS NULL OR $3::timestamptz >= ultima_mensagem_em THEN $4 ELSE ultima_previa END,
         ultima_mensagem_em = GREATEST(ultima_mensagem_em, $3::timestamptz)
       WHERE id = $1`,
      [conversa.id, direcao, ev.enviadaEm, previaDe(ev), !!opts.historico]
    )
  }

  // Na importação a ligação ao lead é feita uma vez por chat, no fim.
  if (!opts.historico && !conversa.lead_cnpj && conversa.telefone) await linkConversationToLead(conversa.id, conversa.telefone)
  return {
    conversaId: conversa.id, mensagemId: msg.id, nova: msg.nova, conversaCriada: conversa.criada,
    telefone: conversa.telefone, leadCnpj: conversa.lead_cnpj,
  }
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

/**
 * Etiqueta posta ou tirada no celular. Fica espelhada; se for de vendedor, direciona a conversa para ele (vale a última
 * mudança) e, ao sair, só limpa o direcionamento que era dela. Conversa que ainda não existe recebe ao nascer.
 */
export async function aplicarEtiqueta(ev: EtiquetaEvent): Promise<void> {
  if (ev.tipo === 'add') {
    await query(`INSERT INTO whatsapp_chat_etiquetas (instancia, chat_jid, label_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [ev.instancia, ev.chatJid, ev.labelId])
  } else {
    await query(`DELETE FROM whatsapp_chat_etiquetas WHERE instancia = $1 AND chat_jid = $2 AND label_id = $3`, [ev.instancia, ev.chatJid, ev.labelId])
  }
  const [etiqueta] = await query<{ user_id: string | null }>(
    `SELECT user_id FROM whatsapp_etiquetas WHERE instancia = $1 AND label_id = $2`, [ev.instancia, ev.labelId]
  )
  if (!etiqueta?.user_id) return
  const telefone = phoneFromJid(ev.chatJid)
  const onde = `instancia = $1 AND (lid = $2 OR telefone = $2 OR telefone = $3)`
  if (ev.tipo === 'add') {
    await query(`UPDATE whatsapp_conversas SET atendente_id = $4, arquivada_em = NULL WHERE ${onde}`,
      [ev.instancia, ev.chatJid, telefone ?? ev.chatJid, etiqueta.user_id])
  } else {
    await query(`UPDATE whatsapp_conversas SET atendente_id = NULL WHERE ${onde} AND atendente_id = $4`,
      [ev.instancia, ev.chatJid, telefone ?? ev.chatJid, etiqueta.user_id])
  }
}

/**
 * Importa o histórico de um chat guardado no Evolution, entre `desde` e `ate` (o momento da reconexão: o que chegou
 * depois entra pelo webhook, como mensagem nova). Idempotente. Conversa só com histórico e sem vendedor fica arquivada,
 * para não encher "Em aberto"; vale também quando uma importação anterior parou no meio.
 */
export async function importarChat(
  instancia: string, chat: { jid: string; nome: string | null }, desde: Date, ate: Date
): Promise<{ mensagens: number; novas: number }> {
  const par = await parDoContato(chat.jid, { estrito: true })
  let mensagens = 0
  let novas = 0
  let ultima: Gravada | null = null
  for (let pagina = 1; pagina <= 500; pagina++) {
    const { registros, paginas } = await mensagensDoChat(chat.jid, desde, ate, pagina)
    for (const r of registros) {
      const ev = parseMensagem(instancia, r)
      if (ev.kind !== 'mensagem') continue
      ultima = await recordMessage({ ...ev, lid: ev.lid ?? par.lid, telefone: ev.telefone ?? par.telefone }, { historico: true })
      mensagens++
      if (ultima.nova) novas++
    }
    if (pagina >= paginas) break
  }
  if (!ultima) return { mensagens, novas }
  await query(
    `UPDATE whatsapp_conversas SET
       nome_contato = COALESCE(nome_contato, $2),
       arquivada_em = CASE WHEN atendente_id IS NULL AND arquivada_em IS NULL AND historico_ate IS NOT NULL
                            AND ultima_mensagem_em <= historico_ate THEN NOW() ELSE arquivada_em END
     WHERE id = $1`,
    [ultima.conversaId, chat.nome]
  )
  if (!ultima.leadCnpj && ultima.telefone) await linkConversationToLead(ultima.conversaId, ultima.telefone)
  return { mensagens, novas }
}
