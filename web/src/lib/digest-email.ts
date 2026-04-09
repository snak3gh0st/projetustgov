import { query } from './db'

interface NotificationItem {
  propostaKey: string
  titulo: string | null
  eventType: string
  eventAt: string
}

interface StaleItem {
  propostaKey: string
  titulo: string | null
  tecnicoNome: string | null
  assignedAt: string
  hoursWithoutAccess: number
}

export interface DigestData {
  items: NotificationItem[]
  stale: StaleItem[]
}

const EVENT_LABELS: Record<string, string> = {
  comment: 'Novo comentário',
  situacao: 'Situação atualizada',
  assignment: 'Técnico atribuído',
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
  let stale: StaleItem[] = []

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'agora'
  if (hours < 24) return `${hours}h atrás`
  return `${Math.floor(hours / 24)}d atrás`
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

/**
 * Build HTML email for the digest.
 */
export function buildDigestHtml(
  userName: string,
  data: DigestData,
): string {
  const itemsHtml = data.items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <strong style="color:#1a1a1a;font-size:14px;">${item.propostaKey}</strong>
        ${item.titulo ? `<br><span style="color:#666;font-size:13px;">${item.titulo}</span>` : ''}
        <br><span style="color:#0072F7;font-size:12px;">${EVENT_LABELS[item.eventType] || item.eventType}</span>
        <span style="color:#999;font-size:12px;"> · ${timeAgo(item.eventAt)}</span>
      </td>
    </tr>
  `).join('')

  const staleHtml = data.stale.length > 0 ? `
    <tr><td style="padding:16px 0 8px;"><strong style="color:#b45309;font-size:14px;">⚠️ Sem acesso há +24h</strong></td></tr>
    ${data.stale.map(item => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #fef3c7;">
          <strong style="color:#1a1a1a;font-size:14px;">${item.propostaKey}</strong>
          ${item.titulo ? `<br><span style="color:#666;font-size:13px;">${item.titulo}</span>` : ''}
          <br><span style="color:#b45309;font-size:12px;">${item.tecnicoNome || 'Técnico'} não acessou (${item.hoursWithoutAccess}h)</span>
        </td>
      </tr>
    `).join('')}
  ` : ''

  const totalCount = data.items.length + data.stale.length

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e5e5;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:#0072F7;padding:24px;text-align:center;">
          <span style="color:#fff;font-size:20px;font-weight:bold;">Projetus CRM</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px;">
          <p style="color:#1a1a1a;font-size:16px;margin:0 0 8px;">Olá ${userName},</p>
          <p style="color:#666;font-size:14px;margin:0 0 24px;">📋 ${totalCount} proposta${totalCount !== 1 ? 's' : ''} com novidades</p>

          ${data.items.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 0 8px;"><strong style="color:#1a1a1a;font-size:14px;">Novas atividades</strong></td></tr>
            ${itemsHtml}
          </table>
          ` : ''}

          ${staleHtml ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">${staleHtml}</table>` : ''}

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr><td align="center">
              <a href="${APP_URL}/tgov" style="display:inline-block;background:#0072F7;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                Acessar TGov Dashboard
              </a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid #e5e5e5;text-align:center;">
          <span style="color:#999;font-size:11px;">Enviado por Projetus CRM · Powered by <a href="https://sigmaintel.io" style="color:#0072F7;text-decoration:none;">SigmaIntel</a></span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
