import { query } from './db'
import { digestEmail, type DigestItem, type DigestStale } from './email-templates'

export interface DigestData {
  items: DigestItem[]
  stale: DigestStale[]
}


/**
 * Get unseen notifications for a user (same logic as GET /api/tgov/notifications).
 */
export async function getNotificationsForUser(userId: string, role: string): Promise<DigestData> {
  const items = await query<{
    proposta_key: string
    titulo: string | null
    event_type: string
    event_at: string
  }>(`
    WITH linked AS (
      SELECT proposta_key FROM tgov_proposta_participants WHERE user_id = $1
      UNION
      SELECT nr_proposta AS proposta_key FROM tgov_propostas WHERE tecnico_id = $1 AND nr_proposta IS NOT NULL
    ),
    activities AS (
      SELECT
        l.proposta_key,
        GREATEST(
          (SELECT MAX(c.created_at) FROM tgov_comments c
           WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key),
          tp.situacao_changed_at,
          tp.tecnico_assigned_at
        ) AS latest_at,
        CASE
          WHEN (SELECT MAX(c.created_at) FROM tgov_comments c
                WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key)
               >= GREATEST(COALESCE(tp.situacao_changed_at, '1970-01-01'),
                           COALESCE(tp.tecnico_assigned_at, '1970-01-01'))
          THEN 'comment'
          WHEN tp.situacao_changed_at >= COALESCE(tp.tecnico_assigned_at, '1970-01-01')
          THEN 'situacao'
          ELSE 'assignment'
        END AS event_type,
        tp.titulo
      FROM linked l
      LEFT JOIN tgov_propostas tp ON tp.nr_proposta = l.proposta_key
      LEFT JOIN tgov_proposta_seen s ON s.user_id = $1 AND s.proposta_key = l.proposta_key
      WHERE GREATEST(
        (SELECT MAX(c.created_at) FROM tgov_comments c
         WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key),
        tp.situacao_changed_at,
        tp.tecnico_assigned_at
      ) > COALESCE(s.seen_at, '1970-01-01'::timestamptz)
    )
    SELECT proposta_key, titulo, event_type, latest_at::text AS event_at
    FROM activities
    WHERE latest_at IS NOT NULL
    ORDER BY latest_at DESC
    LIMIT 50
  `, [userId])

  const canSeeStale = ['coord_aprovacao', 'assistente_aprovacao', 'adm_produto', 'gestor', 'admin'].includes(role)
  let stale: DigestStale[] = []

  if (canSeeStale) {
    const rows = await query<{
      proposta_key: string
      titulo: string | null
      tecnico_nome: string | null
      assigned_at: string
      hours: number
    }>(`
      SELECT
        tp.nr_proposta AS proposta_key,
        tp.titulo,
        u.nome AS tecnico_nome,
        tp.tecnico_assigned_at::text AS assigned_at,
        EXTRACT(EPOCH FROM (now() - tp.tecnico_assigned_at))::int / 3600 AS hours
      FROM tgov_propostas tp
      JOIN tgov_proposta_participants pp
        ON pp.proposta_key = tp.nr_proposta AND pp.user_id = $1
      LEFT JOIN users u ON u.id = tp.tecnico_id
      LEFT JOIN tgov_proposta_seen s
        ON s.user_id = tp.tecnico_id AND s.proposta_key = tp.nr_proposta
      WHERE tp.tecnico_id IS NOT NULL
        AND tp.tecnico_assigned_at < now() - interval '24 hours'
        AND (s.seen_at IS NULL OR s.seen_at < tp.tecnico_assigned_at)
      ORDER BY tp.tecnico_assigned_at ASC
      LIMIT 20
    `, [userId])

    stale = rows.map(r => ({
      propostaKey: r.proposta_key,
      titulo: r.titulo,
      tecnicoNome: r.tecnico_nome,
      assignedAt: r.assigned_at,
      hoursWithoutAccess: r.hours,
    }))
  }

  return {
    items: items.map(r => ({
      propostaKey: r.proposta_key,
      titulo: r.titulo,
      eventType: r.event_type,
      eventAt: r.event_at,
    })),
    stale,
  }
}

const APP_URL = process.env.NEXTAUTH_URL || 'https://projetus.vercel.app'

export function buildDigestHtml(userName: string, data: DigestData): string {
  return digestEmail({ nome: userName, items: data.items, stale: data.stale, appUrl: APP_URL }).html
}
