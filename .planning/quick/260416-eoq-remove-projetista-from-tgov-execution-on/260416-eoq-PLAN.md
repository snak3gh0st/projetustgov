---
phase: quick-260416-eoq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/tgov.ts
  - web/src/lib/dal.ts
  - web/src/app/tgov/page.tsx
  - web/src/app/api/tgov/execucao/route.ts
  - web/src/app/tgov/TGovDashboardClient.tsx
  - web/src/app/tgov/pipeline/page.tsx
  - web/src/components/Sidebar.tsx
autonomous: true
requirements: [EOQ-01]

must_haves:
  truths:
    - "projetista_execucao cannot access /tgov page (redirected to /sem-permissao)"
    - "projetista_execucao receives 403 from /api/tgov/execucao"
    - "coord_execucao and assistente_execucao retain full execucao tab access"
  artifacts:
    - path: "web/src/lib/tgov.ts"
      provides: "EXECUCAO_ONLY_ROLES without projetista_execucao"
      contains: "EXECUCAO_ONLY_ROLES = ['coord_execucao', 'assistente_execucao']"
    - path: "web/src/lib/dal.ts"
      provides: "canReadTgov without projetista_execucao"
    - path: "web/src/app/tgov/page.tsx"
      provides: "role guard without projetista_execucao"
    - path: "web/src/app/api/tgov/execucao/route.ts"
      provides: "API route without projetista_execucao isolation block"
  key_links:
    - from: "web/src/lib/tgov.ts"
      to: "web/src/app/tgov/TGovDashboardClient.tsx"
      via: "EXECUCAO_ONLY_ROLES import"
      pattern: "EXECUCAO_ONLY_ROLES"
---

<objective>
Remove projetista_execucao from TGov execution area access. Only coord_execucao and assistente_execucao should access execution.

Purpose: Business decision — projetista_execucao role loses access to /tgov execucao tab, pipeline execucao, and the /api/tgov/execucao endpoint.
Output: projetista_execucao is blocked from execution area across page guard, API, nav, and type unions.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove projetista_execucao from execution access guards and constants</name>
  <files>
    web/src/lib/tgov.ts
    web/src/lib/dal.ts
    web/src/app/tgov/page.tsx
    web/src/app/api/tgov/execucao/route.ts
  </files>
  <action>
1. web/src/lib/tgov.ts line 19 — remove 'projetista_execucao' from EXECUCAO_ONLY_ROLES:
   BEFORE: export const EXECUCAO_ONLY_ROLES = ['coord_execucao', 'assistente_execucao', 'projetista_execucao'] as const
   AFTER:  export const EXECUCAO_ONLY_ROLES = ['coord_execucao', 'assistente_execucao'] as const

2. web/src/lib/dal.ts line 89 — remove || role === 'projetista_execucao' from canReadTgov:
   BEFORE: || role === 'coord_execucao' || role === 'assistente_execucao' || role === 'projetista_execucao'
   AFTER:  || role === 'coord_execucao' || role === 'assistente_execucao'

3. web/src/lib/dal.ts line 103 — remove || role === 'projetista_execucao' from canCommentTgov:
   BEFORE: || role === 'coord_execucao' || role === 'assistente_execucao' || role === 'projetista_execucao'
   AFTER:  || role === 'coord_execucao' || role === 'assistente_execucao'

4. web/src/app/tgov/page.tsx lines 22-23 — remove the projetista_execucao check from the role guard:
   BEFORE: session.role !== 'assistente_execucao' &&\n    session.role !== 'projetista_execucao'
   AFTER:  session.role !== 'assistente_execucao'

5. web/src/app/api/tgov/execucao/route.ts lines 265-269 — remove the projetista_execucao tecnico_id isolation block entirely:
   Remove these lines:
     // projetista_execucao can only see records assigned to them via tecnico_id
     if (session.role === 'projetista_execucao') {
       params.push(session.userId)
       mainConditions.push(`pe.tecnico_id = $${params.length}::uuid`)
     }
   (The block is now dead code since projetista_execucao is blocked by canReadTgov at line 191.)
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>No TypeScript errors. EXECUCAO_ONLY_ROLES contains only coord_execucao and assistente_execucao. canReadTgov and page guard exclude projetista_execucao.</done>
</task>

<task type="auto">
  <name>Task 2: Update TGovDashboardClient and pipeline page type unions, update Sidebar nav</name>
  <files>
    web/src/app/tgov/TGovDashboardClient.tsx
    web/src/app/tgov/pipeline/page.tsx
    web/src/components/Sidebar.tsx
  </files>
  <action>
1. web/src/app/tgov/TGovDashboardClient.tsx line 283 — remove 'projetista_execucao' from userRole union type:
   BEFORE: 'coord_execucao' | 'assistente_execucao' | 'projetista_execucao'
   AFTER:  'coord_execucao' | 'assistente_execucao'

2. web/src/app/tgov/pipeline/page.tsx line 12 — remove 'projetista_execucao' from allowed roles array:
   BEFORE: 'coord_execucao', 'assistente_execucao', 'projetista_execucao',
   AFTER:  'coord_execucao', 'assistente_execucao',

3. web/src/components/Sidebar.tsx — the projetista_execucao nav branch (lines 136-141) shows TGov BI and Pipeline nav items. Since projetista_execucao is now blocked from /tgov, remove this branch. The role will fall through to BASE_WITH_EXECUCAO (which also includes TGov pipeline) — but since projetista_execucao can no longer access /tgov, simplest approach: remove the projetista_execucao-specific nav branch so it falls through to BASE_WITH_EXECUCAO. This still shows the nav items; the page guard will redirect if they try to access /tgov.

   Actually, to avoid showing inaccessible nav items: change the projetista_execucao branch to show only the pipeline (since /tgov/pipeline page.tsx still includes projetista_execucao in its allowed roles). Check pipeline/page.tsx to confirm — the pipeline page has its own role list independent of execucao.

   Change lines 136-141 from:
     : user.role === 'projetista_execucao'
     ? [
         { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
         { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
         { href: '/tgov', label: 'TGov BI', icon: 'pipeline' },
       ]
   to:
     : user.role === 'projetista_execucao'
     ? [
         { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
       ]

   This keeps projetista_execucao in the pipeline (which they still have access to) but removes /tgov and /tgov?view=dashboard which are now forbidden.
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>TypeScript compiles clean. projetista_execucao type removed from TGovDashboardClient userRole union. pipeline page guard excludes projetista_execucao. Sidebar shows only pipeline nav for projetista_execucao.</done>
</task>

</tasks>

<verification>
After both tasks: run `npx tsc --noEmit` in /web — must produce zero errors.

Spot-check the key constants:
- grep "EXECUCAO_ONLY_ROLES" web/src/lib/tgov.ts — must NOT contain projetista_execucao
- grep "canReadTgov" web/src/lib/dal.ts — must NOT contain projetista_execucao
- grep "projetista_execucao" web/src/app/tgov/page.tsx — must have NO results
- grep "projetista_execucao" web/src/app/api/tgov/execucao/route.ts — must have NO results
</verification>

<success_criteria>
- projetista_execucao is blocked at page guard (/tgov redirects to /sem-permissao)
- projetista_execucao is blocked at API level (canReadTgov returns false → 403)
- EXECUCAO_ONLY_ROLES = ['coord_execucao', 'assistente_execucao'] only
- coord_execucao and assistente_execucao unaffected — full execucao access retained
- TypeScript compiles with zero errors
- Sidebar shows only TGov Pipeline for projetista_execucao (not /tgov BI/Dashboard)
</success_criteria>

<output>
After completion, create `.planning/quick/260416-eoq-remove-projetista-from-tgov-execution-on/260416-eoq-SUMMARY.md`
</output>
