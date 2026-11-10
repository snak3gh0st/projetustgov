import { NextRequest } from 'next/server'
import { GET as financeiro } from '../financeiro/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  url.searchParams.set('task', 'sync')
  return financeiro(new NextRequest(url, { headers: request.headers }))
}
