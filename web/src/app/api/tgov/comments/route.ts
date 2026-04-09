import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov, canCommentTgov } from '@/lib/dal'

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

    const authorRows = await query<{ nome: string | null }>(
      `SELECT nome FROM users WHERE id = $1`,
      [created.author_id],
    )
    return NextResponse.json(
      { comment: { ...created, author_nome: authorRows[0]?.nome ?? null } },
      { status: 201 },
    )
  } catch (error) {
    console.error('[api/tgov/comments][POST] error:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
