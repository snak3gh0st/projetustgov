---
phase: quick-25
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/usuarios/route.ts
  - web/src/app/cadastro-vendedor/page.tsx
autonomous: true
requirements: [QUICK-25-01]

must_haves:
  truths:
    - "Navigating to the Usuarios tab (cadastro-vendedor) does not crash with a client-side application error"
    - "The users table correctly marks the current user's row as non-editable (self-protection)"
    - "No useSession import exists in the Usuarios page"
  artifacts:
    - path: "web/src/app/api/usuarios/route.ts"
      provides: "GET /api/usuarios with is_self field per row"
      exports: ["GET"]
    - path: "web/src/app/cadastro-vendedor/page.tsx"
      provides: "Usuarios page without useSession dependency"
  key_links:
    - from: "web/src/app/cadastro-vendedor/page.tsx"
      to: "/api/usuarios"
      via: "fetch in useEffect, reads is_self from response"
      pattern: "is_self"
---

<objective>
Fix the client-side application error that crashes the Usuarios tab (cadastro-vendedor page).

Purpose: The page crashes on load because `useSession()` from `next-auth/react` is called without a wrapping `<SessionProvider>`. No SessionProvider exists in the layout (Auth.js v5 server-side auth is used instead). The page only uses `useSession` to get `currentUserId` for identifying the "self" row. Remove the dependency by moving self-detection to the server (API adds `is_self: boolean` to each user row).
Output: A Usuarios page that loads without crashing, with correct self-row protection.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/api/usuarios/route.ts
@web/src/app/cadastro-vendedor/page.tsx
@web/src/lib/dal.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add is_self field to GET /api/usuarios response</name>
  <files>web/src/app/api/usuarios/route.ts</files>
  <action>
In `web/src/app/api/usuarios/route.ts`, after the `getApiSession()` call (which already provides `session.userId`), map over the query results to add `is_self: boolean` to each row:

```ts
const rows = await query(`
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
`)

const result = rows.map((row: Record<string, unknown>) => ({
  ...row,
  is_self: row.id === session.userId,
}))

return NextResponse.json(result)
```

The `session` object from `getApiSession()` has `session.userId`. No other changes needed to this file.
  </action>
  <verify>
    Run `npx tsc --noEmit` from `web/` to confirm no type errors. Optionally curl the endpoint after deploy: response rows should each have an `is_self` boolean field.
  </verify>
  <done>
    GET /api/usuarios response includes `is_self: true` on the row matching the caller's user ID, `is_self: false` on all other rows.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove useSession from Usuarios page, use is_self from API</name>
  <files>web/src/app/cadastro-vendedor/page.tsx</files>
  <action>
In `web/src/app/cadastro-vendedor/page.tsx`:

1. Remove the `useSession` import line:
   ```ts
   import { useSession } from 'next-auth/react'
   ```

2. Add `is_self: boolean` to the `Usuario` interface:
   ```ts
   interface Usuario {
     id: string
     nome: string
     email: string
     role: 'gestor' | 'gestor_vendedor' | 'visualizador' | 'vendedor'
     active: boolean
     created_at: string
     lead_count: number
     is_self: boolean   // <-- add this
   }
   ```

3. Remove the `useSession` hook call and `currentUserId` variable:
   - Remove: `const { data: session } = useSession()`
   - Remove: `const currentUserId = (session?.user as { id?: string })?.id`

4. In the table row rendering, replace `usuario.id === currentUserId` with `usuario.is_self`:
   - Change: `const isSelf = usuario.id === currentUserId`
   - To: `const isSelf = usuario.is_self`

No other changes needed. The rest of the component (role badge logic, handleRoleChange, etc.) stays identical.
  </action>
  <verify>
    Run `npx tsc --noEmit` from `web/`. Confirm no import of `useSession` or `next-auth/react` remains in `cadastro-vendedor/page.tsx` by running:
    `grep -n "useSession\|next-auth/react" web/src/app/cadastro-vendedor/page.tsx`
    (expect zero matches). Run `npm run build` from `web/` to confirm a clean production build.
  </verify>
  <done>
    - `cadastro-vendedor/page.tsx` has zero references to `useSession` or `next-auth/react`
    - Navigating to /cadastro-vendedor loads without application error
    - The current user's row still shows a static badge (not an editable dropdown)
    - `npm run build` passes with no errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes from `web/`
2. `grep -n "useSession" web/src/app/cadastro-vendedor/page.tsx` returns no matches
3. `npm run build` from `web/` succeeds
4. App loads the Usuarios tab without "Application error: a client-side exception has occurred"
</verification>

<success_criteria>
- The Usuarios tab loads successfully without any client-side crash
- Self-row protection works: the logged-in user's own row shows a static role badge, not an editable dropdown
- TypeScript compilation passes with zero errors
- Production build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/25-fix-application-error-on-usuarios-tab/25-SUMMARY.md`
</output>
