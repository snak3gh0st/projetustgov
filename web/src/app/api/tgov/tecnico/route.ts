import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canWriteTgov } from '@/lib/dal'
import { sendAssignmentNotification } from '@/lib/email-service'

export const dynamic = 'force-dynamic'

const VALID_TARGETS = ['proposta', 'execucao'] as const
type TargetType = (typeof VALID_TARGETS)[number]
const TECNICO_ROLES = ['adm_produto', 'gestor', 'admin', 'coord_aprovacao', 'assistente_aprovacao', 'projetista'] as const

// Simple UUID v1-v5 sanity check (8-4-4-4-12 hex)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/tgov/tecnico  body: { target_type, target_key, tecnico_id }
export async function PATCH(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canWriteTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const { target_type, target_key, tecnico_id } = payload as {
      target_type?: string
      target_key?: string
      tecnico_id?: string | null
    }

    if (!target_type || !VALID_TARGETS.includes(target_type as TargetType)) {
      return NextResponse.json({ error: 'target_type inválido (use proposta|execucao)' }, { status: 400 })
    }
    if (!target_key) {
      return NextResponse.json({ error: 'target_key obrigatório' }, { status: 400 })
    }
    // tecnico_id é UUID (users.id) ou null para desatribuir
    if (tecnico_id !== null && tecnico_id !== undefined) {
      if (typeof tecnico_id !== 'string' || !UUID_RE.test(tecnico_id)) {
        return NextResponse.json({ error: 'tecnico_id deve ser UUID ou null' }, { status: 400 })
      }
    }
    const tecnicoIdValue: string | null = tecnico_id ?? null

    // Validar pool de técnicos elegíveis
    if (tecnicoIdValue !== null) {
      const u = await query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [tecnicoIdValue],
      )
      if (!u[0]) {
        return NextResponse.json({ error: 'usuário não existe' }, { status: 400 })
      }
      if (!TECNICO_ROLES.includes(u[0].role as (typeof TECNICO_ROLES)[number])) {
        return NextResponse.json({ error: 'usuário fora do pool de técnicos' }, { status: 400 })
      }
    }

    // Resolver tabela física onde o registro vive
    let updated = 0
    if (target_type === 'proposta') {
      const r1 = await query<{ nr_proposta: string }>(
        `UPDATE propostas SET tecnico_id = $1 WHERE nr_proposta = $2 RETURNING nr_proposta`,
        [tecnicoIdValue, target_key],
      )
      updated += r1.length
      if (updated === 0) {
        const r2 = await query<{ nr_proposta: string }>(
          `UPDATE tgov_propostas SET tecnico_id = $1, tecnico_assigned_at = now(), tecnico_assigned_by = $3
   WHERE nr_proposta = $2 RETURNING nr_proposta`,
          [tecnicoIdValue, target_key, session.userId],
        )
        updated += r2.length
      }
    } else {
      // execucao: tentar projetos_execucao por nr_convenio, depois tgov_projetos_execucao,
      // depois fallback proposta sem convênio (target_key = nr_proposta)
      const r1 = await query<{ nr_convenio: string }>(
        `UPDATE projetos_execucao SET tecnico_id = $1 WHERE nr_convenio = $2 RETURNING nr_convenio`,
        [tecnicoIdValue, target_key],
      )
      updated += r1.length
      if (updated === 0) {
        const r2 = await query<{ nr_convenio: string }>(
          `UPDATE tgov_projetos_execucao SET tecnico_id = $1 WHERE nr_convenio = $2 RETURNING nr_convenio`,
          [tecnicoIdValue, target_key],
        )
        updated += r2.length
      }
      if (updated === 0) {
        const r3 = await query<{ nr_proposta: string }>(
          `UPDATE propostas SET tecnico_id = $1 WHERE nr_proposta = $2 RETURNING nr_proposta`,
          [tecnicoIdValue, target_key],
        )
        updated += r3.length
        if (updated === 0) {
          const r4 = await query<{ nr_proposta: string }>(
            `UPDATE tgov_propostas SET tecnico_id = $1, tecnico_assigned_at = now(), tecnico_assigned_by = $3
   WHERE nr_proposta = $2 RETURNING nr_proposta`,
            [tecnicoIdValue, target_key, session.userId],
          )
          updated += r4.length
        }
      }
    }

    if (updated === 0) {
      return NextResponse.json({ error: 'registro não encontrado' }, { status: 404 })
    }

    // Auto-register assigner as participant
    await query(
      `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [session.userId, target_key],
    )

    // Fire-and-forget email notification for actual proposta assignments
    if (tecnicoIdValue && target_type === 'proposta') {
      try {
        const assignees = await query<{ nome: string }>(
          `SELECT nome FROM users WHERE id = $1`,
          [tecnicoIdValue],
        )
        const participants = await query<{ user_id: string }>(
          `SELECT user_id FROM tgov_proposta_participants WHERE proposta_key = $1`,
          [target_key],
        )
        const propostaMeta = await query<{ titulo: string | null }>(
          `SELECT titulo FROM tgov_propostas WHERE nr_proposta = $1
           UNION ALL
           SELECT NULL AS titulo FROM propostas WHERE nr_proposta = $1
           LIMIT 1`,
          [target_key],
        )
        const recipientIds = Array.from(new Set([tecnicoIdValue, ...participants.map(p => p.user_id)]))

        sendAssignmentNotification({
          recipientIds,
          actorId: session.userId,
          assigneeId: tecnicoIdValue,
          assigneeName: assignees[0]?.nome ?? 'Técnico',
          propostaNr: target_key,
          propostaTitulo: propostaMeta[0]?.titulo ?? null,
        }).catch(err => console.error('[tecnico] notification failed', err))
      } catch (err) {
        console.error('[tecnico] recipient gather failed', err)
      }
    }

    return NextResponse.json({ ok: true, updated })
  } catch (error) {
    console.error('[api/tgov/tecnico][PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update tecnico' }, { status: 500 })
  }
}
