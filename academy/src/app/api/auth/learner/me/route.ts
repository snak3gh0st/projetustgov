import { getSession } from '@/lib/auth'
import { ok, err } from '@/lib/http'

export async function GET() {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')
  return ok({ id: session.sub, email: session.email, name: session.name })
}
