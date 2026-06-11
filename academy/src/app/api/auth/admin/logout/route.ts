import { clearAdminSession } from '@/lib/auth'
import { ok } from '@/lib/http'

export async function POST() {
  await clearAdminSession()
  return ok({ ok: true })
}
