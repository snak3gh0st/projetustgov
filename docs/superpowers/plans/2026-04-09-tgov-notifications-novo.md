# TGov Notifications NOVO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent NOVO badges (seen tracking) + notification bell dropdown + stale assignment alerts for TGov proposals.

**Architecture:** Two new tables (`tgov_proposta_participants`, `tgov_proposta_seen`) track who interacted with which proposals and when they last viewed them. New columns on `tgov_propostas` track assignment and situacao change timestamps. A `GET /api/tgov/notifications` endpoint computes NOVO state. Existing endpoints (`comments`, `tecnico`, `aprovacao`) gain participant auto-insert and `hasNew` fields. A `NotificationBell` client component in the layout header shows count + dropdown.

**Tech Stack:** Next.js 14, PostgreSQL, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `migrations/create_tgov_notifications.sql` | Create: new tables + columns |
| `web/src/app/api/tgov/notifications/route.ts` | Create: GET notifications endpoint |
| `web/src/app/api/tgov/seen/route.ts` | Create: PATCH seen endpoint |
| `web/src/app/api/tgov/comments/route.ts` | Modify: + INSERT participant after comment |
| `web/src/app/api/tgov/tecnico/route.ts` | Modify: + INSERT participant + SET tecnico_assigned_at/by |
| `web/src/lib/tgov-tables.ts` | Modify: + ensureTgovNotificationTables |
| `web/src/app/api/tgov/aprovacao/route.ts` | Modify: + hasNew per row |
| `web/src/components/NotificationBell.tsx` | Create: bell icon + dropdown |
| `web/src/app/layout.tsx` | Modify: + NotificationBell in header |
| `web/src/app/tgov/TGovDashboardClient.tsx` | Modify: + NOVO badge on table rows |

---

## Task 1: Database migration

**Files:**
- Create: `migrations/create_tgov_notifications.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- Spec 2 — Notification tables + tgov_propostas columns for seen tracking
-- ============================================================================

-- Participants: who interacted with a proposal (auto-inserted by endpoints)
CREATE TABLE IF NOT EXISTS tgov_proposta_participants (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposta_key  TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, proposta_key)
);
CREATE INDEX IF NOT EXISTS ix_tgov_proposta_participants_user
  ON tgov_proposta_participants(user_id);

-- Seen: when user last viewed a proposal (clears NOVO for that proposal)
CREATE TABLE IF NOT EXISTS tgov_proposta_seen (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposta_key  TEXT NOT NULL,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, proposta_key)
);
CREATE INDEX IF NOT EXISTS ix_tgov_proposta_seen_user
  ON tgov_proposta_seen(user_id);

-- New columns on tgov_propostas for tracking assignment + situacao change
ALTER TABLE tgov_propostas
  ADD COLUMN IF NOT EXISTS situacao_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tecnico_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tecnico_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- RLS for consistency
ALTER TABLE tgov_proposta_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tgov_proposta_seen ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Run migration via Supabase SQL Editor or psql**

Apply the migration to the database.

- [ ] **Step 3: Commit**

```bash
git add migrations/create_tgov_notifications.sql
git commit -m "feat(notifications): create tgov_proposta_participants, tgov_proposta_seen tables + columns"
```

---

## Task 2: Ensure tables helper

**Files:**
- Modify: `web/src/lib/tgov-tables.ts`

- [ ] **Step 1: Read the current `tgov-tables.ts`**

Read `web/src/lib/tgov-tables.ts` to understand the `ensureTgovTables` pattern.

- [ ] **Step 2: Add the notification tables to the ensure function**

Add the same `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements from the migration inside the existing `ensureTgovTables` function (or a new `ensureTgovNotificationTables` called from it). This makes the app self-healing on first load.

The exact code depends on the current structure of `tgov-tables.ts` — follow its existing pattern.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/tgov-tables.ts
git commit -m "feat(notifications): add notification tables to ensureTgovTables"
```

---

## Task 3: PATCH /api/tgov/seen endpoint

**Files:**
- Create: `web/src/app/api/tgov/seen/route.ts`

- [ ] **Step 1: Create the endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const { proposta_key } = payload as { proposta_key?: string }
    if (!proposta_key || typeof proposta_key !== 'string') {
      return NextResponse.json({ error: 'proposta_key obrigatório' }, { status: 400 })
    }

    await query(
      `INSERT INTO tgov_proposta_seen (user_id, proposta_key, seen_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, proposta_key)
       DO UPDATE SET seen_at = now()`,
      [session.userId, proposta_key],
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/tgov/seen][PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to mark seen' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/tgov/seen/route.ts
git commit -m "feat(notifications): add PATCH /api/tgov/seen endpoint"
```

---

## Task 4: Insert participant on comment

**Files:**
- Modify: `web/src/app/api/tgov/comments/route.ts`

- [ ] **Step 1: Read current file**

Read `web/src/app/api/tgov/comments/route.ts` to understand the POST handler.

- [ ] **Step 2: Add participant insert after the comment INSERT**

After the `INSERT INTO tgov_comments` query (around line 90-97), and before the author name lookup, add:

```ts
    // Auto-register commenter as participant
    await query(
      `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [session.userId, target_key],
    )
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/tgov/comments/route.ts
git commit -m "feat(notifications): auto-register commenter as participant"
```

---

## Task 5: Insert participant + timestamps on tecnico assignment

**Files:**
- Modify: `web/src/app/api/tgov/tecnico/route.ts`

- [ ] **Step 1: Read current file**

Read `web/src/app/api/tgov/tecnico/route.ts`.

- [ ] **Step 2: Modify the proposta UPDATE queries to include timestamps**

For the `target_type === 'proposta'` branch, change the two UPDATE queries on `tgov_propostas`:

```ts
// Was:
`UPDATE tgov_propostas SET tecnico_id = $1 WHERE nr_proposta = $2 RETURNING nr_proposta`

// Becomes:
`UPDATE tgov_propostas SET tecnico_id = $1, tecnico_assigned_at = now(), tecnico_assigned_by = $3
 WHERE nr_proposta = $2 RETURNING nr_proposta`,
[tecnicoIdValue, target_key, session.userId],
```

Apply the same pattern to all `UPDATE ... SET tecnico_id` statements that touch `tgov_propostas`. The `propostas` table updates remain unchanged (CRM out of scope).

- [ ] **Step 3: Add participant insert after the updates succeed**

After `if (updated === 0) return 404` and before `return NextResponse.json({ ok: true })`:

```ts
    // Auto-register assigner as participant
    await query(
      `INSERT INTO tgov_proposta_participants (user_id, proposta_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [session.userId, target_key],
    )
```

- [ ] **Step 4: Add `assistente_aprovacao` to TECNICO_ROLES**

Line 9: add `'assistente_aprovacao'` to the list so assistente can be assigned as tecnico:

```ts
const TECNICO_ROLES = ['adm_produto', 'gestor', 'admin', 'coord_aprovacao', 'assistente_aprovacao', 'projetista'] as const
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/tgov/tecnico/route.ts
git commit -m "feat(notifications): track tecnico_assigned_at/by + auto-register participant on assignment"
```

---

## Task 6: GET /api/tgov/notifications endpoint

**Files:**
- Create: `web/src/app/api/tgov/notifications/route.ts`

- [ ] **Step 1: Create the endpoint**

```ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userId = session.userId
    const role = session.role

    // Proposals linked to this user: participant OR tecnico_id
    // For each, compute latest activity and compare with seen_at
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

    // Stale assignments: for coord/assistente/adm_produto only
    const canSeeStale = ['coord_aprovacao', 'assistente_aprovacao', 'adm_produto', 'gestor', 'admin'].includes(role)
    let stale: { proposta_key: string; titulo: string | null; tecnico_nome: string | null; assigned_at: string; hours: number }[] = []

    if (canSeeStale) {
      stale = await query<{
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
    }

    return NextResponse.json({
      count: items.length,
      items: items.map(r => ({
        propostaKey: r.proposta_key,
        titulo: r.titulo,
        eventType: r.event_type,
        eventAt: r.event_at,
      })),
      stale: stale.map(r => ({
        propostaKey: r.proposta_key,
        titulo: r.titulo,
        tecnicoNome: r.tecnico_nome,
        assignedAt: r.assigned_at,
        hoursWithoutAccess: r.hours,
      })),
    })
  } catch (error) {
    console.error('[api/tgov/notifications][GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/tgov/notifications/route.ts
git commit -m "feat(notifications): add GET /api/tgov/notifications endpoint"
```

---

## Task 7: Add `hasNew` to GET /api/tgov/aprovacao response

**Files:**
- Modify: `web/src/app/api/tgov/aprovacao/route.ts`

- [ ] **Step 1: Read current file**

Read `web/src/app/api/tgov/aprovacao/route.ts`. The table data query is the last one in the `Promise.all`. After that, tecnico names are looked up.

- [ ] **Step 2: Add a has_new computation after fetching table rows**

After the tecnicoNameMap lookup (around line 248), add a query to batch-check NOVO status for all rows in the current page:

```ts
    // Compute hasNew for each row in the page
    const propostaKeys = tableDataRows.map(r => r.nr_proposta).filter((k): k is string => !!k)
    const newStatusMap = new Map<string, boolean>()

    if (propostaKeys.length > 0) {
      const newRows = await query<{ proposta_key: string }>(
        `SELECT DISTINCT pk.proposta_key
         FROM unnest($1::text[]) AS pk(proposta_key)
         WHERE EXISTS (
           SELECT 1 FROM tgov_proposta_participants pp
           WHERE pp.proposta_key = pk.proposta_key AND pp.user_id = $2
           UNION ALL
           SELECT 1 FROM tgov_propostas tp
           WHERE tp.nr_proposta = pk.proposta_key AND tp.tecnico_id = $2
         )
         AND (
           SELECT GREATEST(
             (SELECT MAX(c.created_at) FROM tgov_comments c
              WHERE c.target_type = 'proposta' AND c.target_key = pk.proposta_key),
             (SELECT tp2.situacao_changed_at FROM tgov_propostas tp2 WHERE tp2.nr_proposta = pk.proposta_key),
             (SELECT tp2.tecnico_assigned_at FROM tgov_propostas tp2 WHERE tp2.nr_proposta = pk.proposta_key)
           )
         ) > COALESCE(
           (SELECT s.seen_at FROM tgov_proposta_seen s WHERE s.user_id = $2 AND s.proposta_key = pk.proposta_key),
           '1970-01-01'::timestamptz
         )`,
        [propostaKeys, session.userId]
      )
      for (const r of newRows) newStatusMap.set(r.proposta_key, true)
    }
```

- [ ] **Step 3: Add `hasNew` to the row mapping**

In the `table.rows` map (around line 292), add:

```ts
hasNew: r.nr_proposta ? (newStatusMap.get(r.nr_proposta) ?? false) : false,
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add web/src/app/api/tgov/aprovacao/route.ts
git commit -m "feat(notifications): add hasNew field to aprovacao table rows"
```

---

## Task 8: NotificationBell component

**Files:**
- Create: `web/src/components/NotificationBell.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'

interface NotificationItem {
  propostaKey: string
  titulo: string | null
  eventType: 'comment' | 'situacao' | 'assignment'
  eventAt: string
}

interface StaleItem {
  propostaKey: string
  titulo: string | null
  tecnicoNome: string | null
  assignedAt: string
  hoursWithoutAccess: number
}

interface NotificationsData {
  count: number
  items: NotificationItem[]
  stale: StaleItem[]
}

const EVENT_LABELS: Record<string, string> = {
  comment: 'Novo comentário',
  situacao: 'Situação atualizada',
  assignment: 'Técnico atribuído',
}

export default function NotificationBell() {
  const [data, setData] = useState<NotificationsData | null>(null)
  const [open, setOpen] = useState(false)

  const fetchNotifications = useCallback(() => {
    fetch('/api/tgov/notifications')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000) // poll every 60s
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const totalCount = (data?.count ?? 0) + (data?.stale?.length ?? 0)

  const handleItemClick = async (propostaKey: string) => {
    await fetch('/api/tgov/seen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposta_key: propostaKey }),
    }).catch(() => {})
    setOpen(false)
    // Navigate to TGov with the proposal selected
    window.location.href = `/tgov?highlight=${encodeURIComponent(propostaKey)}`
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / 3_600_000)
    if (hours < 1) return 'agora'
    if (hours < 24) return `${hours}h atrás`
    return `${Math.floor(hours / 24)}d atrás`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Notificações"
      >
        {/* Bell icon */}
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 max-h-96 overflow-y-auto">
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Notificações</h3>
            </div>

            {totalCount === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                Nenhuma notificação
              </div>
            ) : (
              <>
                {/* New activity items */}
                {data?.items.map(item => (
                  <button
                    key={item.propostaKey}
                    onClick={() => handleItemClick(item.propostaKey)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-800 truncate">
                        {item.propostaKey}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                        {timeAgo(item.eventAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 ml-4 truncate">
                      {EVENT_LABELS[item.eventType] || item.eventType}
                      {item.titulo ? ` — ${item.titulo}` : ''}
                    </p>
                  </button>
                ))}

                {/* Stale items */}
                {data?.stale && data.stale.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-amber-50 border-y border-amber-100">
                      <span className="text-xs font-semibold text-amber-700">
                        Sem acesso há +24h
                      </span>
                    </div>
                    {data.stale.map(item => (
                      <button
                        key={`stale-${item.propostaKey}`}
                        onClick={() => handleItemClick(item.propostaKey)}
                        className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-800 truncate">
                            {item.propostaKey}
                          </span>
                          <span className="text-[10px] text-amber-600 ml-auto flex-shrink-0">
                            {item.hoursWithoutAccess}h
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 ml-4 truncate">
                          {item.tecnicoNome || 'Técnico'} não acessou
                          {item.titulo ? ` — ${item.titulo}` : ''}
                        </p>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/NotificationBell.tsx
git commit -m "feat(notifications): add NotificationBell component with dropdown"
```

---

## Task 9: Integrate NotificationBell in layout

**Files:**
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Read current file**

Read `web/src/app/layout.tsx`.

- [ ] **Step 2: Import NotificationBell and add to layout**

Add import:
```ts
import NotificationBell from '@/components/NotificationBell'
```

Add `assistente_aprovacao` to the role cast on line 26:
```ts
role: session.user.role as 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista',
```

In the `<main>` tag, add a header bar with the bell for TGov roles. Insert between `{session?.user && <NewsBanner />}` and `{children}`:

```tsx
{session?.user && ['gestor', 'admin', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista'].includes(
  session.user.role as string
) && (
  <div className="flex justify-end mb-2">
    <NotificationBell />
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/layout.tsx
git commit -m "feat(notifications): add NotificationBell to layout for TGov roles"
```

---

## Task 10: NOVO badge on TGov table rows

**Files:**
- Modify: `web/src/app/tgov/TGovDashboardClient.tsx`

- [ ] **Step 1: Read current file**

Read `web/src/app/tgov/TGovDashboardClient.tsx` to find where table rows are rendered and the row type definition.

- [ ] **Step 2: Add `hasNew` to the row type**

Find the type/interface for table row data and add `hasNew?: boolean`.

- [ ] **Step 3: Add the NOVO badge in the row render**

In the table cell that renders `numeroProposta` (or the first column), add:

```tsx
{row.hasNew && (
  <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded">
    NOVO
  </span>
)}
```

- [ ] **Step 4: Mark as seen when sidecard opens**

Find where the sidecard opens (click handler on a row). Add:

```ts
// Mark as seen when opening sidecard
if (row.hasNew && row.numeroProposta) {
  fetch('/api/tgov/seen', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposta_key: row.numeroProposta }),
  }).catch(() => {})
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/app/tgov/TGovDashboardClient.tsx
git commit -m "feat(notifications): add NOVO badge on TGov table rows with seen-on-click"
```

---

## Task 11: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
cd web && npm run dev
```

- [ ] **Step 2: Test seen flow**

1. Log in as `coord_aprovacao`
2. Assign a projetista to a proposal via sidecard
3. Add a comment on a proposal
4. Verify: NotificationBell shows count > 0
5. Click a notification → navigates to TGov, opens sidecard
6. Verify: NOVO badge disappears, bell count decreases
7. Reload page → verify NOVO stays gone (persisted in DB)

- [ ] **Step 3: Test stale alert**

1. Create a projetista assignment >24h ago (or manually set `tecnico_assigned_at` in DB to yesterday)
2. Verify: the stale section appears in the bell dropdown for the coord
3. Log in as projetista → open the proposal → verify stale clears

- [ ] **Step 4: Test projetista isolation**

1. Log in as projetista
2. Verify: only sees NOVO for proposals where tecnico_id = their userId
3. Verify: bell shows only their notifications, not other projetistas'
