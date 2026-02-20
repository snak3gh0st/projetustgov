---
phase: quick-41
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/setup-crm/route.ts
  - web/src/app/api/cnpj-monitorado/route.ts
  - web/src/app/monitorar/page.tsx
  - web/src/app/layout.tsx
  - web/src/app/api/cron/route.ts
  - web/public/sw.js
  - web/src/app/api/push-subscribe/route.ts
  - web/src/app/api/push-notify/route.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Any logged-in user (all roles) can add a CNPJ to their personal monitored list"
    - "The /monitorar page shows each monitored CNPJ with name, contacts (telefone, email), current emenda info"
    - "User can remove a CNPJ from their monitored list"
    - "When cron sync detects a new or updated emenda for a monitored CNPJ, a browser push notification is sent to the subscribed user"
    - "Push subscription is per-user and persists in the DB"
  artifacts:
    - path: "web/src/app/api/cnpj-monitorado/route.ts"
      provides: "GET/POST/DELETE for monitored CNPJs per user"
    - path: "web/src/app/monitorar/page.tsx"
      provides: "Monitored CNPJ management UI for all roles"
    - path: "web/public/sw.js"
      provides: "Service worker for push notifications"
    - path: "web/src/app/api/push-subscribe/route.ts"
      provides: "Save/remove web push subscription"
    - path: "web/src/app/api/push-notify/route.ts"
      provides: "Internal endpoint to send push to users watching a CNPJ"
  key_links:
    - from: "web/src/app/monitorar/page.tsx"
      to: "/api/cnpj-monitorado"
      via: "fetch on mount and after add/delete"
    - from: "web/src/lib/repo-sync.ts"
      to: "/api/push-notify"
      via: "internal fetch when emenda changes detected"
---

<objective>
Create a "CNPJ Monitorado" feature available to all users: each vendedor/gestor can add CNPJs they want to watch, see contact info, and receive a browser push notification when a monitored CNPJ gets a new or updated emenda in the daily cron sync.

Purpose: Currently the CNPJ monitoring (monitorar-cnpj API) is gestor-only and hard-wired to Paulo Gabriel. This feature democratizes it — any user can build their own watchlist and get notified when action is needed.
Output: /monitorar page, cnpj_monitorado + push_subscriptions DB tables, web push infrastructure, cron integration.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/api/setup-crm/route.ts
@web/src/app/api/monitorar-cnpj/route.ts
@web/src/lib/dal.ts
@web/src/lib/repo-sync.ts
@web/src/app/api/cron/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB tables + /api/cnpj-monitorado CRUD API</name>
  <files>
    web/src/app/api/setup-crm/route.ts
    web/src/app/api/cnpj-monitorado/route.ts
    web/src/app/api/push-subscribe/route.ts
  </files>
  <action>
1. Add two new CREATE TABLE IF NOT EXISTS blocks to setup-crm route.ts (append before the final return):

```sql
CREATE TABLE IF NOT EXISTS cnpj_monitorado (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cnpj VARCHAR(14) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cnpj)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);
```

2. Create web/src/app/api/cnpj-monitorado/route.ts with:
   - GET: returns all monitored CNPJs for the current user, joined with vendedor_projetos to pull nome, email, telefone, municipio, uf, valor_emenda, parlamentar, nr_emenda. Query: `SELECT DISTINCT ON (cm.cnpj) cm.id, cm.cnpj, cm.created_at, vp.nome, vp.email, vp.telefone, vp.municipio, vp.uf, vp.valor_emenda, vp.parlamentar, vp.nr_emenda FROM cnpj_monitorado cm LEFT JOIN vendedor_projetos vp ON vp.cnpj = cm.cnpj WHERE cm.user_id = $1 ORDER BY cm.cnpj, vp.valor_emenda DESC NULLS LAST`
   - POST body `{ cnpj: string }`: clean to 14 digits, validate, INSERT into cnpj_monitorado. All roles allowed (remove role === 'gestor' guard). Returns 409 if already monitored.
   - DELETE body `{ cnpj: string }`: DELETE FROM cnpj_monitorado WHERE user_id = $1 AND cnpj = $2. Returns 200 `{ success: true }`.

3. Create web/src/app/api/push-subscribe/route.ts:
   - POST body `{ subscription: PushSubscription }`: extract endpoint, keys.p256dh, keys.auth. Upsert into push_subscriptions for current user. Returns 200.
   - DELETE body `{ endpoint: string }`: delete subscription row for current user. Returns 200.
   - Auth: any authenticated role.

Install web-push: run `npm install web-push` and `npm install --save-dev @types/web-push` inside `web/` directory.
  </action>
  <verify>
Run: `curl -s http://localhost:3000/api/setup-crm` (POST or check tables exist via DB query).
Also: `npx tsc --noEmit` in web/ should pass.
  </verify>
  <done>Tables cnpj_monitorado and push_subscriptions created in DB. /api/cnpj-monitorado GET/POST/DELETE respond correctly for authenticated users of all roles.</done>
</task>

<task type="auto">
  <name>Task 2: /monitorar page — watchlist UI with contact info</name>
  <files>
    web/src/app/monitorar/page.tsx
    web/src/app/layout.tsx
  </files>
  <action>
Create web/src/app/monitorar/page.tsx as a 'use client' page:

State: `cnpjs: MonitoradoRow[]`, `loading: boolean`, `inputCnpj: string`, `addError: string | null`, `addLoading: boolean`, `pushEnabled: boolean`, `pushLoading: boolean`.

Interface MonitoradoRow: `{ id: number; cnpj: string; nome: string | null; email: string | null; telefone: string | null; municipio: string | null; uf: string | null; valor_emenda: number | null; parlamentar: string | null; nr_emenda: string | null; created_at: string }`.

On mount: fetch('/api/cnpj-monitorado') to populate cnpjs list. Also check if Notification permission is 'granted' and a service worker subscription exists to set pushEnabled.

UI layout:
- Header: "CNPJs Monitorados" with subtitle "Acompanhe CNPJs de interesse e receba alertas de novas emendas"
- Push notification toggle section: button "Ativar Notificações" (if not enabled) or green badge "Notificações ativas" + "Desativar" link. Clicking "Ativar Notificações" calls `Notification.requestPermission()`, registers service worker (`/sw.js`), calls `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })`, then POSTs subscription to /api/push-subscribe.
- Add CNPJ form: text input + "Adicionar" button. POST to /api/cnpj-monitorado. On 409 show "CNPJ já monitorado". On 404 show "CNPJ não encontrado na base de leads". On success, refetch list.
- Table/card list of monitored CNPJs with columns: Nome, CNPJ (formatted), Contato (telefone + email stacked), UF/Município, Valor Emenda, Parlamentar/Nr Emenda, Adicionado em (date), Ação (Remover button — DELETE /api/cnpj-monitorado then refetch).
- Empty state: "Nenhum CNPJ monitorado. Adicione um CNPJ acima para começar."

VAPID_PUBLIC_KEY: read from `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

urlBase64ToUint8Array helper function (standard): converts base64 VAPID key to Uint8Array for push subscription.

Add link to /monitorar in layout.tsx navigation (wherever /monitoramento appears in nav — add sibling nav item "Monitorar CNPJs" or label it as "Meus Monitorados"). Check layout.tsx for nav structure and insert consistently. Only show for roles that are not 'visualizador'.
  </action>
  <verify>
Visit http://localhost:3000/monitorar. Page loads, empty state shown, CNPJ input works, add/remove functions.
  </verify>
  <done>Any logged-in user can access /monitorar, add a CNPJ from the DB, see name + contact info + emenda data in the list, remove it. Push notification UI shows but may require VAPID setup before activating.</done>
</task>

<task type="auto">
  <name>Task 3: Service worker + push notifications on emenda sync</name>
  <files>
    web/public/sw.js
    web/src/app/api/push-notify/route.ts
    web/src/lib/repo-sync.ts
    web/.env.local
  </files>
  <action>
1. Generate VAPID keys using web-push CLI: `./node_modules/.bin/web-push generate-vapid-keys` inside web/ directory. Add to web/.env.local:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<generated_public_key>
VAPID_PRIVATE_KEY=<generated_private_key>
VAPID_EMAIL=mailto:admin@projetus.org
```
(Only add if .env.local doesn't already have these keys.)

2. Create web/public/sw.js (service worker):
```js
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Projetus — CNPJ Monitorado'
  const options = {
    body: data.body || 'Um CNPJ monitorado recebeu atualização',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/monitorar' }
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url || '/monitorar'))
})
```

3. Create web/src/app/api/push-notify/route.ts:
   - POST body `{ cnpj: string, title?: string, body?: string }`.
   - Auth: only callable from server-side (check for internal header `x-internal-key` matching `process.env.INTERNAL_API_KEY`, or allow any authenticated session — use simpler auth: check getApiSession OR accept internal calls without session if `process.env.INTERNAL_API_KEY` header matches).
   - Query: `SELECT ps.endpoint, ps.p256dh, ps.auth FROM push_subscriptions ps JOIN cnpj_monitorado cm ON cm.user_id = ps.user_id WHERE cm.cnpj = $1`
   - For each subscription, call `webpush.sendNotification(subscription, JSON.stringify({ title, body, url: '/monitorar' }))`.
   - Use `webpush.setVapidDetails(process.env.VAPID_EMAIL!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)`.
   - On 410/404 from push service (subscription expired), delete that row from push_subscriptions.
   - Returns `{ sent: N, failed: M }`.

4. In web/src/lib/repo-sync.ts, after the main UPSERT loop (around STEP 6 where upsert results are processed), detect emenda changes and trigger notifications:
   - After computing `upserted` rows, for each row where `xmax != '0'` (updated) OR it was inserted (xmax === '0'), check if `cnpj` is in cnpj_monitorado table:
     ```
     SELECT DISTINCT cm.cnpj, vp.nome FROM cnpj_monitorado cm
     JOIN vendedor_projetos vp ON vp.cnpj = cm.cnpj
     WHERE cm.cnpj = ANY($1)
     LIMIT 100
     ```
   - For each matching monitored CNPJ, call `fetch(\`${process.env.NEXTAUTH_URL}/api/push-notify\`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' }, body: JSON.stringify({ cnpj, title: 'Nova emenda detectada', body: \`${nome || cnpj} recebeu atualização de emenda no TransferênciaGov\` }) })`.
   - Add `INTERNAL_API_KEY=<random-uuid>` to .env.local.
   - Only trigger if the monitored CNPJ list is non-empty (skip if 0 monitored CNPJs to avoid unnecessary query overhead).

5. Add INTERNAL_API_KEY to push-notify route check.
  </action>
  <verify>
1. `npx tsc --noEmit` passes in web/.
2. Service worker file exists at web/public/sw.js.
3. VAPID keys present in web/.env.local.
4. Test push endpoint: `curl -X POST http://localhost:3000/api/push-notify -H "Content-Type: application/json" -H "x-internal-key: <key>" -d '{"cnpj":"00000000000000","title":"Teste","body":"Teste push"}' ` returns JSON (0 subscriptions is OK).
  </verify>
  <done>Service worker registered, VAPID keys configured, /api/push-notify sends real push notifications to subscribed users watching a CNPJ, cron sync calls push-notify for updated/inserted emendas of monitored CNPJs.</done>
</task>

</tasks>

<verification>
1. All three tasks complete without TypeScript errors (`npx tsc --noEmit` in web/).
2. `npm run build` in web/ passes.
3. /monitorar page accessible to all roles (vendedor, gestor, gestor_vendedor).
4. Add a CNPJ that exists in vendedor_projetos — it appears in the list with contact info.
5. Remove the CNPJ — it disappears from the list.
6. VAPID keys exist in .env.local and sw.js is in public/.
7. /api/push-notify returns 200 for a valid internal call.
</verification>

<success_criteria>
- Any authenticated user can add/remove CNPJs from their personal watchlist at /monitorar
- Monitored CNPJs show: nome, CNPJ formatado, telefone, email, municipio/UF, valor_emenda, parlamentar
- Users can enable browser push notifications (requires HTTPS in production / localhost with flag)
- Daily cron sync triggers push notifications to users who have subscribed and are watching a CNPJ that received a new/updated emenda
- No regression on existing /api/monitorar-cnpj (gestor assigns to Paulo) — keep that endpoint as-is
</success_criteria>

<output>
After completion, create `.planning/quick/41-ambiente-para-adi-o-do-cnpj-monitorado-e/41-SUMMARY.md`
</output>
