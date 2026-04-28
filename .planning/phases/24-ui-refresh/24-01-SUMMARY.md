---
phase: 24-ui-refresh
plan: "01"
subsystem: frontend-theme
tags: [dark-mode, next-themes, brand-rename, tailwind, ui-infrastructure]
dependency_graph:
  requires: []
  provides: [dark-mode-infrastructure, brand-text-hub-da-projetos, providers-wrapper, theme-toggle]
  affects: [web/src/app/layout.tsx, web/src/components/Sidebar.tsx, web/src/components/Providers.tsx, web/src/components/ThemeToggle.tsx]
tech_stack:
  added: [next-themes@0.4.6]
  patterns: [ThemeProvider wrapper, client boundary for RSC, mounted-guard hydration pattern]
key_files:
  created:
    - web/src/components/Providers.tsx
    - web/src/components/ThemeToggle.tsx
  modified:
    - web/package.json
    - web/package-lock.json
    - web/tailwind.config.ts
    - web/src/app/globals.css
    - web/src/app/layout.tsx
    - web/src/components/Sidebar.tsx
    - web/src/app/(auth)/login/page.tsx
decisions:
  - "UI-02 Interpretation A: dark mode infrastructure only — per-page dark: variants on 22 light-hardcoded pages deferred to follow-up quick task"
  - "UI-04 exact mixed case Hub da Projetos — PROJETUS-uppercase memory rule applies to emails only, not in-app UI text"
  - "suppressHydrationWarning on <html> not <body> — prevents FOUC from next-themes class injection"
  - "Pre-existing CsmBiClient.tsx TS error logged to deferred-items.md — out of scope for this plan"
metrics:
  duration: "~4 min"
  completed: "2026-04-28"
  tasks: 4
  files: 8
requirements_satisfied: [UI-02, UI-04]
---

# Phase 24 Plan 01: Dark Mode Infrastructure + Brand Rename Summary

Dark mode infrastructure via next-themes with Tailwind class strategy, plus brand text rename from "CRM de Vendas" to "Hub da Projetos" across sidebar, layout metadata, and login page.

## What Was Built

### Task 1 — Install next-themes and configure Tailwind darkMode
- Installed `next-themes@^0.4.6` (only this package — vaul reserved for Plan 24-03)
- Added `darkMode: 'class'` as first property in `tailwind.config.ts` Config object
- Committed: `07572b5`

### Task 2 — Replace globals.css body rule and add dark base layer
- Removed `background-color: #F8FAFC` and `color: #1E293B` from `body` block in globals.css
  — these element-selector rules would override Tailwind `dark:bg-gray-900` on body
- Added `html.dark ::-webkit-scrollbar-*` rules for dark mode scrollbar chrome
- Kept font-family on body, headings rule, light-mode scrollbar rules
- Committed: `156813c`

### Task 3 — Create Providers.tsx
- New `web/src/components/Providers.tsx` with `'use client'` directive
- Wraps children in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`
- `attribute="class"` aligns with Tailwind `darkMode: 'class'`
- `enableSystem` honors OS dark mode preference
- `disableTransitionOnChange` prevents CSS flash during toggle
- Committed: `bf6db3a`

### Task 4 — ThemeToggle, Sidebar dark mode, layout updates, login rename
- Created `web/src/components/ThemeToggle.tsx`:
  - `'use client'` directive + `useTheme` hook from next-themes
  - Mounted guard (renders neutral placeholder pre-hydration to prevent mismatch)
  - Sun icon when dark, moon icon when light; Portuguese labels (Claro/Escuro)
  - Full dark: variant classes on button
- Sidebar changes:
  - Added `import ThemeToggle` and `<ThemeToggle />` as first child of user-footer div
  - `dark:bg-gray-900` on `<aside>`, dark borders on all `border-b/border-t` divs
  - Nav inactive: added `dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800`
  - Nav active: added `dark:bg-blue-950/40`
  - User name: added `dark:text-gray-100`
  - Logout button: added `dark:bg-red-950/40 dark:hover:bg-red-950/60 dark:text-red-400`
  - Footer v4.6 text: added `dark:text-gray-500`
  - Brand subtitle: changed from "CRM de Vendas" to "Hub da Projetos" with `dark:text-gray-500`
- layout.tsx changes:
  - Added `import Providers from '@/components/Providers'`
  - Metadata: title → "Hub da Projetos", description → "Hub da Projetos — gestão de instrumentos governamentais"
  - `suppressHydrationWarning` on `<html>` (not body — prevents FOUC from next-themes injection)
  - `<body>` gains `dark:bg-gray-900 dark:text-gray-100`
  - Entire body content wrapped in `<Providers>...</Providers>`
- login/page.tsx: brand subtitle "CRM de Vendas" → "Hub da Projetos" + `dark:text-gray-500`
- Committed: `ec89be9`

## Scope Decisions

| Decision | Rationale |
|----------|-----------|
| UI-02 Interpretation A — infrastructure only | 22 pages with hard-coded `bg-white` cards, light text: deferred to follow-up quick task per plan objective |
| "Hub da Projetos" mixed case | PROJETUS-uppercase rule (memory) scoped to email subjects/body, not in-app UI text |
| suppressHydrationWarning on `<html>` only | next-themes sets class on `<html>`; suppressing on `<body>` would miss the mismatch |
| vaul NOT installed | Plan 24-03's responsibility per plan instructions |

## Verification Results

- `grep -RE "CRM de Vendas" web/src` → ZERO matches
- `grep -RE "Hub da Projetos" web/src` → 4 matches (Sidebar, layout x2, login)
- `grep -RE "Hub da PROJETOS" web/src` → ZERO matches (mixed case confirmed)
- `node_modules/next-themes` exists; `node_modules/vaul` does NOT exist
- `darkMode: 'class'` in tailwind.config.ts confirmed
- TypeScript: 1 pre-existing error in `CsmBiClient.tsx` (merged from Phase 23 master) — no new errors introduced

## Deviations from Plan

### Pre-existing Issue (Out of Scope)

**[Rule 3 — Pre-existing TS Error] CsmBiClient.tsx Recharts type mismatch**
- **Found during:** Task 4 TypeScript verification
- **Issue:** `src/app/csm/bi/CsmBiClient.tsx:137` — `TS2769` Recharts Tooltip formatter type incompatibility (merged from Phase 23 via master merge)
- **Action:** Logged to `.planning/phases/24-ui-refresh/deferred-items.md`. NOT fixed — pre-existing, out of scope for this plan.
- **Impact:** Zero — identical error existed before Task 4 changes. No new errors introduced.

## Self-Check: PASSED

All created/modified files confirmed on disk. All 4 task commits verified in git log.

| File | Status |
|------|--------|
| web/src/components/Providers.tsx | FOUND |
| web/src/components/ThemeToggle.tsx | FOUND |
| web/tailwind.config.ts | FOUND |
| web/src/app/globals.css | FOUND |
| web/src/app/layout.tsx | FOUND |
| web/src/components/Sidebar.tsx | FOUND |
| web/src/app/(auth)/login/page.tsx | FOUND |

| Commit | Message |
|--------|---------|
| 07572b5 | chore(24-01): install next-themes and add Tailwind darkMode class strategy |
| 156813c | feat(24-01): remove hard-coded body colors from globals.css, add dark scrollbar |
| bf6db3a | feat(24-01): create Providers.tsx with next-themes ThemeProvider wrapper |
| ec89be9 | feat(24-01): add ThemeToggle, integrate dark mode into Sidebar and layout, rename brand |
