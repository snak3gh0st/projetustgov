'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import { MEETING_OUTCOMES, type MeetingOutcome } from '@/lib/workspace/calendar-policy'
import { Field, fieldClass, Notice, type Data, type WorkspaceApi } from './shared'

export default function MeetingOutcomeForm({ api, event, onDone }: { api: WorkspaceApi; event: Data; onDone: () => void }) {
  const [status, setStatus] = useState<MeetingOutcome>(event.outcome?.status || 'pending')
  const [note, setNote] = useState(event.outcome?.note || ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api.mutate('record_meeting_outcome', { meetingId: event.meetingId, status, note, version: event.outcome?.version || 0 }); onDone() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <form className="space-y-3 border-t border-line pt-4" onSubmit={e => void save(e)}>
    <Field label="Resultado na Projete"><select className={fieldClass} value={status} onChange={e => setStatus(e.target.value as MeetingOutcome)}>
      {Object.entries(MEETING_OUTCOMES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
    </select></Field>
    <Field label="Observação comercial"><textarea className={fieldClass} maxLength={2000} rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
    <p className="text-xs leading-relaxed text-ink-2">Registra o resultado do atendimento. Para alterar o horário ou cancelar o convite, atualize a Agenda Google.</p>
    {error && <Notice error>{error}</Notice>}
    <Button type="submit" variant="primary" loading={busy}>Salvar resultado</Button>
  </form>
}
