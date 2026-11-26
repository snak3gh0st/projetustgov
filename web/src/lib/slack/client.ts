export class SlackError extends Error {
  constructor(public code: string, public outcome: 'failed' | 'retry' | 'uncertain', public retryAfter = 60) { super(code) }
}
export interface SlackMessage { text: string; blocks: Record<string, unknown>[] }
const definite = new Set(['not_authed', 'invalid_auth', 'token_revoked', 'account_inactive', 'channel_not_found', 'not_in_channel', 'is_archived', 'missing_scope', 'no_permission', 'restricted_action', 'invalid_blocks', 'invalid_arguments', 'msg_too_long', 'team_access_not_granted', 'access_denied'])
export class SlackClient {
  constructor(private token: string, private team: string, private request: typeof fetch = fetch) {}
  private async call(method: string, body: unknown) {
    let response: Response
    try {
      response = await this.request(`https://slack.com/api/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000), cache: 'no-store' })
    } catch { throw new SlackError('connection_uncertain', 'uncertain') }
    if (response.status === 429) {
      const retry = Number(response.headers.get('retry-after'))
      throw new SlackError('rate_limited', 'retry', Math.min(3600, Math.max(1, Number.isFinite(retry) && retry > 0 ? retry : 60)))
    }
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || data.ok !== true) {
      const code = typeof data?.error === 'string' && /^[a-z_]{1,80}$/.test(data.error) ? data.error : 'provider_uncertain'
      throw new SlackError(code, code === 'ratelimited' ? 'retry' : definite.has(code) ? 'failed' : 'uncertain')
    }
    return data
  }
  async verify() {
    const data = await this.call('auth.test', {})
    if (data.team_id !== this.team || !data.bot_id) throw new SlackError('workspace_mismatch', 'failed')
  }
  async post(channel: string, message: SlackMessage): Promise<string> {
    const data = await this.call('chat.postMessage', { channel, ...message, unfurl_links: false, unfurl_media: false })
    if (data.channel !== channel || typeof data.ts !== 'string' || !/^\d+\.\d+$/.test(data.ts)) throw new SlackError('confirmation_uncertain', 'uncertain')
    return data.ts
  }
}
