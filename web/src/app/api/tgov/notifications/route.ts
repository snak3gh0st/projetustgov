import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userId = session.userId
    const role = session.role

    // adm_produto and coord/assistente roles see ALL TGov proposals (they have supervisory scope)
    const seeAll = role === 'adm_produto'
      || role === 'coord_aprovacao'
      || role === 'assistente_aprovacao'
      || role === 'coord_execucao'
      || role === 'assistente_execucao'

    const items = await query<{
      proposta_key: string
      titulo: string | null
      event_type: string
      event_at: string
      comment_author_nome: string | null
      comment_body: string | null
      tab: string | null
    }>(`
      WITH all_props AS (
        SELECT nr_proposta, titulo, situacao_changed_at, tecnico_assigned_at, 'execucao' AS tab
        FROM tgov_propostas
        WHERE nr_proposta IS NOT NULL
        UNION ALL
        SELECT nr_proposta, titulo, NULL::timestamptz AS situacao_changed_at, NULL::timestamptz AS tecnico_assigned_at, 'aprovacao' AS tab
        FROM propostas
        WHERE nr_proposta IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM tgov_propostas tp2 WHERE tp2.nr_proposta = propostas.nr_proposta
          )
      ),
      linked AS (
        ${seeAll
          ? `SELECT nr_proposta AS proposta_key FROM all_props`
          : `SELECT proposta_key FROM tgov_proposta_participants WHERE user_id = $1
             UNION
             SELECT nr_proposta AS proposta_key FROM tgov_propostas WHERE tecnico_id = $1 AND nr_proposta IS NOT NULL
             UNION
             SELECT nr_proposta AS proposta_key FROM propostas WHERE tecnico_id = $1 AND nr_proposta IS NOT NULL`
        }
      ),
      activities AS (
        SELECT
          l.proposta_key,
          GREATEST(
            COALESCE((SELECT MAX(c.created_at) FROM tgov_comments c
             WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key), '1970-01-01'::timestamptz),
            COALESCE(tp.situacao_changed_at, '1970-01-01'::timestamptz),
            COALESCE(tp.tecnico_assigned_at, '1970-01-01'::timestamptz)
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
          tp.titulo,
          tp.tab,
          (SELECT u.nome FROM tgov_comments c
           LEFT JOIN users u ON u.id = c.author_id
           WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key
           ORDER BY c.created_at DESC LIMIT 1) AS comment_author_nome,
          (SELECT c.body FROM tgov_comments c
           WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key
           ORDER BY c.created_at DESC LIMIT 1) AS comment_body
        FROM linked l
        LEFT JOIN all_props tp ON tp.nr_proposta = l.proposta_key
        LEFT JOIN tgov_proposta_seen s ON s.user_id = $1 AND s.proposta_key = l.proposta_key
        WHERE GREATEST(
          COALESCE((SELECT MAX(c.created_at) FROM tgov_comments c
           WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key), '1970-01-01'::timestamptz),
          COALESCE(tp.situacao_changed_at, '1970-01-01'::timestamptz),
          COALESCE(tp.tecnico_assigned_at, '1970-01-01'::timestamptz)
        ) > COALESCE(s.seen_at, '1970-01-01'::timestamptz)
      )
      SELECT proposta_key, titulo, event_type, latest_at::text AS event_at, comment_author_nome, comment_body, tab
      FROM activities
      WHERE latest_at IS NOT NULL
      ORDER BY latest_at DESC
      LIMIT 50
    `, [userId])

    // Stale assignments: for coord/assistente/adm_produto only
    const canSeeStale = ['coord_aprovacao', 'assistente_aprovacao', 'adm_produto', 'gestor', 'admin'].includes(role)
    let stale: { proposta_key: string; titulo: string | null; tecnico_nome: string | null; assigned_at: string; hours: number }[] = []

    if (canSeeStale) {
      // adm_produto (seeAll) sees all proposals without needing a participant row
      const staleQuery = seeAll
        ? `
          SELECT
            tp.nr_proposta AS proposta_key,
            tp.titulo,
            u.nome AS tecnico_nome,
            tp.tecnico_assigned_at::text AS assigned_at,
            EXTRACT(EPOCH FROM (now() - tp.tecnico_assigned_at))::int / 3600 AS hours
          FROM tgov_propostas tp
          LEFT JOIN users u ON u.id = tp.tecnico_id
          LEFT JOIN tgov_proposta_seen s
            ON s.user_id = tp.tecnico_id AND s.proposta_key = tp.nr_proposta
          WHERE tp.tecnico_id IS NOT NULL
            AND tp.tecnico_assigned_at < now() - interval '24 hours'
            AND (s.seen_at IS NULL OR s.seen_at < tp.tecnico_assigned_at)
          ORDER BY tp.tecnico_assigned_at ASC
          LIMIT 20
        `
        : `
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
        `

      stale = await query<{
        proposta_key: string
        titulo: string | null
        tecnico_nome: string | null
        assigned_at: string
        hours: number
      }>(staleQuery, seeAll ? [] : [userId])
    }

    return NextResponse.json({
      count: items.length,
      items: items.map(r => ({
        propostaKey: r.proposta_key,
        titulo: r.titulo,
        eventType: r.event_type,
        eventAt: r.event_at,
        commentAuthorNome: r.comment_author_nome ?? null,
        commentBody: r.comment_body ? r.comment_body.slice(0, 120) : null,
        tab: r.tab ?? null,
      })),
      stale: stale.map(r => ({
        propostaKey: r.proposta_key,
        titulo: r.titulo,
        tecnicoNome: r.tecnico_nome,
        assignedAt: r.assigned_at,
        hoursWithoutAccess: r.hours,
      })),
    })
  } catch (error) {
    console.error('[api/tgov/notifications][GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
