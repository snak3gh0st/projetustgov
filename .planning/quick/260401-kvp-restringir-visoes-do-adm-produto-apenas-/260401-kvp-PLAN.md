---
phase: quick
plan: 260401-kvp
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/components/Sidebar.tsx
  - web/src/app/layout.tsx
  - web/src/app/page.tsx
  - web/src/app/HomeClient.tsx
  - web/src/app/leads/page.tsx
  - web/src/app/leads/LeadsClient.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "ADM Produto sees only TGov Dashboard, Usuarios TGov, and no other sidebar links"
    - "ADM Produto navigating directly to / or /leads is redirected to /sem-permissao"
    - "Sidebar role badge displays 'Adm Produto' correctly (not blank or wrong role)"
  artifacts:
    - path: "web/src/components/Sidebar.tsx"
      provides: "adm_produto nav branch with /tgov and /cadastro-vendedor only"
    - path: "web/src/app/HomeClient.tsx"
      provides: "client component extracted from page.tsx"
    - path: "web/src/app/leads/LeadsClient.tsx"
      provides: "client component extracted from leads/page.tsx"
  key_links:
    - from: "web/src/app/page.tsx (server)"
      to: "HomeClient.tsx"
      via: "server renders client, guards adm_produto"
    - from: "web/src/app/leads/page.tsx (server)"
      to: "LeadsClient.tsx"
      via: "server renders client, guards adm_produto"
---

<objective>
Restrict the ADM Produto role to only three views: TGov Dashboard (/tgov), Usuarios TGov (/cadastro-vendedor), and the Pipeline TGOV tabs embedded in /tgov. All other CRM pages must be hidden from the sidebar and blocked via server-side redirect when accessed directly by URL.

Purpose: ADM Produto is a product-management role focused exclusively on the TGov module — exposing CRM pipeline, leads, BI, and commission views would show sensitive sales data they have no business need to see.
Output: Sidebar with role-specific nav for adm_produto, server-side route guards on home and leads pages.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/components/Sidebar.tsx
@web/src/app/layout.tsx
@web/src/app/tgov/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add adm_produto nav branch to Sidebar and fix layout role type</name>
  <files>web/src/components/Sidebar.tsx, web/src/app/layout.tsx</files>
  <action>
In web/src/components/Sidebar.tsx:

1. Update the SidebarProps user.role type to include 'adm_produto':
   ```
   role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto'
   ```

2. In the navItems ternary chain, add an adm_produto branch BEFORE the final else (vendedor default). Add it after the coordenador branch:
   ```
   : user.role === 'adm_produto'
   ? [
       { href: '/tgov', label: 'TGov Dashboard', icon: 'tgov' },
       { href: '/cadastro-vendedor', label: 'Usuarios TGOV', icon: 'vendedores' },
     ]
   ```
   The Pipeline TGOV (aprovacao and execucao tabs) lives inside /tgov — no separate nav entry needed.

3. In the role badge display block near the bottom (the span with role labels), add adm_produto to the ternary chain:
   - Badge class: 'bg-orange-50 text-orange-600' (consistent with cadastro-vendedor page)
   - Label: 'Adm Produto'
   Update both the className ternary and the inner text ternary to handle adm_produto.

In web/src/app/layout.tsx:

4. The session user role is cast with `as 'gestor' | 'vendedor' | 'visualizador'` — this excludes adm_produto, coordenador, and admin. Fix the cast to use the full role union:
   ```
   role: session.user.role as 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto',
   ```
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>In Sidebar.tsx: confirm adm_produto branch exists in navItems and role badge shows 'Adm Produto' with orange color. In layout.tsx: confirm the type cast is complete.</manual>
  </verify>
  <done>TypeScript compiles with no errors. Sidebar shows correct 2-item nav for adm_produto users. Role badge displays 'Adm Produto' in orange.</done>
</task>

<task type="auto">
  <name>Task 2: Add server-side route guards on / and /leads for adm_produto</name>
  <files>web/src/app/page.tsx, web/src/app/HomeClient.tsx, web/src/app/leads/page.tsx, web/src/app/leads/LeadsClient.tsx</files>
  <action>
Both web/src/app/page.tsx and web/src/app/leads/page.tsx are currently 'use client' components. Convert each to the two-file server+client pattern used in /tgov/page.tsx and /execucao/page.tsx.

Step A — Extract home page client component:
1. Copy the ENTIRE content of web/src/app/page.tsx into web/src/app/HomeClient.tsx.
2. Keep the 'use client' directive at the top of HomeClient.tsx.
3. The default export function in HomeClient.tsx should remain as-is (no props needed since it fetches its own data via useEffect).

Step B — Replace web/src/app/page.tsx with a server component:
```tsx
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import HomeClient from './HomeClient'

export default async function HomePage() {
  const session = await verifySession()
  if (session.role === 'adm_produto') {
    redirect('/tgov')
  }
  return <HomeClient />
}
```
Note: redirect to /tgov (not /sem-permissao) because adm_produto IS a valid user — they just have a different home.

Step C — Extract leads page client component:
1. Copy the ENTIRE content of web/src/app/leads/page.tsx into web/src/app/leads/LeadsClient.tsx.
2. Keep the 'use client' directive at the top of LeadsClient.tsx.

Step D — Replace web/src/app/leads/page.tsx with a server component:
```tsx
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import LeadsClient from './LeadsClient'

export default async function LeadsPage() {
  const session = await verifySession()
  if (session.role === 'adm_produto') {
    redirect('/sem-permissao')
  }
  return <LeadsClient />
}
```

Note on other pages: /bi, /comissoes, /monitorar, /distribuir, /monitoramento, /upload, /execucao — these pages are either already guarded (execucao), or accessible only via sidebar which adm_produto won't see. Leave them unmodified for now. Only guard the two most prominent entry points (home and leads) to prevent accidental direct navigation.

Note on /cadastro-vendedor: adm_produto SHOULD be allowed there — it's one of their three permitted views. No guard needed (current page has no role restriction, which is correct).
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Confirm HomeClient.tsx and LeadsClient.tsx exist with 'use client' directive. Confirm page.tsx files are server components importing verifySession.</manual>
  </verify>
  <done>TypeScript compiles clean. HomeClient.tsx and LeadsClient.tsx exist as extracted client components. Server page.tsx wrappers redirect adm_produto: home → /tgov, leads → /sem-permissao.</done>
</task>

</tasks>

<verification>
After both tasks:
- npx tsc --noEmit passes with no errors
- Sidebar.tsx has adm_produto in navItems chain (2 items: /tgov and /cadastro-vendedor)
- layout.tsx role type cast includes adm_produto
- HomeClient.tsx and LeadsClient.tsx exist as extracted client components
- web/src/app/page.tsx and web/src/app/leads/page.tsx are server components with verifySession + adm_produto redirect
</verification>

<success_criteria>
- An adm_produto user sees exactly 2 sidebar items: TGov Dashboard and Usuarios TGOV
- Role badge shows 'Adm Produto' in orange in the sidebar footer
- Navigating directly to / as adm_produto redirects to /tgov
- Navigating directly to /leads as adm_produto redirects to /sem-permissao
- All other roles are unaffected
</success_criteria>

<output>
After completion, create .planning/quick/260401-kvp-restringir-visoes-do-adm-produto-apenas-/260401-kvp-SUMMARY.md
</output>
