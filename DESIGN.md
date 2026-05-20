# Design System: Hub da PROJETUS

## 1. Visual Theme & Atmosphere

A high-trust, data-dense product interface. Density: 6/10 (tables, pipelines, status grids). Variance: 3/10 (predictable symmetric — users need orientation, not surprise). Motion: 2/10 (minimal; only confirmatory feedback).

**Dark mode philosophy:** Near-black system dark, not branded navy. The darkness is the canvas for data — numbers pop, status colors read cleanly, text hierarchy is stark and immediate. Feels like a professional tool, not a design statement.

**Light mode philosophy:** Clean off-white surface. Cards float on a muted gray background. Accent blue (#0072F7) anchors all interactive elements.

## 2. Color Palette & Roles

### Light Mode
- **Page Canvas** (`#F8FAFC`, Tailwind `bg-slate-50`) — Page background
- **Surface White** (`#FFFFFF`) — Cards, panels, table rows
- **Subtle Surface** (`#F1F5F9`, Tailwind `bg-slate-100`) — Alternating rows, hover states, input fills
- **Border Default** (`#E2E8F0`, Tailwind `border-slate-200`) — Card borders, dividers
- **Border Strong** (`#CBD5E1`, Tailwind `border-slate-300`) — Table headers, active separators
- **Text Primary** (`#0F172A`, Tailwind `text-slate-900`) — Headlines, primary labels
- **Text Secondary** (`#475569`, Tailwind `text-slate-600`) — Descriptions, metadata
- **Text Muted** (`#94A3B8`, Tailwind `text-slate-400`) — Timestamps, placeholders, supporting text

### Dark Mode
- **Page Canvas** (`#09090B`, Tailwind `bg-zinc-950`) — Page background — near-black system feel
- **Surface** (`#18181B`, Tailwind `bg-zinc-900`) — Cards, panels, slide-overs, modals
- **Surface Raised** (`#27272A`, Tailwind `bg-zinc-800`) — Hover states, active rows, secondary surfaces
- **Surface Subtle** (`#3F3F46`, Tailwind `bg-zinc-700`) — Input fills, skeleton loaders
- **Border Default** (`#3F3F46`, Tailwind `border-zinc-700`) — Card borders, dividers
- **Border Muted** (`#27272A`, Tailwind `border-zinc-800`) — Subtle separators
- **Text Primary** (`#FAFAFA`, Tailwind `text-zinc-50`) — All primary text — pure readable white
- **Text Secondary** (`#D4D4D8`, Tailwind `text-zinc-300`) — Secondary labels, descriptions
- **Text Muted** (`#71717A`, Tailwind `text-zinc-500`) — Timestamps, metadata, placeholders

### Brand Accents (both modes)
- **Sigma Blue** (`#0072F7`) — Primary CTA, active nav, links, chart accents
- **Sigma Magenta** (`#FD225C`) — Alerts, destructive actions, attention states
- **Sigma Purple** (`#7A4BAC`) — Secondary highlights, commission badges

### Status Palette
All statuses use a tinted approach: colored text on a very subtle same-hue background. In dark mode, the background tints are near-transparent (5-15% opacity) so the surface stays dark.

- **Não Contatado:** `text-orange-600 dark:text-orange-400` / `bg-orange-50 dark:bg-orange-500/10`
- **Retorno:** `text-amber-600 dark:text-amber-400` / `bg-amber-50 dark:bg-amber-500/10`
- **Proposta:** `text-blue-600 dark:text-blue-400` / `bg-blue-50 dark:bg-blue-500/10`
- **Fechado:** `text-emerald-600 dark:text-emerald-400` / `bg-emerald-50 dark:bg-emerald-500/10`
- **Quente/Muito Quente:** `text-red-600 dark:text-red-400` / `bg-red-50 dark:bg-red-500/10`
- **Aguardando Closer:** `text-purple-600 dark:text-purple-400` / `bg-purple-50 dark:bg-purple-500/10`
- **Telefone Invalido:** `text-zinc-500 dark:text-zinc-400` / `bg-zinc-100 dark:bg-zinc-500/10`

## 3. Typography Rules

- **Display/Headings:** Space Grotesk — Track-tight (`-0.02em`), weight 600-700. Scale: `text-2xl` page titles, `text-xl` section headers, `text-lg` card titles.
- **Body:** Inter — `text-sm` (14px) for tables, forms, labels; `text-base` (16px) for lead detail content. Line-height `1.5` for reading, `1.25` for UI labels.
- **Mono:** Used for CNPJs, currency large numbers, timestamps. Fallback to `font-mono` system stack.
- **Hierarchy rule:** Two weight steps minimum between heading and body. Never use size alone — pair it with weight.
- **Dark mode:** All text uses the zinc palette above. No pure `#000` in light, no pure `#FFF` in dark — `zinc-950` and `zinc-50` respectively.

## 4. Component Stylings

**Cards:**
- Light: `bg-white border border-slate-200 rounded-xl shadow-sm`
- Dark: `dark:bg-zinc-900 dark:border-zinc-800`
- Hover: `hover:shadow-md dark:hover:ring-1 dark:hover:ring-zinc-700` — ring replaces shadow in dark (shadows are invisible on near-black)
- Never nest cards. Progress bars inside cards are allowed.

**Tables:**
- Header: `bg-slate-50 dark:bg-zinc-800/50` with `text-zinc-500 dark:text-zinc-400 uppercase text-xs tracking-wide`
- Row: `bg-white dark:bg-zinc-900` — no default border between rows, use `divide-y divide-slate-100 dark:divide-zinc-800`
- Zebra striping: `even:bg-slate-50/50 dark:even:bg-zinc-800/30`
- Hover row: `hover:bg-slate-50 dark:hover:bg-zinc-800`

**Inputs / Selects / Textareas:**
- `bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500`
- Label: `text-slate-700 dark:text-zinc-300 text-sm font-medium`

**Buttons:**
- Primary: `bg-[#0072F7] hover:bg-[#0058C4] text-white` (unchanged, works on both modes)
- Secondary/ghost: `bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700`
- Destructive: `bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20`

**Modals / Slide-Overs:**
- Backdrop: `bg-black/50` (same in both modes)
- Panel: `bg-white dark:bg-zinc-900 border-l dark:border-zinc-800`
- Inner sections: `bg-slate-50 dark:bg-zinc-800/50`

**Navigation Sidebar:**
- Background: `bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800`
- Active item: `text-[#0072F7] bg-blue-50 dark:bg-blue-500/10 border-r-2 border-[#0072F7]`
- Inactive: `text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-800`

**Status Badges / Pills:**
- Use the status palette above. Border matches: `border-orange-200 dark:border-orange-500/20`
- Keep the pill shape (`rounded-full` or `rounded`) — never change the pill to a block.

**Skeleton Loaders:**
- Light: `bg-slate-200 animate-pulse`
- Dark: `bg-zinc-800 animate-pulse`

**Page headers:**
- Title: `text-2xl font-heading font-bold text-slate-900 dark:text-zinc-50`
- Subtitle: `text-sm text-slate-500 dark:text-zinc-400`

## 5. Layout Principles

- CSS Grid for multi-column KPI cards and vendedor grids. Flexbox only for single-axis alignment (nav items, button groups, badges).
- Max-width `max-w-[1800px] mx-auto` on all main content — prevents over-stretching on large monitors.
- Section spacing: `space-y-6` between major page sections.
- Cards internal padding: `p-4` (compact) or `p-5` (default). Never `p-8` inside cards — wastes space in dense layout.
- Sticky table headers for long lists: `sticky top-0 z-10`.
- No overlapping elements. Slide-overs use full z-50 overlay.

## 6. Motion & Interaction

- Sidebar open/close: `transition-[width] duration-200` — width-only, no layout reflow.
- Card hover: `hover:shadow-md transition-shadow` — shadow only, no transform (layout-stable).
- Slide-overs: `animate-slide-in-right` (already defined in tailwind config).
- No bounce, no elastic, no splash animations.
- Tab switching: immediate, no transition — data swaps should feel instant.
- `disableTransitionOnChange` on ThemeProvider — no flash on theme toggle.

## 7. Anti-Patterns (Banned)

- No gradient text on headers (`background-clip: text` gradient)
- No glassmorphism / backdrop-blur on main panels (only acceptable on modal overlay)
- No neon outer glow (`box-shadow: 0 0 20px color`) on any element
- No colored `border-left` accent stripes on cards (use background tint or icon instead)
- No hero-metric template (giant number + gradient card = trust-eroding cliché)
- No `#000000` pure black — use `zinc-950` (`#09090B`)
- No pure `#FFFFFF` in dark mode — use `zinc-50` (`#FAFAFA`)
- No spinner icons for loading — use skeleton shapes matching content dimensions
- No color-only status encoding — always pair color with text label
- No inline `style=` for theme colors — use Tailwind dark: variants consistently
- No mixed gray scales — use zinc consistently in dark mode, slate in light mode
