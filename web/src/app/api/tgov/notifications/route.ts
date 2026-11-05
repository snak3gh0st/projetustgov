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
      || role === 'coord_prestacao'
      || role === 'assistente_prestacao'

    const items = await query<{
      proposta_key: string
      titulo: string | null
      event_type: string
      event_at: string
      comment_author_nome: string | null
      comment_body: string | null
      tab: string | null
    }>(`
      -- Começa pelos eventos (comentários, situação, atribuição), não pelas
      -- ~900 mil linhas de propostas: só elas podem gerar notificação.
      WITH last_comments AS (
        SELECT DISTINCT ON (c.target_key)
          c.target_key AS proposta_key,
          c.created_at AS comment_at,
          c.body AS comment_body,
          u.nome AS comment_author_nome
        FROM tgov_comments c
        LEFT JOIN users u ON u.id = c.author_id
        WHERE c.target_type = 'proposta'
        ORDER BY c.target_key, c.created_at DESC
      ),
      candidates AS (
        SELECT proposta_key FROM last_comments
        UNION
        SELECT nr_proposta FROM tgov_propostas
        WHERE nr_proposta IS NOT NULL
          AND (situacao_changed_at IS NOT NULL OR tecnico_assigned_at IS NOT NULL)
      ),
      linked AS (
        ${seeAll
          ? `SELECT k.proposta_key FROM candidates k
             WHERE EXISTS (SELECT 1 FROM tgov_propostas tp WHERE tp.nr_proposta = k.proposta_key)
                OR EXISTS (SELECT 1 FROM propostas p WHERE p.nr_proposta = k.proposta_key)`
          : `SELECT k.proposta_key FROM candidates k
             WHERE k.proposta_key IN (
               SELECT proposta_key FROM tgov_proposta_participants WHERE user_id = $1
               UNION
               SELECT nr_proposta FROM tgov_propostas WHERE tecnico_id = $1 AND nr_proposta IS NOT NULL
               UNION
               SELECT nr_proposta FROM propostas WHERE tecnico_id = $1 AND nr_proposta IS NOT NULL
             )`
        }
      ),
      activities AS (
        SELECT
          l.proposta_key,
          info.titulo,
          info.tab,
          lc.comment_at,
          lc.comment_author_nome,
          lc.comment_body,
          info.situacao_changed_at,
          info.tecnico_assigned_at,
          GREATEST(
            COALESCE(lc.comment_at, '1970-01-01'::timestamptz),
            COALESCE(info.situacao_changed_at, '1970-01-01'::timestamptz),
            COALESCE(info.tecnico_assigned_at, '1970-01-01'::timestamptz)
          ) AS latest_at,
          s.seen_at
        FROM linked l
        LEFT JOIN LATERAL (
          SELECT titulo, situacao_changed_at, tecnico_assigned_at, 'execucao' AS tab, 0 AS ord
          FROM tgov_propostas WHERE nr_proposta = l.proposta_key
          UNION ALL
          SELECT titulo, NULL::timestamptz, NULL::timestamptz, 'aprovacao', 1
          FROM propostas WHERE nr_proposta = l.proposta_key
          ORDER BY ord
          LIMIT 1
        ) info ON true
        LEFT JOIN last_comments lc ON lc.proposta_key = l.proposta_key
        LEFT JOIN tgov_proposta_seen s ON s.user_id = $1 AND s.proposta_key = l.proposta_key
      )
      SELECT
        proposta_key,
        titulo,
        CASE
          WHEN comment_at >= GREATEST(COALESCE(situacao_changed_at, '1970-01-01'),
                                      COALESCE(tecnico_assigned_at, '1970-01-01'))
          THEN 'comment'
          WHEN situacao_changed_at >= COALESCE(tecnico_assigned_at, '1970-01-01')
          THEN 'situacao'
          ELSE 'assignment'
        END AS event_type,
        latest_at::text AS event_at,
        comment_author_nome,
        comment_body,
        tab
      FROM activities
      WHERE latest_at > COALESCE(seen_at, '1970-01-01'::timestamptz)
      ORDER BY latest_at DESC
      LIMIT 50
    `, [userId])

    // Stale assignments: for coord/assistente/adm_produto only
    const canSeeStale = ['coord_aprovacao', 'assistente_aprovacao', 'coord_execucao', 'assistente_execucao', 'adm_produto', 'diretoria', 'admin'].includes(role)
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
