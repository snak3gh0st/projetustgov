import { WorkspaceError, dateTime } from './domain.ts'

export function canReadTeamCalendar(role: string) {
  return ['gestor', 'diretoria', 'admin'].includes(role)
}
export const MEETING_OUTCOMES = {
  pending: 'Sem resultado registrado', completed: 'Realizada', rescheduled: 'Reagendada',
  cancelled: 'Cancelada', no_show: 'Cliente ausente',
} as const
export type MeetingOutcome = keyof typeof MEETING_OUTCOMES
export function meetingStatus(event: { status?: string; outcome?: { status?: string } | null; end?: string; start?: string }, now = Date.now()) {
  if (event.status === 'cancelled') return 'cancelled'
  const status = event.outcome?.status
  if (status && status !== 'pending' && status in MEETING_OUTCOMES) return status as MeetingOutcome
  return Date.parse(event.end || event.start || '') < now ? 'pending' : 'scheduled'
}
export function teamCalendarRange(start: string, end: string) {
  const from = dateTime(start), to = dateTime(end), duration = Date.parse(to) - Date.parse(from)
  if (duration <= 0 || duration > 42 * 86400000) throw new WorkspaceError('Escolha um período de até 42 dias.')
  return { from, to }
}

