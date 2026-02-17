---
phase: quick-14
plan: 01
subsystem: user-management
tags: [users, roles, gestor, ui, repo-sync, routing]
dependency_graph:
  requires: [auth-actions, validations, dal, repo-sync]
  provides: [api/usuarios GET, api/usuarios/[id]/role PATCH, createUsuario server action, Usuarios page, Paulo Gabriel routing]
  affects: [cadastro-vendedor page, Sidebar, repo-sync lead assignment]
tech_stack:
  added: []
  patterns: [role-colored dropdowns, optimistic-update-with-revert, server-action-with-role-param]
key_files:
  created:
    - web/src/app/api/usuarios/route.ts
    - web/src/app/api/usuarios/[id]/role/route.ts
  modified:
    - web/src/lib/validations.ts
    - web/src/lib/auth-actions.ts
    - web/src/app/cadastro-vendedor/page.tsx
    - web/src/components/Sidebar.tsx
    - web/src/lib/repo-sync.ts
decisions:
  - "Gestors shown as read-only badge (no self-demotion from UI); own row also read-only"
  - "Route /cadastro-vendedor kept unchanged to avoid redirect changes"
  - "Paulo Gabriel lookup by email paulo@projetus.org; graceful fallback to round-robin if not found"
metrics:
  duration: "~3 minutes"
  completed: "2026-02-17"
  tasks: 3
  files: 7
---

# Quick Task 14: Transform Vendedores Page to Usuarios Summary

**One-liner:** Full user management page with role-aware creation, inline role dropdowns, and existing-client CNPJ routing to Paulo Gabriel.

## What Was Built

### Task 1: Usuarios API Endpoints + Role-Aware User Creation

**GET /api/usuarios** (`web/src/app/api/usuarios/route.ts`):
- Gestor-only endpoint returning ALL users (all roles, active and inactive)
- LEFT JOIN on `vendedor_projetos` to compute `lead_count` per user
- Returns: `id, nome, email, role, active, created_at, lead_count`

**PATCH /api/usuarios/[id]/role** (`web/src/app/api/usuarios/[id]/role/route.ts`):
- Gestor-only, validates role is one of `vendedor | visualizador | gestor_vendedor`
- Blocks: trying to change own role (403), trying to demote a gestor (403), invalid roles (400)
- Returns updated user object

**CreateUsuarioSchema** (`web/src/lib/validations.ts`):
- Extends the create form with optional `role` field defaulting to `'vendedor'`
- `CreateVendedorSchema` preserved as backward-compat export

**createUsuario server action** (`web/src/lib/auth-actions.ts`):
- Reads `role` from formData (defaults to `'vendedor'`)
- Validates via `CreateUsuarioSchema`, inserts with selected role
- `createVendedor` preserved unchanged for backward compat

### Task 2: Usuarios Page + Sidebar Update

**Sidebar** (`web/src/components/Sidebar.tsx`):
- Nav item label changed from 'Vendedores' to 'Usuarios' (href stays `/cadastro-vendedor`)

**Usuarios Page** (`web/src/app/cadastro-vendedor/page.tsx`):
- Title: "Usuarios", subtitle: "Gerenciar usuarios do sistema"
- Create form: role `<select>` with Vendedor/Visualizador/Gestor Vendedor options; button "Criar Usuario"
- Table: fetches from `/api/usuarios`, columns: Nome / Email / Cargo / Leads / Status
- Role column: inline `<select>` dropdown for non-gestor, non-self rows (role-colored background matching Sidebar badge colors)
- Gestors and self show static badge (protected from demotion)
- Role changes: optimistic update, PATCH call, error alert + revert on failure

### Task 3: Existing Client CNPJ Routing to Paulo Gabriel

**repo-sync.ts** (`web/src/lib/repo-sync.ts`):
- After STEP 6 (existing clients load), queries `paulo@projetus.org` user ID
- Logs warning if Paulo's account is missing or inactive (falls back to round-robin)
- Log line shows Paulo ID and count of existing-client CNPJs on every sync
- New-lead assignment: if CNPJ in `existing_clients` and Paulo found → assign to Paulo Gabriel
- Normal round-robin for all other new leads
- Existing lead assignments fully preserved (isExisting branch unchanged)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `web/src/app/api/usuarios/route.ts` - FOUND
- `web/src/app/api/usuarios/[id]/role/route.ts` - FOUND
- `web/src/lib/validations.ts` - FOUND (modified)
- `web/src/lib/auth-actions.ts` - FOUND (modified)
- `web/src/app/cadastro-vendedor/page.tsx` - FOUND (rewritten)
- `web/src/components/Sidebar.tsx` - FOUND (modified)
- `web/src/lib/repo-sync.ts` - FOUND (modified)
- Commit `3b425b7` (Task 1) - FOUND
- Commit `a7c7001` (Task 2) - FOUND
- Commit `ea6a734` (Task 3) - FOUND
- `npx tsc --noEmit` - PASS (no errors)
