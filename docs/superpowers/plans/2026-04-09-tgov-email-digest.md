# TGov Email Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send personalized email digests 2x/day to TGov users who opt in, containing their unseen notifications and stale assignment alerts.

**Architecture:** A Vercel Cron calls `GET /api/cron/digest` at 11:20 and 19:00 BRT. The handler queries users with `email_digest = true`, computes their notifications (reusing Spec 2 logic), builds an HTML email, and sends via Resend. A toggle in the Usuarios page controls opt-in.

**Tech Stack:** Next.js 14, Resend SDK, Vercel Cron, PostgreSQL

---

## File Map

| File | Change |
|------|--------|
| `migrations/add_email_digest_column.sql` | Create: ALTER TABLE users |
| `web/src/lib/tgov-tables.ts` | Modify: + email_digest column ensure |
| `web/src/lib/digest-email.ts` | Create: getNotificationsForUser + buildDigestHtml |
| `web/src/app/api/usuarios/[id]/digest/route.ts` | Create: PATCH toggle endpoint |
| `web/src/app/api/cron/digest/route.ts` | Create: cron handler |
| `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx` | Modify: + Digest toggle column |
| `web/src/app/api/usuarios/route.ts` | Modify: + email_digest in SELECT |
| `web/vercel.json` | Modify: + 2 cron entries |
| `web/package.json` | Modify: + resend dependency |

---

## Task 1: Migration + ensure tables + install resend

**Files:**
- Create: `migrations/add_email_digest_column.sql`
- Modify: `web/src/lib/tgov-tables.ts`
- Modify: `web/package.json`

- [ ] **Step 1: Create migration file**

Create `migrations/add_email_digest_column.sql`:
```sql
-- Spec 3 — Email digest opt-in column
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Add to ensureTgovTables**

Read `web/src/lib/tgov-tables.ts`. Add this SQL to the ensure function:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Install resend**

```bash
cd web && npm install resend
```

- [ ] **Step 4: Apply migration to database**

```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov && NODE_TLS_REJECT_UNAUTHORIZED=0 node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' });
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT false').then(() => { console.log('Done'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
"
```

- [ ] **Step 5: Verify and commit**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
git add migrations/add_email_digest_column.sql web/src/lib/tgov-tables.ts web/package.json web/package-lock.json
git commit -m "feat(digest): add email_digest column + install resend"
```

---

## Task 2: Digest email builder (shared logic)

**Files:**
- Create: `web/src/lib/digest-email.ts`

- [ ] **Step 1: Create the module**

```ts
import { query } from './db'

interface NotificationItem {
  propostaKey: string
  titulo: string | null
  eventType: string
  eventAt: string
}

interface StaleItem {
  propostaKey: string
  titulo: string | null
  tecnicoNome: string | null
  assignedAt: string
  hoursWithoutAccess: number
}

export interface DigestData {
  items: NotificationItem[]
  stale: StaleItem[]
}

const EVENT_LABELS: Record<string, string> = {
  comment: 'Novo comentário',
  situacao: 'Situação atualizada',
  assignment: 'Técnico atribuído',
}

/**
 * Get unseen notifications for a user (same logic as GET /api/tgov/notifications).
 */
export async function getNotificationsForUser(userId: string, role: string): Promise<DigestData> {
  const items = await query<{
    proposta_key: string
    titulo: string | null
    event_type: string
    event_at: string
  }>(`
    WITH linked AS (
      SELECT proposta_key FROM tgov_proposta_participants WHERE user_id = $1
      UNION
      SELECT nr_proposta AS proposta_key FROM tgov_propostas WHERE tecnico_id = $1 AND nr_proposta IS NOT NULL
    ),
    activities AS (
      SELECT
        l.proposta_key,
        GREATEST(
          (SELECT MAX(c.created_at) FROM tgov_comments c
           WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key),
          tp.situacao_changed_at,
          tp.tecnico_assigned_at
        ) AS latest_at,
        CASE
          WHEN (SELECT MAX(c.created_at) FROM tgov_comments c
                WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key)
               >= GREATEST(COALESCE(tp.situacao_changed_at, '1970-01-01'),
                           COALESCE(tp.tecnico_assigned_at, '1970-01-01'))
          THEN 'comment'
          WHEN tp.situacao_changed_at >= COALESCE(tp.tecnico_assigned_at, '1970-01-01')
          THEN 'situacao'
          ELSE 'assignment'
        END AS event_type,
        tp.titulo
      FROM linked l
      LEFT JOIN tgov_propostas tp ON tp.nr_proposta = l.proposta_key
      LEFT JOIN tgov_proposta_seen s ON s.user_id = $1 AND s.proposta_key = l.proposta_key
      WHERE GREATEST(
        (SELECT MAX(c.created_at) FROM tgov_comments c
         WHERE c.target_type = 'proposta' AND c.target_key = l.proposta_key),
        tp.situacao_changed_at,
        tp.tecnico_assigned_at
      ) > COALESCE(s.seen_at, '1970-01-01'::timestamptz)
    )
    SELECT proposta_key, titulo, event_type, latest_at::text AS event_at
    FROM activities
    WHERE latest_at IS NOT NULL
    ORDER BY latest_at DESC
    LIMIT 50
  `, [userId])

  const canSeeStale = ['coord_aprovacao', 'assistente_aprovacao', 'adm_produto', 'gestor', 'admin'].includes(role)
  let stale: StaleItem[] = []

  if (canSeeStale) {
    const rows = await query<{
      proposta_key: string
      titulo: string | null
      tecnico_nome: string | null
      assigned_at: string
      hours: number
    }>(`
      SELECT
        tp.nr_proposta AS proposta_key,
        tp.titulo,
        u.nome AS tecnico_nome,
        tp.tecnico_assigned_at::text AS assigned_at,
        EXTRACT(EPOCH FROM (now() - tp.tecnico_assigned_at))::int / 3600 AS hours
      FROM tgov_propostas tp
      JOIN tgov_proposta_participants pp
        ON pp.proposta_key = tp.nr_proposta AND pp.user_id = $1
      LEFT JOIN users u ON u.id = tp.tecnico_id
      LEFT JOIN tgov_proposta_seen s
        ON s.user_id = tp.tecnico_id AND s.proposta_key = tp.nr_proposta
      WHERE tp.tecnico_id IS NOT NULL
        AND tp.tecnico_assigned_at < now() - interval '24 hours'
        AND (s.seen_at IS NULL OR s.seen_at < tp.tecnico_assigned_at)
      ORDER BY tp.tecnico_assigned_at ASC
      LIMIT 20
    `, [userId])

    stale = rows.map(r => ({
      propostaKey: r.proposta_key,
      titulo: r.titulo,
      tecnicoNome: r.tecnico_nome,
      assignedAt: r.assigned_at,
      hoursWithoutAccess: r.hours,
    }))
  }

  return {
    items: items.map(r => ({
      propostaKey: r.proposta_key,
      titulo: r.titulo,
      eventType: r.event_type,
      eventAt: r.event_at,
    })),
    stale,
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'agora'
  if (hours < 24) return `${hours}h atrás`
  return `${Math.floor(hours / 24)}d atrás`
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

/**
 * Build HTML email for the digest.
 */
export function buildDigestHtml(
  userName: string,
  data: DigestData,
): string {
  const itemsHtml = data.items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <strong style="color:#1a1a1a;font-size:14px;">${item.propostaKey}</strong>
        ${item.titulo ? `<br><span style="color:#666;font-size:13px;">${item.titulo}</span>` : ''}
        <br><span style="color:#0072F7;font-size:12px;">${EVENT_LABELS[item.eventType] || item.eventType}</span>
        <span style="color:#999;font-size:12px;"> · ${timeAgo(item.eventAt)}</span>
      </td>
    </tr>
  `).join('')

  const staleHtml = data.stale.length > 0 ? `
    <tr><td style="padding:16px 0 8px;"><strong style="color:#b45309;font-size:14px;">⚠️ Sem acesso há +24h</strong></td></tr>
    ${data.stale.map(item => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #fef3c7;">
          <strong style="color:#1a1a1a;font-size:14px;">${item.propostaKey}</strong>
          ${item.titulo ? `<br><span style="color:#666;font-size:13px;">${item.titulo}</span>` : ''}
          <br><span style="color:#b45309;font-size:12px;">${item.tecnicoNome || 'Técnico'} não acessou (${item.hoursWithoutAccess}h)</span>
        </td>
      </tr>
    `).join('')}
  ` : ''

  const totalCount = data.items.length + data.stale.length

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e5e5;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:#0072F7;padding:24px;text-align:center;">
          <span style="color:#fff;font-size:20px;font-weight:bold;">Projetus CRM</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px;">
          <p style="color:#1a1a1a;font-size:16px;margin:0 0 8px;">Olá ${userName},</p>
          <p style="color:#666;font-size:14px;margin:0 0 24px;">📋 ${totalCount} proposta${totalCount !== 1 ? 's' : ''} com novidades</p>

          ${data.items.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 0 8px;"><strong style="color:#1a1a1a;font-size:14px;">Novas atividades</strong></td></tr>
            ${itemsHtml}
          </table>
          ` : ''}

          ${staleHtml ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">${staleHtml}</table>` : ''}

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr><td align="center">
              <a href="${APP_URL}/tgov" style="display:inline-block;background:#0072F7;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                Acessar TGov Dashboard
              </a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid #e5e5e5;text-align:center;">
          <span style="color:#999;font-size:11px;">Enviado por Projetus CRM · Powered by <a href="https://sigmaintel.io" style="color:#0072F7;text-decoration:none;">SigmaIntel</a></span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/digest-email.ts
git commit -m "feat(digest): add getNotificationsForUser + buildDigestHtml"
```

---

## Task 3: PATCH /api/usuarios/[id]/digest endpoint

**Files:**
- Create: `web/src/app/api/usuarios/[id]/digest/route.ts`

- [ ] **Step 1: Create the endpoint**

```ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canManageRole, type Role } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Users can toggle their own digest; managers can toggle subordinates
    if (session.userId !== id) {
      const targetRows = await query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [id])
      if (targetRows.length === 0) {
        return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })
      }
      if (!canManageRole(session.role as Role, targetRows[0].role as Role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    let body: { enabled?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled deve ser boolean' }, { status: 400 })
    }

    await query(
      `UPDATE users SET email_digest = $1 WHERE id = $2`,
      [body.enabled, id]
    )

    return NextResponse.json({ ok: true, email_digest: body.enabled })
  } catch (error) {
    console.error('Update digest error:', error)
    return NextResponse.json({ error: 'Failed to update digest' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify and commit**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
git add web/src/app/api/usuarios/[id]/digest/route.ts
git commit -m "feat(digest): add PATCH /api/usuarios/[id]/digest toggle endpoint"
```

---

## Task 4: Cron handler

**Files:**
- Create: `web/src/app/api/cron/digest/route.ts`

- [ ] **Step 1: Create the endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getNotificationsForUser, buildDigestHtml } from '@/lib/digest-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TGOV_ROLES = ['adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'gestor', 'admin']

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Dynamic import to avoid build errors when resend is not yet installed
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const fromEmail = process.env.DIGEST_FROM_EMAIL || 'noreply@projetus.com.br'

    // Get all opted-in TGov users
    const users = await query<{
      id: string
      nome: string
      email: string
      role: string
    }>(
      `SELECT id, nome, email, role FROM users
       WHERE email_digest = true AND active = true
       AND role = ANY($1::text[])`,
      [TGOV_ROLES]
    )

    let sent = 0
    let skipped = 0

    for (const user of users) {
      const data = await getNotificationsForUser(user.id, user.role)

      if (data.items.length === 0 && data.stale.length === 0) {
        skipped++
        continue
      }

      const html = buildDigestHtml(user.nome, data)

      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'TGov — Resumo de atividades',
        html,
      })

      sent++
    }

    console.log(`[cron/digest] sent=${sent} skipped=${skipped} total=${users.length}`)
    return NextResponse.json({ sent, skipped, total: users.length })
  } catch (error) {
    console.error('[cron/digest] error:', error)
    return NextResponse.json({ error: 'Digest cron failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify and commit**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
git add web/src/app/api/cron/digest/route.ts
git commit -m "feat(digest): add cron handler for email digest dispatch"
```

---

## Task 5: Update vercel.json with cron entries

**Files:**
- Modify: `web/vercel.json`

- [ ] **Step 1: Add the two cron entries**

Read `web/vercel.json`. Add to the existing `crons` array:

```json
{
  "path": "/api/cron/digest",
  "schedule": "20 14 * * *"
},
{
  "path": "/api/cron/digest",
  "schedule": "0 22 * * *"
}
```

- [ ] **Step 2: Commit**

```bash
git add web/vercel.json
git commit -m "feat(digest): add vercel cron entries for 11:20 and 19:00 BRT"
```

---

## Task 6: Add email_digest to GET /api/usuarios + Digest toggle in UI

**Files:**
- Modify: `web/src/app/api/usuarios/route.ts`
- Modify: `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx`

- [ ] **Step 1: Add `email_digest` to the usuarios API SELECT**

Read `web/src/app/api/usuarios/route.ts`. In both SQL query branches (gestor and non-gestor), add `u.email_digest` to the SELECT and GROUP BY.

- [ ] **Step 2: Add Digest toggle column to CadastroVendedorClient**

Read `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx`.

Add `email_digest?: boolean` to the `Usuario` interface.

Add a "Digest" column header to the table after "Status":
```tsx
<th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Digest</th>
```

Add toggle cell in each row (only for TGov roles):
```tsx
<td className="py-3 px-4">
  {['adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista'].includes(usuario.role) ? (
    <button
      onClick={async () => {
        const newVal = !usuario.email_digest
        setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, email_digest: newVal } : u))
        try {
          const res = await fetch(`/api/usuarios/${usuario.id}/digest`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: newVal }),
          })
          if (!res.ok) fetchUsuarios()
        } catch { fetchUsuarios() }
      }}
      className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
        usuario.email_digest
          ? 'bg-green-50 text-green-600 hover:bg-green-100'
          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
      }`}
    >
      {usuario.email_digest ? 'Ativo' : 'Inativo'}
    </button>
  ) : (
    <span className="text-xs text-gray-300">—</span>
  )}
</td>
```

- [ ] **Step 3: Verify and commit**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
git add web/src/app/api/usuarios/route.ts web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx
git commit -m "feat(digest): add email_digest to usuarios API + toggle in UI"
```
