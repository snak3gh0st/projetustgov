import { WorkspaceError } from './domain.ts'
import { eventView, type GoogleApi } from './google.ts'
import type { WorkspaceStore } from './store.ts'
import type { WorkspaceActor } from './domain.ts'
import { canReadTeamCalendar, teamCalendarRange } from './calendar-policy.ts'

/** Only the viewer's Google grant is used. Never read a colleague's token or mailbox. */
export class TeamCalendarService {
  constructor(private store: WorkspaceStore, private google: GoogleApi, private actor: WorkspaceActor) {}
  async list(start: string, end: string, sellerId = '') {
    if (!canReadTeamCalendar(this.actor.role)) throw new WorkspaceError('A agenda da equipe é restrita à gestão comercial.', 403)
    const { from, to } = teamCalendarRange(start, end)
    const members = await this.store.rows(`SELECT u.id,u.nome name,COALESCE(g.status,'disconnected') connection_status
      FROM users u LEFT JOIN google_workspace_connections g ON g.user_id=u.id
      WHERE u.active AND u.role IN ('vendedor','coordenador','gestor') ORDER BY u.nome`)
    if (sellerId && !members.some(m => m.id === sellerId)) throw new WorkspaceError('Comercial não encontrado.', 404)
    const connection = await this.store.safeConnection(this.actor.userId)
    if (connection?.status !== 'active') return { members, items: [], connection, connected: false, limited: false, unavailable: [] }
    // These links can only be created by the existing client/project meeting workflow.
    const rows = await this.store.rows(`SELECT l.id,l.user_id,l.remote_id,l.metadata,l.context_id,
      c.cnpj,c.project_kind,c.project_key,u.nome seller_name,g.email calendar_email,
      (SELECT MAX(vp.nome) FROM vendedor_projetos vp WHERE regexp_replace(vp.cnpj,'\\D','','g')=c.cnpj) client_name
      FROM workspace_links l JOIN workspace_contexts c ON c.id=l.context_id
      JOIN users u ON u.id=l.user_id AND u.active AND u.role IN ('vendedor','coordenador','gestor')
      JOIN google_workspace_connections g ON g.user_id=u.id AND g.google_sub=l.google_sub AND g.status='active'
      WHERE l.kind='event' AND ($1::uuid IS NULL OR l.user_id=$1::uuid)
      AND EXISTS(SELECT 1 FROM vendedor_projetos vp WHERE regexp_replace(vp.cnpj,'\\D','','g')=c.cnpj
        AND (u.role='gestor' OR vp.vendedor_id=u.id OR vp.closer_id=u.id)
        AND (c.project_kind<>'comercial' OR vp.id::text=c.project_key))
      AND (c.project_kind<>'convenio' OR EXISTS(SELECT 1 FROM projetos_execucao pe
        WHERE pe.nr_convenio=c.project_key AND regexp_replace(pe.cnpj,'\\D','','g')=c.cnpj))
      ORDER BY l.updated_at DESC,l.id LIMIT 81`, [sellerId || null])
    const items: Record<string, any>[] = [], unavailable = new Set<string>(), deadline = Date.now() + 45000
    let processed = 0
    for (let i = 0; i < Math.min(rows.length, 80) && Date.now() < deadline; i += 5) {
      await Promise.all(rows.slice(i, Math.min(i + 5, 80)).map(async row => {
        processed++
        const calendarId = row.metadata.calendarId === 'primary' ? row.calendar_email : row.metadata.calendarId
        if (!calendarId) { unavailable.add(row.user_id); return }
        try {
          const raw = await this.google.event(calendarId, row.remote_id)
          // A private or redacted Google event never falls back to our cached title/client/links.
          if (raw.visibility === 'private' || (raw.status !== 'cancelled' && !raw.summary)) return
          const event = eventView(raw, calendarId)
          if (!event.start || Date.parse(event.start) >= Date.parse(to) || Date.parse(event.end || event.start) <= Date.parse(from)) return
          items.push({ ...event, meetingId: row.id, sellerId: row.user_id, sellerName: row.seller_name,
            clientName: row.client_name, cnpj: row.cnpj, projectKind: row.project_kind, projectKey: row.project_key,
            outcome: row.metadata.commercialOutcome || null })
        } catch (e) {
          if (e instanceof WorkspaceError && [403, 404].includes(e.status)) { unavailable.add(row.user_id); return }
          throw e
        }
      }))
    }
    return { members, connection, connected: true, items: items.sort((a, b) => String(a.start).localeCompare(String(b.start))),
      unavailable: Array.from(unavailable), limited: rows.length > 80 || processed < rows.length }
  }
}
