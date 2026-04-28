'use server'

import { cookies } from 'next/headers'

/**
 * Persist the sidebar open/collapsed state in a cookie so the
 * Server Component layout can read it on the next request and
 * render the correct initial width without hydration flash.
 *
 * Cookie name: sidebar:state
 * Value: 'true' (open) | 'false' (collapsed)
 */
export async function setSidebarState(open: boolean): Promise<void> {
  const cookieStore = cookies()
  cookieStore.set('sidebar:state', String(open), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  })
}
