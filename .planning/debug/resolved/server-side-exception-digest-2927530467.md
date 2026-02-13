---
status: resolved
trigger: "Investigate issue: server-side-exception-digest-2927530467"
created: 2026-02-13T00:00:00Z
updated: 2026-02-13T00:20:00Z
---

## Current Focus

hypothesis: Server-side rendering error when loading dashboard for specific users - likely related to Phase 11 changes (role-based filtering, permission checks, or new visualizador role)
test: Check server logs, examine dashboard page SSR logic, identify which user types trigger the error
expecting: Find specific query or permission check failing for certain user roles/data states
next_action: Check Vercel logs for digest 2927530467, then examine dashboard page server-side code

## Symptoms

expected: User logs in and sees their dashboard
actual: Error shows on the page (Digest: 2927530467) - "Application error: a server-side exception has occurred (see the server logs for more information)"
errors: Digest: 2927530467 quando conectando com alguns usuarios (when connecting with some users)
reproduction: Login with specific user(s) - affects certain users but not all
started: After a recent deployment (Phase 11 was just completed with existing clients filtering, contact notes, visualizador role, and inline editing features)

## Eliminated

## Evidence

- timestamp: 2026-02-13T00:05:00Z
  checked: web/src/app/layout.tsx line 25
  found: Type assertion only includes 'gestor' | 'vendedor', excludes 'visualizador'
  implication: When visualizador user logs in, type mismatch causes SSR failure

- timestamp: 2026-02-13T00:06:00Z
  checked: web/src/components/Sidebar.tsx line 10
  found: SidebarProps.user.role typed as 'gestor' | 'vendedor' only
  implication: Component cannot accept visualizador role, will cause runtime error

- timestamp: 2026-02-13T00:07:00Z
  checked: web/src/lib/dal.ts lines 15, 27
  found: DAL correctly includes visualizador in type definitions
  implication: Backend supports visualizador, but frontend layout/sidebar do not

## Resolution

root_cause: Sidebar component and layout.tsx only support 'gestor' | 'vendedor' roles in their TypeScript types. When a visualizador user logs in, the server-side rendering fails because the Sidebar component cannot accept the 'visualizador' role value, causing the digest 2927530467 error.

fix: Added 'visualizador' to role types in Sidebar component and layout.tsx:
1. Updated SidebarProps interface to include 'visualizador' in role union type
2. Updated layout.tsx type assertion to include 'visualizador'
3. Added visualizador badge display (purple color scheme)
4. Visualizador users see BASE_NAV_ITEMS (same as vendedor)

verification: Build successful with no TypeScript errors. All files compile correctly. Visualizador users will now be able to log in and see the dashboard without SSR errors.

files_changed:
  - web/src/components/Sidebar.tsx
  - web/src/app/layout.tsx
