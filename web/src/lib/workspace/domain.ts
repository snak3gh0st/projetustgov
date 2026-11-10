export class WorkspaceError extends Error {
  constructor(message: string, public status = 400, public uncertain = false) { super(message) }
}
export type ProjectKind = 'cliente' | 'comercial' | 'convenio'
export type ContextKey = { cnpj: string; projectKind: ProjectKind; projectKey: string }
export type WorkspaceActor = { userId: string; role: string; email?: string | null; name?: string | null }
export type GoogleFile = { id: string; name: string; mimeType: string; version?: string; modifiedTime?: string;
  webViewLink?: string; parents?: string[]; trashed?: boolean; capabilities?: { canAddChildren?: boolean; canEdit?: boolean } }
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' }
export function cnpjDigits(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!/^\d{14}$/.test(digits)) throw new WorkspaceError('CNPJ inválido.')
  return digits
}
export function googleId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_@.\-]{1,300}$/.test(value)) throw new WorkspaceError('Identificador Google inválido.')
  return value
}
export function emailAddress(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase()
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~\-]+@[a-z0-9](?:[a-z0-9.\-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) || email.length > 254) {
    throw new WorkspaceError('Endereço de e-mail inválido.')
  }
  return email
}
export function safeGoogleUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    if (url.protocol === 'https:' && ['drive.google.com','docs.google.com','calendar.google.com','meet.google.com','mail.google.com'].includes(url.hostname)) return url.toString()
  } catch { /* not an official Google URL */ }
  return null
}
export function safeReturnPath(value: unknown): string {
  const s = String(value ?? '')
  return /^\/workspace(?:\/[a-z0-9/\-]*)?(?:\?[a-zA-Z0-9_%=&.\-]*)?$/.test(s) ? s : '/workspace'
}
export function canWriteWorkspace(role: string) {
  return ['vendedor','coordenador','gestor','diretoria','admin'].includes(role)
}
export function contactEmails(rows: { email?: string | null }[]): string[] {
  const emails = new Set<string>()
  for (const row of rows) { try { emails.add(emailAddress(row.email)) } catch { /* legacy non-email values remain in CRM */ } }
  return Array.from(emails).slice(0,50)
}
export function gmailContactQuery(emails: string[]) {
  if (!emails.length) return null
  return `{${emails.flatMap(e => { const address=emailAddress(e); return [`from:"${address}"`,`to:"${address}"`,`cc:"${address}"`] }).join(' ')}}`
}
export function dateTime(value: unknown) {
  const s = String(value ?? '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) {
    throw new WorkspaceError('Data e horário precisam incluir o fuso.')
  }
  const [year,month,day] = s.slice(0,10).split('-').map(Number)
  if (month<1 || month>12 || day<1 || day>new Date(Date.UTC(year,month,0)).getUTCDate()) throw new WorkspaceError('Data inválida.')
  return new Date(s).toISOString()
}
export function validateMeeting(start: string, end: string) {
  const from = dateTime(start), to = dateTime(end)
  if (Date.parse(to)-Date.parse(from)<60000 || Date.parse(to)-Date.parse(from)>86400000) throw new WorkspaceError('A reunião deve durar entre um minuto e 24 horas.')
  return { start: from, end: to }
}
