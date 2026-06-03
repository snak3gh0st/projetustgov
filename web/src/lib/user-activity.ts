import 'server-only'

import { query } from './db'

function safeString(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export async function recordSuccessfulLogin(
  userId: string,
  meta?: { ip?: string | null; userAgent?: string | null }
) {
  try {
    await query(
      `
      UPDATE users
      SET
        last_login_at = NOW(),
        last_seen_at = NOW(),
        login_count = COALESCE(login_count, 0) + 1,
        last_login_ip = COALESCE($2, last_login_ip),
        last_login_user_agent = COALESCE($3, last_login_user_agent),
        updated_at = NOW()
      WHERE id = $1
      `,
      [userId, safeString(meta?.ip), safeString(meta?.userAgent)]
    )
  } catch (error) {
    console.warn('[user-activity] failed to record login', error)
  }
}

export async function touchUserPresence(userId: string) {
  try {
    await query(
      `
      UPDATE users
      SET last_seen_at = NOW()
      WHERE id = $1
        AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '5 minutes')
      `,
      [userId]
    )
  } catch (error) {
    console.warn('[user-activity] failed to touch presence', error)
  }
}
