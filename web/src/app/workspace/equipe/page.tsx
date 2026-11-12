import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { canReadTeamCalendar } from '@/lib/workspace/calendar-policy'
import TeamCalendar from '@/components/workspace/TeamCalendar'

export default async function TeamCalendarPage() {
  const session = await verifySession()
  if (!canReadTeamCalendar(session.role)) redirect('/sem-permissao')
  return <TeamCalendar initialDate={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())} />
}
