# Assistente Aprovação Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `assistente_aprovacao` role between `coord_aprovacao` and `projetista`, centralize role-management permissions in a `ROLE_CAN_CREATE` config object, and give coord + assistente access to create/manage their subordinates.

**Architecture:** A `ROLE_CAN_CREATE` map in `dal.ts` replaces all hardcoded `adm_produto`-specific permission checks across APIs and server actions. The type union gains `assistente_aprovacao` in 3 places (`next-auth.d.ts`, `dal.ts`, `validations.ts`). UI components derive their selectable role options from this map — no more parallel hardcoded lists.

**Tech Stack:** Next.js 14 App Router, TypeScript, PostgreSQL (no migration needed), Zod, NextAuth

---

## File Map

| File | Change |
|------|--------|
| `web/src/types/next-auth.d.ts` | + `assistente_aprovacao` in 3 role unions |
| `web/src/lib/dal.ts` | + `type Role`, + `ROLE_CAN_CREATE`, + `canManageRole`, update TGov helpers, update session return types |
| `web/src/lib/validations.ts` | + `assistente_aprovacao` in `CreateUsuarioSchema` z.enum |
| `web/src/lib/auth-actions.ts` | Replace hardcoded `adm_produto` check with `ROLE_CAN_CREATE` |
| `web/src/app/api/usuarios/route.ts` | Derive visible roles from `ROLE_CAN_CREATE[session.role]` |
| `web/src/app/api/usuarios/[id]/role/route.ts` | Replace `ALLOWED_ROLES` + `ADM_PRODUTO_ALLOWED` with `canManageRole` |
| `web/src/middleware.ts` | + `assistente_aprovacao` isolation block (same pattern as coord_aprovacao) |
| `web/src/app/cadastro-vendedor/page.tsx` | Allow `coord_aprovacao` + `assistente_aprovacao` to access page |
| `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx` | + badges for new role, derive select options from `creatableRoles` prop |
| `web/src/components/Sidebar.tsx` | + nav for `assistente_aprovacao`, + Usuarios TGov link for coord + assistente |

---

## Task 1: Add `assistente_aprovacao` to type declarations

**Files:**
- Modify: `web/src/types/next-auth.d.ts`
- Modify: `web/src/lib/validations.ts`

- [ ] **Step 1: Update `next-auth.d.ts`** — add `'assistente_aprovacao'` to all three role unions

Replace the full content of `web/src/types/next-auth.d.ts`:

```ts
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista'
    } & DefaultSession['user']
  }

  interface User {
    role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista'
  }
}
```

- [ ] **Step 2: Update `validations.ts`** — add `'assistente_aprovacao'` to `CreateUsuarioSchema` role enum

Change line 18 in `web/src/lib/validations.ts`:
```ts
// Before:
role: z.enum(['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'coord_aprovacao', 'projetista']).default('vendedor'),

// After:
role: z.enum(['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'coord_aprovacao', 'assistente_aprovacao', 'projetista']).default('vendedor'),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add web/src/types/next-auth.d.ts web/src/lib/validations.ts
git commit -m "feat(roles): add assistente_aprovacao to type unions and zod schema"
```

---

## Task 2: Add `ROLE_CAN_CREATE` config and update TGov helpers in `dal.ts`

**Files:**
- Modify: `web/src/lib/dal.ts`

- [ ] **Step 1: Add `type Role` and `ROLE_CAN_CREATE` after the imports block**

Insert after `import { redirect } from 'next/navigation'` (line 5) in `web/src/lib/dal.ts`:

```ts
export type Role = 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista'

/** Who can create/manage users of which roles. Single source of truth. */
export const ROLE_CAN_CREATE: Partial<Record<Role, Role[]>> = {
  gestor:               ['admin', 'vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista'],
  admin:                ['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista'],
  adm_produto:          ['coord_aprovacao', 'assistente_aprovacao', 'projetista'],
  coord_aprovacao:      ['assistente_aprovacao', 'projetista'],
  assistente_aprovacao: ['projetista'],
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_CAN_CREATE[actorRole]?.includes(targetRole) ?? false
}
```

- [ ] **Step 2: Update `verifySession` and `getApiSession` return types** to use `Role`

In `verifySession` (line 7–18), change the cast:
```ts
// Before:
role: session.user.role as 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'projetista',

// After:
role: session.user.role as Role,
```

Apply the same substitution in `getApiSession` (line 22–31).

- [ ] **Step 3: Update TGov helper functions** to include `assistente_aprovacao`

```ts
// canReadTgov — line ~58
export function canReadTgov(role: string | undefined): boolean {
  return role === 'gestor' || role === 'admin' || role === 'adm_produto' || role === 'csm' || role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'projetista'
}

// canWriteTgov — line ~63
export function canWriteTgov(role: string | undefined): boolean {
  return role === 'gestor' || role === 'admin' || role === 'adm_produto' || role === 'coord_aprovacao' || role === 'assistente_aprovacao'
}

// canCommentTgov — line ~68
export function canCommentTgov(role: string | undefined): boolean {
  return role === 'gestor' || role === 'admin' || role === 'adm_produto' || role === 'csm' || role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'projetista'
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero new errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dal.ts
git commit -m "feat(roles): add ROLE_CAN_CREATE config and canManageRole helper in dal.ts"
```

---

## Task 3: Update `auth-actions.ts` — replace hardcoded `adm_produto` check

**Files:**
- Modify: `web/src/lib/auth-actions.ts`

- [ ] **Step 1: Import `ROLE_CAN_CREATE` and `Role`**

Add to imports at the top of `auth-actions.ts`:
```ts
import { ROLE_CAN_CREATE, type Role } from './dal'
```

- [ ] **Step 2: Replace the hardcoded permission guard in `createUsuario`**

Replace lines 124–134 (the `if (!session?.user ...)` check and the `adm_produto`-specific block):

```ts
// Before:
if (!session?.user || !('role' in session.user) || (session.user.role !== 'gestor' && session.user.role !== 'admin' && session.user.role !== 'adm_produto')) {
  return { error: 'Sem permissao para criar usuarios' }
}

// adm_produto can only create coord_aprovacao or projetista users
if (session.user.role === 'adm_produto') {
  const formRole = formData.get('role')
  if (formRole !== 'coord_aprovacao' && formRole !== 'projetista') {
    return { error: 'adm_produto pode criar apenas Coord. Aprovação ou Projetista' }
  }
}

// After:
if (!session?.user || !('role' in session.user)) {
  return { error: 'Sem permissao para criar usuarios' }
}

const actorRole = session.user.role as Role
const creatableRoles = ROLE_CAN_CREATE[actorRole] ?? []
if (creatableRoles.length === 0) {
  return { error: 'Sem permissao para criar usuarios' }
}

const formRole = formData.get('role') as string
if (!creatableRoles.includes(formRole as Role)) {
  return { error: 'Sem permissao para criar usuarios com este cargo' }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/auth-actions.ts
git commit -m "feat(roles): replace adm_produto hardcode in createUsuario with ROLE_CAN_CREATE"
```

---

## Task 4: Update `GET /api/usuarios` — derive visible roles from `ROLE_CAN_CREATE`

**Files:**
- Modify: `web/src/app/api/usuarios/route.ts`

- [ ] **Step 1: Import `ROLE_CAN_CREATE` and `Role`**

Add import at top:
```ts
import { getApiSession, ROLE_CAN_CREATE, type Role } from '@/lib/dal'
```

- [ ] **Step 2: Replace the hardcoded role-filter logic**

Replace the current `GET` handler body from the permission check to the query (lines 7–55):

```ts
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const actorRole = session.role as Role
    const isGestor = actorRole === 'gestor'
    const managedRoles = ROLE_CAN_CREATE[actorRole] ?? []

    // Roles with no managed subordinates have no access to this endpoint
    if (!isGestor && managedRoles.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query(
      isGestor
        ? `
          SELECT
            u.id,
            u.nome,
            u.email,
            u.role,
            u.active,
            u.created_at,
            COUNT(vp.id)::int AS lead_count
          FROM users u
          LEFT JOIN vendedor_projetos vp ON u.id = vp.vendedor_id
          GROUP BY u.id, u.nome, u.email, u.role, u.active, u.created_at
          ORDER BY u.nome
        `
        : `
          SELECT
            u.id,
            u.nome,
            u.email,
            u.role,
            u.active,
            u.created_at,
            COUNT(vp.id)::int AS lead_count
          FROM users u
          LEFT JOIN vendedor_projetos vp ON u.id = vp.vendedor_id
          WHERE u.role = ANY($1::text[])
          GROUP BY u.id, u.nome, u.email, u.role, u.active, u.created_at
          ORDER BY u.nome
        `,
      isGestor ? [] : [managedRoles]
    )

    const result = rows.map((row: Record<string, unknown>) => ({
      ...row,
      is_self: row.id === session.userId,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Usuarios query error:', error)
    return NextResponse.json({ error: 'Failed to fetch usuarios' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/usuarios/route.ts
git commit -m "feat(roles): derive visible users from ROLE_CAN_CREATE in GET /api/usuarios"
```

---

## Task 5: Update `PATCH /api/usuarios/[id]/role` — replace hardcoded checks with `canManageRole`

**Files:**
- Modify: `web/src/app/api/usuarios/[id]/role/route.ts`

- [ ] **Step 1: Replace the full handler**

Replace the full content of `web/src/app/api/usuarios/[id]/role/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, ROLE_CAN_CREATE, canManageRole, type Role } from '@/lib/dal'

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

    const actorRole = session.role as Role
    const creatableRoles = ROLE_CAN_CREATE[actorRole] ?? []

    if (creatableRoles.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = params

    if (session.userId === id) {
      return NextResponse.json({ error: 'Nao e possivel alterar o proprio cargo' }, { status: 403 })
    }

    let body: { role?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { role } = body

    if (!role || !creatableRoles.includes(role as Role)) {
      return NextResponse.json(
        { error: `Role invalido. Valores permitidos: ${creatableRoles.join(', ')}` },
        { status: 400 }
      )
    }

    const targetRows = await query(`SELECT id, role FROM users WHERE id = $1`, [id])
    if (targetRows.length === 0) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })
    }

    const targetRole = targetRows[0].role as Role

    if (targetRole === 'gestor') {
      return NextResponse.json({ error: 'Nao e possivel alterar o cargo de um gestor' }, { status: 403 })
    }

    if (!canManageRole(actorRole, targetRole)) {
      return NextResponse.json({ error: 'Sem permissao para alterar este cargo' }, { status: 403 })
    }

    const updated = await query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, nome, email, role, active, created_at`,
      [role, id]
    )

    return NextResponse.json(updated[0])
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/usuarios/[id]/role/route.ts
git commit -m "feat(roles): replace ADM_PRODUTO_ALLOWED hardcode with canManageRole in PATCH /api/usuarios/[id]/role"
```

---

## Task 6: Update `middleware.ts` — add `assistente_aprovacao` isolation

**Files:**
- Modify: `web/src/middleware.ts`

- [ ] **Step 1: Add `assistente_aprovacao` block** after the `coord_aprovacao` block (after line 84)

```ts
  if (role === 'assistente_aprovacao') {
    // assistente_aprovacao é TGov-only (somente aprovação).
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add web/src/middleware.ts
git commit -m "feat(roles): add assistente_aprovacao routing isolation in middleware"
```

---

## Task 7: Update `cadastro-vendedor/page.tsx` — allow new TGov manager roles

**Files:**
- Modify: `web/src/app/cadastro-vendedor/page.tsx`

- [ ] **Step 1: Extend the page access guard**

Replace line 10:
```ts
// Before:
if (role !== 'gestor' && role !== 'admin' && role !== 'adm_produto') redirect('/sem-permissao')

// After:
const USERS_PAGE_ROLES = ['gestor', 'admin', 'adm_produto', 'coord_aprovacao', 'assistente_aprovacao']
if (!USERS_PAGE_ROLES.includes(role)) redirect('/sem-permissao')
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/cadastro-vendedor/page.tsx
git commit -m "feat(roles): allow coord_aprovacao and assistente_aprovacao to access /cadastro-vendedor"
```

---

## Task 8: Update `CadastroVendedorClient.tsx` — add badges, derive role selects from `creatableRoles`

**Files:**
- Modify: `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx`

- [ ] **Step 1: Add `assistente_aprovacao` to static maps** (lines 8–46)

In the `Usuario` type interface, change:
```ts
role: 'gestor' | 'coordenador' | 'visualizador' | 'vendedor' | 'adm_produto' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista'
```

In `ROLE_LABELS`:
```ts
assistente_aprovacao: 'Assist. Aprovação',
```

In `ROLE_BADGE_CLASSES`:
```ts
assistente_aprovacao: 'bg-cyan-50 text-cyan-600',
```

In `ROLE_SELECT_BG`:
```ts
assistente_aprovacao: 'bg-cyan-50 text-cyan-700 border-cyan-200',
```

- [ ] **Step 2: Add `creatableRoles` prop and derive role options**

Change the component signature from:
```ts
export default function CadastroVendedorClient({ userRole }: { userRole: string }) {
  const isAdmProduto = userRole === 'adm_produto'
```

To:
```ts
// Role → [label, value] pairs in creation order
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'visualizador', label: 'Visualizador' },
  { value: 'coordenador', label: 'Coordenador' },
  { value: 'adm_produto', label: 'Adm Produto' },
  { value: 'csm', label: 'CSM' },
  { value: 'coord_aprovacao', label: 'Coord. Aprovação' },
  { value: 'assistente_aprovacao', label: 'Assist. Aprovação' },
  { value: 'projetista', label: 'Projetista' },
]

export default function CadastroVendedorClient({ userRole, creatableRoles }: { userRole: string; creatableRoles: string[] }) {
  const roleOptions = ROLE_OPTIONS.filter(o => creatableRoles.includes(o.value))
```

- [ ] **Step 3: Replace the creation form's role select** (lines 182–216)

Replace both branches of the `{isAdmProduto ? (...) : (...)}` block with a single dynamic select:

```tsx
<div>
  <label htmlFor="role" className="block text-sm font-medium text-gray-600 mb-2">
    Cargo
  </label>
  <select
    id="role"
    name="role"
    defaultValue={roleOptions[0]?.value}
    className="w-full bg-gray-50 border border-gray-300 text-gray-800 px-4 py-3 rounded-lg focus:border-[#0072F7] focus:outline-none transition-colors"
  >
    {roleOptions.map(o => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 4: Replace the edit select in the users table** (lines 259–283)

Replace the three-way conditional (isGestor/isSelf, isAdmProduto, else) with:

```tsx
{isGestor || isSelf ? (
  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${ROLE_BADGE_CLASSES[usuario.role] || 'bg-gray-100 text-gray-600'}`}>
    {ROLE_LABELS[usuario.role] || usuario.role}
  </span>
) : creatableRoles.includes(usuario.role) ? (
  <select
    value={usuario.role}
    onChange={(e) => handleRoleChange(usuario.id, e.target.value)}
    className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer focus:outline-none ${ROLE_SELECT_BG[usuario.role] || 'bg-gray-50 text-gray-700 border-gray-200'}`}
  >
    {roleOptions.map(o => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
) : (
  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${ROLE_BADGE_CLASSES[usuario.role] || 'bg-gray-100 text-gray-600'}`}>
    {ROLE_LABELS[usuario.role] || usuario.role}
  </span>
)}
```

- [ ] **Step 5: Update `cadastro-vendedor/page.tsx`** to pass `creatableRoles` from the server

In `page.tsx`, import and pass the prop:
```ts
import { ROLE_CAN_CREATE, type Role } from '@/lib/dal'

// Inside the page component, after getting session:
const creatableRoles = ROLE_CAN_CREATE[role as Role] ?? []

return <CadastroVendedorClient userRole={role} creatableRoles={creatableRoles} />
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx web/src/app/cadastro-vendedor/page.tsx
git commit -m "feat(roles): dynamic role select in CadastroVendedorClient derived from ROLE_CAN_CREATE"
```

---

## Task 9: Update `Sidebar.tsx` — add `assistente_aprovacao` nav + Usuarios TGov link

**Files:**
- Modify: `web/src/components/Sidebar.tsx`

- [ ] **Step 1: Update the `SidebarProps` type** (line 10)

```ts
role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista'
```

- [ ] **Step 2: Add `assistente_aprovacao` nav block** after the `coord_aprovacao` block (after line 103)

```ts
: user.role === 'assistente_aprovacao'
? [
    { href: '/tgov', label: 'TGov Pipeline', icon: 'pipeline' },
    { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
    { href: '/cadastro-vendedor', label: 'Usuarios TGov', icon: 'vendedores' },
  ]
```

- [ ] **Step 3: Add "Usuarios TGov" to `coord_aprovacao` nav** (lines 99–103)

```ts
: user.role === 'coord_aprovacao'
? [
    { href: '/tgov', label: 'TGov Pipeline', icon: 'pipeline' },
    { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
    { href: '/cadastro-vendedor', label: 'Usuarios TGov', icon: 'vendedores' },
  ]
```

- [ ] **Step 4: Add badge + label for `assistente_aprovacao`** in the user info footer (lines 162–179)

In the className ternary chain, add before the final `: 'bg-green-50 text-green-600'`:
```ts
: user.role === 'assistente_aprovacao'
? 'bg-cyan-50 text-cyan-600'
```

In the label ternary, add:
```ts
: user.role === 'assistente_aprovacao' ? 'Assist. Aprovação'
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Sidebar.tsx
git commit -m "feat(roles): add assistente_aprovacao to Sidebar nav with Usuarios TGov link"
```

---

## Task 10: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
cd web && npm run dev
```

- [ ] **Step 2: Test `adm_produto` behavior is unchanged**

Log in as an `adm_produto` user. Verify:
- Redirects to `/tgov` (not CRM)
- `/cadastro-vendedor` shows and the role select shows: Coord. Aprovação, Assist. Aprovação, Projetista
- Cannot create a `vendedor` (backend rejects, frontend doesn't show the option)

- [ ] **Step 3: Test `coord_aprovacao` access**

Log in as `coord_aprovacao`. Verify:
- Sidebar shows "Usuarios TGov" link
- `/cadastro-vendedor` is accessible and role select shows: Assist. Aprovação, Projetista
- Cannot create `coord_aprovacao` (not in creatableRoles)

- [ ] **Step 4: Test `assistente_aprovacao` access**

Create an `assistente_aprovacao` user via `adm_produto` or `gestor`. Log in. Verify:
- Sidebar shows TGov Pipeline, TGov Dashboard, Usuarios TGov
- `/cadastro-vendedor` shows only Projetista in role select
- TGov aprovação tab loads and allows commenting, adding proposals
- CRM paths redirect to `/tgov`

- [ ] **Step 5: Test `projetista` is unchanged**

Log in as `projetista`. Verify:
- No "Usuarios TGov" in sidebar
- Only sees proposals where `tecnico_id = userId`
- Cannot access `/cadastro-vendedor` (redirects to `/sem-permissao`)
