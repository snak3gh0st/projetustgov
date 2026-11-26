import { createHmac, timingSafeEqual } from 'node:crypto'
export function slackSignature(headers: Headers, raw: string, secret: string | undefined, now = Date.now()): boolean {
  const timestamp = headers.get('x-slack-request-timestamp') || '', signature = headers.get('x-slack-signature') || ''
  if (!secret || !/^\d{10}$/.test(timestamp) || !/^v0=[a-f0-9]{64}$/.test(signature) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex')}`
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
