import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov, canCommentTgov } from '@/lib/dal'
import { sendCommentNotification, sendParticipantAddedNotification } from '@/lib/email-service'

export const dynamic = 'force-dynamic'

const VALID_TARGETS = ['proposta', 'execucao'] as const
type TargetType = (typeof VALID_TARGETS)[number]

// GET /api/tgov/comments?target_type=proposta|execucao&target_key=...
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const target_type = searchParams.get('target_type')
    const target_key = searchParams.get('target_key')

    if (!target_type || !VALID_TARGETS.includes(target_type as TargetType)) {
      return NextResponse.json({ error: 'target_type inválido (use proposta|execucao)' }, { status: 400 })
    }
    if (!target_key) {
      return NextResponse.json({ error: 'target_key obrigatório' }, { status: 400 })
    }

    const rows = await query<{
      id: string
      target_type: string
      target_key: string
      author_id: string
      body: string
      created_at: string
      author_nome: string | null
    }>(
      `SELECT c.id, c.target_type, c.target_key, c.author_id, c.body, c.created_at,
              u.nome AS author_nome
       FROM tgov_comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.target_type = $1 AND c.target_key = $2
       ORDER BY c.created_at DESC`,
      [target_type, target_key],
    )
    return NextResponse.json({ comments: rows })
  } catch (error) {
    console.error('[api/tgov/comments][GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

// POST /api/tgov/comments  body: { target_type, target_key, body }
export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canCommentTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const { target_type, target_key, body: text } = payload as {
      target_type?: string
      target_key?: string
      body?: string
    }
    if (!target_type || !VALID_TARGETS.includes(target_type as TargetType)) {
      return NextResponse.json({ error: 'target_type inválido (use proposta|execucao)' }, { status: 400 })
    }
    if (!target_key) {
      return NextResponse.json({ error: 'target_key obrigatório' }, { status: 400 })
    }
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'body vazio' }, { status: 400 })
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: 'body excede 5000 chars' }, { status: 400 })
    }

    const rows = await query<{
      id: string
      target_type: string
      target_key: string
      author_id: string
      body: string
      created_at: string
    }>(
      `INSERT INTO tgov_comments (target_type, target_key, author_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, target_type, target_key, author_id, body, created_at`,
      [target_type, target_key, session.userId, text.trim()],
    )

    const created = rows[0]

    // Auto-register commenter as participant
    await query(
      `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [session.userId, target_key],
    )

    // Also register the assigned tecnico as participant so they always receive
    // notifications when someone else (e.g. adm_produto) comments on their proposal.
    // Check both storage tables: tgov_propostas (TGov-only) and propostas (CRM).
    if (target_type === 'proposta') {
      const addedFromTgov = await query<{ user_id: string }>(
        `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
         SELECT tecnico_id, $1
         FROM tgov_propostas
         WHERE nr_proposta = $1 AND tecnico_id IS NOT NULL AND tecnico_id <> $2
         ON CONFLICT DO NOTHING
         RETURNING user_id`,
        [target_key, session.userId],
      )
      const addedFromCrm = await query<{ user_id: string }>(
        `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
         SELECT tecnico_id, $1
         FROM propostas
         WHERE nr_proposta = $1 AND tecnico_id IS NOT NULL AND tecnico_id <> $2
         ON CONFLICT DO NOTHING
         RETURNING user_id`,
        [target_key, session.userId],
      )

      // Fire participant-added notification for each newly-added participant
      const newlyAdded = [...addedFromTgov, ...addedFromCrm].map(r => r.user_id)
      if (newlyAdded.length > 0) {
        try {
          const propostaMeta = await query<{ titulo: string | null }>(
            `SELECT titulo FROM tgov_propostas WHERE nr_proposta = $1
             UNION ALL
             SELECT NULL AS titulo FROM propostas WHERE nr_proposta = $1
             LIMIT 1`,
            [target_key],
          )
          for (const userId of newlyAdded) {
            sendParticipantAddedNotification({
              recipientId: userId,
              actorId: session.userId,
              propostaNr: target_key,
              propostaTitulo: propostaMeta[0]?.titulo ?? null,
            }).catch(err => console.error('[comments] participant-added notification failed', err))
          }
        } catch (err) {
          console.error('[comments] participant-added gather failed', err)
        }
      }
    }

    const authorRows = await query<{ nome: string | null }>(
      `SELECT nome FROM users WHERE id = $1`,
      [created.author_id],
    )

    // Fire-and-forget email notification — only for proposta comments
    if (target_type === 'proposta') {
      try {
        // Collect notification recipients from two sources:
        // 1. All registered participants (anyone who commented or was assigned as tecnico)
        // 2. All active supervisory-tier TGov users (adm_produto, coord_*, assistente_*, gestor, admin)
        //    — guarantees notifications always reach the supervisory tier even on a proposal's
        //    first comment when the participants table may only contain the commenter.
        const [participants, supervisors, propostaMeta] = await Promise.all([
          query<{ user_id: string }>(
            `SELECT user_id FROM tgov_proposta_participants WHERE proposta_key = $1`,
            [target_key],
          ),
          query<{ id: string }>(
            `SELECT id FROM users
             WHERE active = true
               AND email IS NOT NULL
               AND role IN ('adm_produto','coord_aprovacao','assistente_aprovacao','coord_prestacao','assistente_prestacao','gestor','admin')`,
            [],
          ),
          query<{ titulo: string | null }>(
            `SELECT titulo FROM tgov_propostas WHERE nr_proposta = $1
             UNION ALL
             SELECT NULL AS titulo FROM propostas WHERE nr_proposta = $1
             LIMIT 1`,
            [target_key],
          ),
        ])

        // Deduplicate recipient IDs from both sources
        const recipientIds = Array.from(new Set([
          ...participants.map(p => p.user_id),
          ...supervisors.map(s => s.id),
        ]))

        sendCommentNotification({
          recipientIds,
          commenterId: session.userId,
          commenterName: authorRows[0]?.nome ?? 'Alguém',
          propostaNr: target_key,
          propostaTitulo: propostaMeta[0]?.titulo ?? null,
          snippet: text.trim(),
        }).catch(err => console.error('[comments] notification failed', err))
      } catch (err) {
        console.error('[comments] recipient gather failed', err)
      }
    }

    return NextResponse.json(
      { comment: { ...created, author_nome: authorRows[0]?.nome ?? null } },
      { status: 201 },
    )
  } catch (error) {
    console.error('[api/tgov/comments][POST] error:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
