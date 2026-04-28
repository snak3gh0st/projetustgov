# Phase 24: UI Refresh — Research

**Researched:** 2026-04-27
**Domain:** Next.js 14 App Router — dark mode, collapsible sidebar, mobile drawer, brand copy
**Confidence:** HIGH

---

## Summary

Phase 24 adds four global UI improvements: a collapsible sidebar with cookie-persisted state, dark mode via next-themes, a mobile-responsive bottom drawer via vaul, and a brand text rename from "CRM de Vendas" to "Hub da Projetos". All decisions were pre-committed in STATE.md; this research validates the chosen approach and documents the exact implementation patterns.

The project currently has **zero dark mode infrastructure**: `tailwind.config.ts` has no `darkMode: 'class'`, `globals.css` has hard-coded light-mode body colors, `layout.tsx` has hard-coded `bg-gray-50 text-gray-800` on body and a fixed `ml-56` on main, and `Sidebar.tsx` uses fixed `w-56` with no collapsed variant. All four of these files require surgery.

The dark class applied to `<html>` by next-themes propagates to `document.body` via standard CSS cascade, so Tailwind `dark:` utilities work on portal-rendered content (dropdowns, modals) without any extra configuration — **as long as the project has not adopted `@radix-ui/themes`** (it has not; no `@radix-ui` packages are in `package.json`).

**Primary recommendation:** Install `next-themes@0.4.6` and `vaul@1.1.2`. Wire ThemeProvider as a `'use client'` Providers wrapper. Read the sidebar cookie in `layout.tsx` (RSC) via `cookies()` from `next/headers` and pass it as `defaultOpen` prop to a new client SidebarProvider. Use `usePathname` effect in the mobile drawer to auto-close on route change.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | User can collapse/expand sidebar; state persists across navigations via cookie, no hydration flash | Cookie read in RSC layout → pass as `defaultOpen` prop to client SidebarProvider; Server Action to write cookie when toggled |
| UI-02 | Dark mode toggleable from any page; dark class applies globally including Radix UI portals; no FOUC | next-themes ThemeProvider with `attribute="class"` + `suppressHydrationWarning` on `<html>`; Tailwind `darkMode: 'class'` |
| UI-03 | Mobile: sidebar appears as bottom drawer (vaul) that closes on route change | vaul Drawer.Root controlled with `open`/`onOpenChange`; `usePathname` + `useEffect` closes on path change |
| UI-04 | Brand text reads "Hub da Projetos" everywhere it previously showed "CRM de vendas" | 3 occurrences: `Sidebar.tsx:159`, `layout.tsx:10`, `(auth)/login/page.tsx:32` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-themes | 0.4.6 | Dark/light mode toggle with FOUC-free SSR | Injects blocking inline script before paint; pre-committed in STATE.md |
| vaul | ~1.1.2 | Mobile bottom drawer | Unstyled, accessible, React-native feel; pre-committed in STATE.md |
| tailwindcss | ^3.4.0 (already installed) | Dark variant via `darkMode: 'class'` | Already in project; just needs config change |
| next/headers cookies() | built-in Next.js 14 | Read sidebar cookie in RSC | Enables server-side initial render without flash |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| js-cookie or document.cookie | n/a | Write sidebar cookie from client | Lightweight client write without a Server Action round-trip |

**No new heavy deps.** Two packages total: `next-themes` + `vaul`.

**Installation:**
```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web
npm install next-themes vaul
```

---

## Architecture Patterns

### Recommended Structure Changes
```
web/src/
├── components/
│   ├── Sidebar.tsx          # Modified: collapsible toggle, dark: classes
│   ├── Providers.tsx        # NEW: 'use client' wrapper for ThemeProvider
│   ├── ThemeToggle.tsx      # NEW: sun/moon toggle button
│   └── MobileDrawer.tsx     # NEW: vaul-based mobile nav drawer
├── app/
│   └── layout.tsx           # Modified: reads sidebar cookie, wraps Providers
├── lib/
│   └── sidebar-actions.ts   # NEW: Server Action to write sidebar:state cookie
```

### Pattern 1: next-themes ThemeProvider with RSC Layout

**What:** `ThemeProvider` must be `'use client'`. RootLayout is an `async` RSC (reads session). Create a thin `Providers.tsx` client component that wraps `ThemeProvider`.

**When to use:** Any time you need a client context provider inside an async RSC layout.

```typescript
// web/src/components/Providers.tsx
'use client'

import { ThemeProvider } from 'next-themes'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
```

```typescript
// web/src/app/layout.tsx (modified)
import { cookies } from 'next/headers'
import Providers from '@/components/Providers'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const cookieStore = cookies()
  const sidebarOpen = cookieStore.get('sidebar:state')?.value !== 'false'

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-body">
        <Providers>
          {session?.user && (
            <Sidebar user={...} defaultOpen={sidebarOpen} />
          )}
          <main className={session ? "transition-[margin] ml-56 data-[collapsed=true]:ml-14 min-h-screen p-6" : "min-h-screen p-6"}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
```

**CRITICAL:** `suppressHydrationWarning` goes on `<html>`, not `<body>`. It suppresses the expected mismatch when next-themes injects the theme class server→client.

### Pattern 2: Cookie-based Sidebar Collapse

**What:** Server reads cookie on each request → passes initial state to `<Sidebar>`. Client updates cookie when toggle is clicked via Server Action or direct `document.cookie` write.

**When to use:** Any persisted layout state that must be flash-free on page load.

```typescript
// web/src/lib/sidebar-actions.ts
'use server'

import { cookies } from 'next/headers'

export async function setSidebarState(open: boolean) {
  const cookieStore = cookies()
  cookieStore.set('sidebar:state', String(open), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  })
}
```

```typescript
// In Sidebar.tsx — toggle button calls Server Action
// OR: write cookie client-side for instant UX (no round-trip):
// document.cookie = `sidebar:state=${open}; path=/; max-age=31536000`
```

**Note (Next.js 14 vs 15):** In the project's Next.js 14, `cookies()` is still synchronous. Call `cookies().get(...)` without `await`. The async form works too (forward-compatible). Use synchronous form to avoid ambiguity with the project's Next.js version.

### Pattern 3: vaul Mobile Drawer with Route-Change Close

**What:** Controlled vaul drawer that closes automatically when pathname changes.

**When to use:** Mobile sidebar navigation pattern.

```typescript
// web/src/components/MobileDrawer.tsx
'use client'

import { Drawer } from 'vaul'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function MobileDrawer({ children, navItems }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on route change (vaul issue #631 workaround)
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button className="fixed bottom-4 left-4 z-50 md:hidden ...">
          {/* hamburger icon */}
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl">
          {/* Nav items */}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
```

### Pattern 4: Responsive Layout Switch (Desktop Sidebar / Mobile Drawer)

**What:** Show the fixed sidebar on `md+` breakpoints; show the mobile drawer trigger on smaller screens.

```typescript
// In layout.tsx or Sidebar wrapper:
// Desktop: <Sidebar className="hidden md:flex" ... />
// Mobile:  <MobileDrawer className="md:hidden" ... />
// Main content: ml-0 on mobile, ml-56 (or ml-14 when collapsed) on md+
```

### Anti-Patterns to Avoid
- **ThemeProvider directly in async RootLayout:** `async` RSC cannot be a Client Component. Always extract to a `Providers.tsx`.
- **localStorage for sidebar state:** Causes hydration mismatch and FOUC. Cookie is server-readable.
- **Hard-coded `ml-56` on main without data attribute:** Won't track collapsed state. Use CSS variable or `data-sidebar-state` attribute.
- **`suppressHydrationWarning` on `<body>`:** Must be on `<html>`, one level above where next-themes injects the class.
- **Animating theme transitions with CSS transitions on root:** Can cause flash. Use `disableTransitionOnChange` on ThemeProvider or target specific elements.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark mode FOUC prevention | Custom blocking script in `<head>` | next-themes ThemeProvider | next-themes injects the blocking script automatically; getting the inline script timing right manually is error-prone |
| Drawer animation + gesture | CSS-only bottom sheet | vaul | Touch gesture recognition, snap points, accessibility (ARIA dialog role) — all included |
| Cookie read in layout | Manual `req.headers.get('cookie')` parsing | `cookies()` from `next/headers` | Type-safe, officially supported |
| Theme toggle persistence | Manual localStorage write | next-themes storageKey | Handles SSR/CSR sync, system preference fallback |

**Key insight:** FOUC prevention for both dark mode and sidebar collapse state requires server knowledge. next-themes handles dark mode via a synchronous blocking script; the cookie pattern handles sidebar state at render time in the RSC.

---

## Common Pitfalls

### Pitfall 1: Hard-coded colors in globals.css override Tailwind dark: utilities

**What goes wrong:** `globals.css` has `body { background-color: #F8FAFC; color: #1E293B; }`. These rules have higher specificity than Tailwind utilities and will prevent dark mode from changing the body background/text.

**Why it happens:** globals.css uses element selectors which beat Tailwind's utility classes.

**How to avoid:** Remove or replace the `body {}` block in `globals.css` with Tailwind's `@layer base`. Move colors to Tailwind `dark:` classes on `<body>` in `layout.tsx`.

**Warning signs:** Dark mode toggle fires but page background stays white.

### Pitfall 2: layout.tsx RootLayout is async — cannot be 'use client'

**What goes wrong:** Adding `ThemeProvider` directly to `layout.tsx` without extracting to a Client Component causes a build error ("Cannot have both async function and 'use client'").

**Why it happens:** `RootLayout` calls `await auth()` making it an async RSC; Client Components cannot be async.

**How to avoid:** Create `Providers.tsx` with `'use client'` that wraps ThemeProvider. RootLayout imports and renders `<Providers>` around children.

**Warning signs:** Next.js build error about `use client` in async component.

### Pitfall 3: vaul drawer remains open after navigation

**What goes wrong:** Clicking a nav link inside vaul closes the drawer via React state but vaul issue #631 shows in some versions the DOM state lingers.

**Why it happens:** vaul doesn't hook into Next.js router events.

**How to avoid:** Use controlled mode (`open` + `onOpenChange`) and add `useEffect(() => { setOpen(false) }, [pathname])`.

**Warning signs:** Drawer overlay visible on new page after navigation.

### Pitfall 4: ml-56 in layout.tsx won't track collapsed sidebar

**What goes wrong:** Sidebar collapses visually but main content area still has `ml-56`, leaving a gap or wrong offset.

**Why it happens:** `ml-56` is a static class; it doesn't know about sidebar state.

**How to avoid:** Pass sidebar state via a `data-sidebar-open` attribute on a wrapper element, or use a CSS variable (`--sidebar-width: 14rem`). Then main uses `ml-[var(--sidebar-width)]` or a conditional class derived from server-read cookie.

**Warning signs:** Content peeking behind or overlapping collapsed sidebar.

### Pitfall 5: cookies() is synchronous in Next.js 14

**What goes wrong:** Using `await cookies()` (the Next.js 15 async form) in a Next.js 14 project causes TS errors or unexpected behavior.

**Why it happens:** Next.js async cookies API was introduced in Next.js 15 RC.

**How to avoid:** Use `cookies().get(...)` (no await) in layout.tsx. The project uses `next@^14.2.0`. Server Actions can also use the synchronous form.

**Warning signs:** TypeScript error "cannot await non-Promise" or `undefined` returned from cookie read.

### Pitfall 6: Dark mode not applying to Radix UI portals (future concern)

**What goes wrong:** If `@radix-ui/themes` is ever added, portals render outside the `<Theme>` component and won't inherit theme tokens.

**Why it happens:** Radix Themes portals attach to `document.body`, outside the `<Theme>` wrapper where tokens are defined.

**How to avoid (now):** The project has no Radix Themes packages — not a current concern. Tailwind `dark:` classes propagate fine via `<html class="dark">` cascade. Document for Phase 25+.

---

## Code Examples

### ThemeToggle button (verified pattern)
```typescript
// web/src/components/ThemeToggle.tsx
// Source: shadcn/ui dark mode docs + next-themes useTheme hook
'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch: only render icon after mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Toggle dark mode"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
```

### Tailwind config change (required, one line)
```typescript
// web/tailwind.config.ts — add darkMode
const config: Config = {
  darkMode: 'class',  // ADD THIS LINE
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  // ... rest unchanged
}
```

### Sidebar toggle with cookie write
```typescript
// Inside Sidebar.tsx (client component)
'use client'
import { useState } from 'react'

function writeSidebarCookie(open: boolean) {
  document.cookie = `sidebar:state=${open}; path=/; max-age=31536000; SameSite=Lax`
}

// In component:
const [collapsed, setCollapsed] = useState(!defaultOpen)

function toggle() {
  const next = !collapsed
  setCollapsed(next)
  writeSidebarCookie(!next) // cookie stores 'open' state, not 'collapsed'
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage for theme | next-themes with blocking inline script | ~2021 | Eliminates FOUC on first load |
| CSS media queries for responsive sidebar | Tailwind breakpoints + vaul drawer | 2022+ | Proper gesture support on mobile |
| cookies() synchronous | cookies() async (Next.js 15) | Next.js 15 RC | Project on 14.2 — use sync form |
| Full sidebar width on mobile | Hidden sidebar + bottom sheet drawer | Current standard | Better mobile UX |

**Deprecated/outdated:**
- `localStorage.getItem('theme')` in `_document.js`: Replaced by next-themes auto-injection
- `ml-[sidebar-width]` static class: Should be dynamic or CSS-var driven when collapsible

---

---

## Scope Decision Required: Dark Mode Coverage (UI-02)

**Decision affects plan size significantly.**

22 of 32 `.tsx` files in `/app` use hard-coded light-mode color classes (`bg-white`, `bg-gray-50`, `text-gray-800`, etc.). The success criterion for UI-02 says "the dark class applies globally" — which next-themes satisfies by setting `class="dark"` on `<html>`. However, a user who enables dark mode on a page full of hard-coded `bg-white` divs will see a mostly-white page with only the sidebar/layout background darkened.

**Two valid interpretations:**

| Interpretation | Scope | Plan size |
|---------------|-------|-----------|
| A) "Dark class is available globally" | Infrastructure only: tailwind config + next-themes + layout.tsx + Sidebar.tsx + globals.css | ~3 tasks |
| B) "Dark mode looks correct on all pages" | Infrastructure + dark: variants on all 22 files | ~8-10 tasks |

**Research recommendation:** Implement interpretation A in Phase 24 (infrastructure + structural dark: classes on layout/sidebar/nav). Per-page dark: variants belong in a follow-up quick task or Phase 25. The success criterion does not say "every component renders dark mode correctly" — it says the class applies globally, which A satisfies.

**Planner action:** Scope to interpretation A unless user explicitly requests B. Document assumption in PLAN.md.

## Open Questions

1. **UI-04 casing: "Hub da Projetos" vs "Hub da PROJETOS"**
   - What we know: Memory notes say "always write PROJETUS in all caps in emails." The requirement literal says "Hub da Projetos."
   - What's unclear: Whether the sidebar brand text should follow email convention (PROJETUS) or use the new phrasing exactly as specified (Hub da Projetos).
   - Recommendation: Use "Hub da Projetos" verbatim as stated in the requirement. This is sidebar UI text, not an email subject. Flag for planner to confirm with user if they want "Hub da PROJETOS."

2. **Sidebar icon-only collapsed state icons**
   - What we know: Sidebar uses inline SVG icons via the NavIcon function.
   - What's unclear: When collapsed to icon-only, should the labels be hidden via CSS (simple) or should the component restructure (complex)?
   - Recommendation: Simple approach — `hidden` label + narrower `w-14` aside. No restructuring needed.

---

## Sources

### Primary (HIGH confidence)
- [next-themes GitHub (pacocoursey/next-themes)](https://github.com/pacocoursey/next-themes) — ThemeProvider API, suppressHydrationWarning, useTheme hook
- [Next.js cookies() API reference](https://nextjs.org/docs/app/api-reference/functions/cookies) — synchronous in Next.js 14, async in Next.js 15, Server Action usage
- [shadcn/ui dark mode docs](https://ui.shadcn.com/docs/dark-mode/next) — ThemeProvider setup pattern for App Router

### Secondary (MEDIUM confidence)
- [vaul getting-started](https://vaul.emilkowal.ski/getting-started) — Drawer.Root, Drawer.Portal, Drawer.Content basic usage; version ~1.1.2
- [vaul issue #631](https://github.com/emilkowalski/vaul/issues/631) — Confirmed: drawer doesn't auto-close on Next.js navigation; usePathname + useEffect is the workaround
- [shadcn sidebar cookie pattern](https://v3.shadcn.com/docs/components/sidebar) — `sidebar:state` cookie name, `defaultOpen` prop, Server Component cookie read

### Tertiary (LOW — verify before use)
- [Radix Themes dark mode docs](https://www.radix-ui.com/themes/docs/theme/dark-mode) — Portal-in-portal wrapping for Radix Themes; LOW because project doesn't use `@radix-ui/themes`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — next-themes 0.4.6 + vaul 1.1.2 verified via official sources; both pre-committed in STATE.md
- Architecture: HIGH — cookie pattern verified via Next.js official docs; Providers.tsx pattern is the standard App Router approach
- Pitfalls: HIGH — all 6 pitfalls verified against actual project files (globals.css, layout.tsx, Sidebar.tsx, package.json)

**Research date:** 2026-04-27
**Valid until:** 2026-07-27 (stable libraries; next-themes and vaul have not had breaking changes in 12+ months)
