import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

const VALID_LANGUAGES = ['pt-BR', 'en-US']

// Auto-create bot_config table + seed default language row
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS bot_config (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `)
  await query(`
    INSERT INTO bot_config (key, value)
    VALUES ('language', 'pt-BR')
    ON CONFLICT (key) DO NOTHING
  `)
}

// GET /api/bot-config — returns { language: string }
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
    }

    await ensureTable()

    const rows = await query<{ value: string }>(
      `SELECT value FROM bot_config WHERE key = 'language' LIMIT 1`
    )

    const language = rows[0]?.value ?? 'pt-BR'
    return NextResponse.json({ language })
  } catch (error) {
    console.error('GET bot-config error:', error)
    return NextResponse.json({ error: 'Failed to fetch bot config' }, { status: 500 })
  }
}

// PUT /api/bot-config — body { language: 'pt-BR' | 'en-US' }
export async function PUT(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
    }

    const body = await request.json()
    const { language } = body

    if (!language || !VALID_LANGUAGES.includes(language)) {
      return NextResponse.json(
        { error: `language must be one of: ${VALID_LANGUAGES.join(', ')}` },
        { status: 400 }
      )
    }

    await ensureTable()

    await query(
      `INSERT INTO bot_config (key, value, updated_at)
       VALUES ('language', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [language]
    )

    return NextResponse.json({ success: true, language })
  } catch (error) {
    console.error('PUT bot-config error:', error)
    return NextResponse.json({ error: 'Failed to update bot config' }, { status: 500 })
  }
}
