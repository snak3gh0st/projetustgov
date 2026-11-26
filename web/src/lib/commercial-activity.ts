import 'server-only'
import { query } from './db'
import { whatsappChannels } from './whatsapp/channels'

export function validActivityDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export interface CommercialActivityRow {
  id: string; nome: string; contatos: number; registros: number; mensagens: number; emails: number
  movimentados: number; perdas: number; ligacoes_manuais: number
}

export async function commercialActivity(day: string, seller: string | null) {
  if (!validActivityDate(day)) throw new Error('Data inválida')
  const [ready] = await query<{ events: boolean; workspace: boolean; whatsapp: boolean }>(`SELECT
    to_regclass('public.lead_events') IS NOT NULL AS events,
    to_regclass('public.workspace_activity') IS NOT NULL AS workspace,
    to_regclass('public.whatsapp_mensagens') IS NOT NULL AS whatsapp`)
  const instances = whatsappChannels().map((c) => c.instance)
  const range = (column: string) => `${column} >= $1::date::timestamp AT TIME ZONE 'America/Sao_Paulo'
    AND ${column} < ($1::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`
  const empty = `SELECT NULL::uuid AS ator, NULL::text AS contato, NULL::text AS tipo WHERE FALSE`
  const wa = ready.whatsapp && instances.length ? `SELECT wm.autor_id AS ator,
    COALESCE(wc.lead_cnpj, wc.telefone) AS contato, 'mensagem'::text AS tipo
    FROM whatsapp_mensagens wm JOIN whatsapp_conversas wc ON wc.id = wm.conversa_id
    WHERE wm.direcao = 'enviada' AND wm.origem = 'projete' AND wm.autor_id IS NOT NULL
      AND wm.status NOT IN ('falhou', 'enviando') AND wm.tipo <> 'reacao' AND wc.instancia = ANY($3::text[])
      AND ${range('wm.enviada_em')}` : empty
  const mail = ready.workspace ? `SELECT a.actor_id AS ator, c.cnpj AS contato, 'email'::text AS tipo
    FROM workspace_activity a JOIN workspace_contexts c ON c.id = a.context_id
    WHERE a.action = 'email.sent' AND ${range('a.created_at')}` : empty
  const moves = ready.events ? `SELECT e.user_id AS ator, COUNT(DISTINCT e.lead_id)::int AS movimentados,
    COUNT(DISTINCT e.lead_id) FILTER (WHERE e.valor_novo = 'Churn')::int AS perdas FROM lead_events e
    WHERE e.origem = 'manual' AND e.tipo IN ('status', 'status_execucao') AND ${range('e.created_at')} GROUP BY 1`
    : `SELECT NULL::uuid AS ator, 0 AS movimentados, 0 AS perdas WHERE FALSE`
  const rows = await query<CommercialActivityRow>(`WITH contatos AS (
    SELECT cn.vendedor_id AS ator, REGEXP_REPLACE(cn.lead_cnpj, '[^0-9]', '', 'g') AS contato,
      CASE WHEN cn.tipo = 'ligacao' THEN 'ligacao' ELSE 'registro' END AS tipo FROM contact_notes cn
    WHERE cn.tipo IN ('ligacao', 'email', 'whatsapp', 'reuniao', 'outro') AND ${range('cn.created_at')}
    UNION ALL ${wa}
    UNION ALL ${mail}
  ), atividade AS (
    SELECT ator, COUNT(DISTINCT contato)::int AS contatos, COUNT(*)::int AS registros,
      COUNT(*) FILTER (WHERE tipo = 'mensagem')::int AS mensagens,
      COUNT(*) FILTER (WHERE tipo = 'email')::int AS emails,
      COUNT(*) FILTER (WHERE tipo = 'ligacao')::int AS ligacoes_manuais FROM contatos GROUP BY 1
  ), movimentos AS (${moves})
  SELECT u.id, u.nome, COALESCE(a.contatos, 0)::int AS contatos, COALESCE(a.registros, 0)::int AS registros,
    COALESCE(a.mensagens, 0)::int AS mensagens, COALESCE(a.emails, 0)::int AS emails,
    COALESCE(m.movimentados, 0)::int AS movimentados, COALESCE(m.perdas, 0)::int AS perdas,
    COALESCE(a.ligacoes_manuais, 0)::int AS ligacoes_manuais
  FROM users u LEFT JOIN atividade a ON a.ator = u.id LEFT JOIN movimentos m ON m.ator = u.id
  WHERE u.active AND u.role IN ('vendedor', 'coordenador', 'gestor', 'diretoria', 'admin')
    AND ($2::uuid IS NULL OR u.id = $2::uuid) AND $3::text[] IS NOT NULL ORDER BY u.nome`, [day, seller, instances])
  return { data: day, fuso: 'America/Sao_Paulo', voip_integrado: false, consultores: rows }
}
