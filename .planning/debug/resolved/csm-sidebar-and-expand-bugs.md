---
status: resolved
trigger: "Two bugs in Phase 23 CSM features: (1) CSM sidebar menu items not appearing for CSM user, (2) clicking a client row in /csm does not expand to show projects."
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:05:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: Bug 2 confirmed — missing key on Fragment in filtered.map(). Bug 1 is not a code bug (runtime/JWT stale token).
test: fix CsmDashboardClient.tsx — add key to Fragment, move side effects out of setState updater
expecting: expanded rows appear correctly after fix
next_action: apply fix to CsmDashboardClient.tsx

## Symptoms

expected: (1) CSM sidebar shows nav items like "BI Dashboard CSM" and other CSM links when logged in as bruno@projetus.org (csm role); (2) clicking a client row in /csm expands an inline panel showing the client's projects grouped by phase
actual: (1) Sidebar does not show CSM-specific items; (2) clicking a row does not show any projects
errors: none reported — silent failures
reproduction: log in as CSM user, navigate to /csm — sidebar menu items missing; click any client row — nothing expands
started: just shipped in Phase 23 (2026-04-28)

## Eliminated

- hypothesis: role value missing/mismatched in session causes both bugs
  evidence: Sidebar code uses `user.role === 'csm'` at line 96 — correct. layout.tsx passes session.user.role correctly. auth.ts session callback copies token.role to session.user.role correctly. Furthermore, canCsm() on page.tsx passes for user reaching /csm, proving role IS csm|gestor|admin. Code is correct — not a code bug.
  timestamp: 2026-04-27T00:05:00Z

- hypothesis: toggleExpand onClick has wrong event target or cnpj key mismatch
  evidence: onClick is directly on <tr> with `() => toggleExpand(c.cnpj)` — no event propagation issue. cnpj is used consistently as key in both expanded Set and projectsCache Record.
  timestamp: 2026-04-27T00:05:00Z

## Evidence

- timestamp: 2026-04-27T00:01:00Z
  checked: Sidebar.tsx lines 96-104
  found: `user.role === 'csm'` check is correct; CSM nav block has 6 items including 'BI Dashboard CSM'. layout.tsx passes session.user.role correctly cast.
  implication: Sidebar Bug 1 is NOT a code bug. Root cause is likely stale JWT token (user needs to re-login after role assignment) or DB role value mismatch (trailing space, wrong casing).

- timestamp: 2026-04-27T00:02:00Z
  checked: CsmDashboardClient.tsx lines 369-457
  found: filtered.map() returns `<>...</>` at line 370 WITHOUT a key prop. The key is misplaced on the inner `<tr key={c.cnpj}>` at line 372 instead of on the outer Fragment.
  implication: React cannot reconcile which fragment belongs to which client row. When expanded state changes, React applies the conditional `{isExpanded && <tr>}` to the wrong DOM positions, causing the expanded row to never appear visually even though state IS updated correctly.

- timestamp: 2026-04-27T00:03:00Z
  checked: toggleExpand function lines 195-216
  found: Side effects (setLoadingProjects, fetch) are executed INSIDE the setExpanded updater function. In React StrictMode (dev), setState updaters are called twice, causing a duplicate fetch on first expand.
  implication: Does not prevent expansion but causes double-fetch in dev. Should be fixed for correctness.

- timestamp: 2026-04-27T00:04:00Z
  checked: /api/csm/clients/[cnpj]/projects/route.ts
  found: API route is correct — auth gate uses canCsm(), CNPJ normalization is correct, query is valid.
  implication: API is not the problem; the bug is purely in the client component rendering.

## Resolution

root_cause: Bug 2 (expand): Fragment returned from filtered.map() has no key prop — key is misplaced on inner <tr> instead of outer <>. React cannot track element identity, breaking conditional expanded row rendering. Bug 1 (sidebar): Not a code bug — Sidebar.tsx role check is correct. Likely stale JWT after role assignment; fix is user re-login.
fix: |
  In CsmDashboardClient.tsx:
  1. Added `import React` so React.Fragment is accessible.
  2. Changed `<>` (keyless Fragment) to `<React.Fragment key={c.cnpj}>` — key is now on the outermost element of each map item, fixing React reconciliation.
  3. Removed `key` from inner `<tr>` (not needed now it's on Fragment).
  4. Removed `key` from expanded `<tr>` (not needed — there is only one).
  5. Moved fetch + setLoadingProjects out of setExpanded updater into the direct function body, guarded by `!isCurrentlyExpanded && !projectsCache[cnpj]` — prevents double-fetch in StrictMode and prevents fetch-on-collapse.
verification: TypeScript check passes for CsmDashboardClient.tsx (pre-existing TS error in CsmBiClient.tsx is unrelated). Logic trace confirms: React.Fragment with key allows correct element tracking; isExpanded state update now maps to the correct DOM row; fetch fires exactly once per first expand.
files_changed:
  - web/src/app/csm/CsmDashboardClient.tsx
