export interface SlackConfig {
  enabled: boolean; token: string; signingSecret: string; teamId: string; channel: string; approvalsChannel: string; operationsChannel: string
  approvalUser: string | null; operationsUser: string | null; reportTime: string; reportDays: number[]
}
const channelId = /^[CGD][A-Z0-9]{8,}$/
const userId = /^[UW][A-Z0-9]{8,}$/
export function slackConfig(env: Record<string, string | undefined> = process.env): SlackConfig {
  const channel = env.SLACK_COMMERCIAL_CHANNEL_ID?.trim() || ''
  const days = (env.SLACK_COMMERCIAL_REPORT_DAYS || '1,2,3,4,5').split(',').map(Number)
  const config: SlackConfig = {
    enabled: env.SLACK_COMMERCIAL_ENABLED === 'true', token: env.SLACK_BOT_TOKEN?.trim() || '', signingSecret: env.SLACK_SIGNING_SECRET?.trim() || '',
    teamId: env.SLACK_WORKSPACE_ID?.trim() || '', channel,
    approvalsChannel: env.SLACK_APPROVALS_CHANNEL_ID?.trim() || channel,
    operationsChannel: env.SLACK_OPERATIONS_CHANNEL_ID?.trim() || channel,
    approvalUser: env.SLACK_APPROVAL_USER_ID?.trim() || null, operationsUser: env.SLACK_OPERATIONS_USER_ID?.trim() || null,
    reportTime: env.SLACK_COMMERCIAL_REPORT_TIME?.trim() || '', reportDays: Array.from(new Set(days)),
  }
  return config
}
export function configurationIssues(c: SlackConfig): string[] {
  const issues: string[] = []
  if (!c.token.startsWith('xoxb-')) issues.push('Token do bot pendente')
  if (!c.signingSecret) issues.push('Assinatura do app pendente')
  if (!/^T[A-Z0-9]{8,}$/.test(c.teamId)) issues.push('Workspace pendente')
  if (![c.channel, c.approvalsChannel, c.operationsChannel].every(v => channelId.test(v))) issues.push('Canais pendentes')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.reportTime)) issues.push('Horário do resumo pendente')
  if (!c.reportDays.length || c.reportDays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) issues.push('Dias do resumo inválidos')
  if ([c.approvalUser, c.operationsUser].some(v => v !== null && !userId.test(v))) issues.push('Responsável Slack inválido')
  return issues
}
export function reportDue(now: Date, c: Pick<SlackConfig, 'reportTime' | 'reportDays'>): { day: string; time: string } | null {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const value = (type: string) => parts.find(p => p.type === type)!.value
  const day = `${value('year')}-${value('month')}-${value('day')}`
  const time = `${value('hour')}:${value('minute')}`
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return c.reportTime && time >= c.reportTime && c.reportDays.includes(weekday) ? { day, time: c.reportTime } : null
}
