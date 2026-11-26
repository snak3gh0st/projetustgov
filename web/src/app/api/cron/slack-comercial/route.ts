import { NextResponse } from 'next/server'
import { segredoConfere } from '@/lib/whatsapp/segredo'
import { runSlackJob } from '@/lib/slack/job'
import { SlackError } from '@/lib/slack/client'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !segredoConfere(request.headers.get('authorization'), `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try { return NextResponse.json(await runSlackJob(), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch (error) {
    const code = error instanceof SlackError ? error.code : 'job_failed'
    console.error('[slack-comercial]', code)
    return NextResponse.json({ error: code }, { status: 503 })
  }
}
