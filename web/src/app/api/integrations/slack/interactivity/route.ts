import { slackSignature } from '@/lib/slack/signature'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 65536) return new Response('', { status: 413 })
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 65536) return new Response('', { status: 413 })
  if (!slackSignature(request.headers, raw, process.env.SLACK_SIGNING_SECRET)) return new Response('', { status: 401 })
  let payload
  try { payload = JSON.parse(new URLSearchParams(raw).get('payload') || '') } catch { return new Response('', { status: 400 }) }
  if (!process.env.SLACK_WORKSPACE_ID || payload?.team?.id !== process.env.SLACK_WORKSPACE_ID) return new Response('', { status: 403 })
  if (payload.type !== 'block_actions' || !Array.isArray(payload.actions) || !payload.actions.length || payload.actions.some((a: { action_id?: string }) => a?.action_id !== 'projete_open')) return new Response('', { status: 400 })
  // URL buttons only open authenticated Projete pages. No CRM mutations are accepted from Slack.
  return new Response('', { status: 200 })
}
