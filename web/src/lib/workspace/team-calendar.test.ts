import test from 'node:test'
import assert from 'node:assert/strict'
import { TeamCalendarService } from './team-calendar.ts'
import { canReadTeamCalendar, meetingStatus, teamCalendarRange } from './calendar-policy.ts'
import { GoogleApi } from './google.ts'
import type { WorkspaceStore } from './store.ts'

const start = '2026-11-08T00:00:00Z', end = '2026-11-15T00:00:00Z'
function scenario(rows: Record<string, any>[], response: (id: string) => Response | Record<string, any>, role = 'gestor', connected = true) {
  const calls: URL[] = [], connections: string[] = []
  const store = { rows: async (sql: string) => sql.includes('SELECT u.id,u.nome') ? [{ id: 'seller', name: 'Comercial', connection_status: 'active' }] : rows,
    safeConnection: async (id: string) => { connections.push(id); return { status: connected ? 'active' : 'disconnected' } } } as unknown as WorkspaceStore
  const google = new GoogleApi(async () => 'viewer-only-token', async (input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer viewer-only-token')
    const url = new URL(String(input)); calls.push(url)
    const value = response(url.pathname.split('/').at(-1)!)
    return value instanceof Response ? value : Response.json(value)
  })
  return { service: new TeamCalendarService(store, google, { userId: 'manager', role }), calls, connections }
}
const row = (id: string) => ({ id, user_id: 'seller', remote_id: id, metadata: { calendarId: 'primary', title: 'CACHED SECRET', commercialOutcome: { status: 'completed', note: 'PRIVATE NOTE' } },
  calendar_email: 'seller@projetus.org', seller_name: 'Comercial', cnpj: '12345678000190', client_name: 'Cliente', project_kind: 'comercial', project_key: '42' })
const event = (id: string) => ({ id, summary: 'Reunião comercial', start: { dateTime: '2026-11-12T10:00:00Z' }, end: { dateTime: '2026-11-12T11:00:00Z' }, description: 'NOT RETURNED', attendees: [{ email: 'PRIVATE@example.test' }] })

test('team access is limited to commercial management; regular sellers cannot query colleagues', async () => {
  for (const role of ['gestor', 'diretoria', 'admin']) assert.equal(canReadTeamCalendar(role), true)
  for (const role of ['vendedor', 'coordenador', 'visualizador', 'csm', 'gestor_financeiro']) {
    assert.equal(canReadTeamCalendar(role), false)
    const s = scenario([row('a')], event, role)
    await assert.rejects(s.service.list(start, end), (e: any) => e.status === 403)
    assert.equal(s.calls.length, 0); assert.equal(s.connections.length, 0)
  }
})
test('primary belongs to the seller, while all requests use only the viewing managers Google grant', async () => {
  const s = scenario([row('event')], event), result = await s.service.list(start, end)
  assert.deepEqual(s.connections, ['manager'])
  assert.ok(decodeURIComponent(s.calls[0].pathname).includes('/calendars/seller@projetus.org/events/event'))
  assert.equal(result.items.length, 1); assert.equal(result.items[0].sellerName, 'Comercial')
  assert.ok(!JSON.stringify(result).includes('NOT RETURNED')); assert.ok(!JSON.stringify(result).includes('PRIVATE@example.test'))
})
test('private, redacted and inaccessible events never expose cached customer details or outcomes', async () => {
  for (const response of [(id: string) => ({ ...event(id), visibility: 'private' }), () => ({ id: 'event', start: { dateTime: start } }),
    () => new Response('', { status: 403 }), () => new Response('', { status: 404 })]) {
    const result = await scenario([row('event')], response).service.list(start, end)
    assert.deepEqual(result.items, [])
    for (const secret of ['CACHED SECRET', 'PRIVATE NOTE', '12345678000190']) assert.ok(!JSON.stringify(result).includes(secret))
  }
})
test('date filtering uses the current Google date and validates the requested period and seller', async () => {
  const s = scenario([row('event')], id => ({ ...event(id), start: { dateTime: '2026-11-20T10:00:00Z' }, end: { dateTime: '2026-11-20T11:00:00Z' } }))
  assert.equal((await s.service.list(start, end)).items.length, 0)
  await assert.rejects(s.service.list(start, end, 'unknown'), (e: any) => e.status === 404)
  assert.throws(() => teamCalendarRange(end, start)); assert.throws(() => teamCalendarRange(start, '2027-01-01T00:00:00Z'))
})
test('a disconnected manager gets the connection prompt without any calls to a colleagues account', async () => {
  const s = scenario([row('event')], event, 'gestor', false), result = await s.service.list(start, end)
  assert.equal(result.connected, false); assert.deepEqual(result.items, []); assert.equal(s.calls.length, 0)
})
test('elapsed meetings need a recorded result; cancellation and recorded outcomes are separate from scheduled time', () => {
  assert.equal(meetingStatus({ end: start }, Date.parse(end)), 'pending')
  assert.equal(meetingStatus({ end }, Date.parse(start)), 'scheduled')
  assert.equal(meetingStatus({ end: start, outcome: { status: 'completed' } }), 'completed')
  assert.equal(meetingStatus({ status: 'cancelled', outcome: { status: 'completed' } }), 'cancelled')
})
