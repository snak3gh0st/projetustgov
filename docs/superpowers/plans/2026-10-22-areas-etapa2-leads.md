# Etapa 2: Leads com abas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three lead menu items become one "Leads" page with Aprovação, Execução and Prestação tabs. The list and side panels use the phase 1 visual foundation, and visualizadores no longer receive commission figures.

**Architecture:**
- `/leads` reads `?fase=` (none = Aprovação, `execucao`, `prestacao_contas`) and renders a client wrapper with `SectionTabs`. Only the active tab is mounted: `LeadsClient`, or `ExecucaoClient` controlled by `fase`.
- `/execucao` redirects to `/leads`, keeping the query string.
- Pure rules (tabs per role, legacy redirect target, commission redaction) live in `lib` and are unit-tested. Components are verified in the browser.

**Tech Stack:** Next.js 14 app router, next-auth v5, Tailwind tokens from phase 1, `motion/react` (`m.`, LazyMotion strict), node:test via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-21-areas-por-equipe-design.md` (sections "Comercial: Leads", "Card do lead" last bullet, "Entrega em etapas" item 2).

## Global Constraints

- Old URLs keep working: `/leads`, `/leads?status_contato=…`, `/execucao`, `/execucao?fase=execucao|prestacao_contas|todas`, `/execucao?status=…`, `/execucao?alert_only=true`.
- Nobody loses a screen. The "nobody but gestor loses a screen" test keeps its meaning.
- Copy and styling:
  - Product register; no em dashes in copy.
  - No colored side borders, no gradient text or lines, no decorative blur.
  - Motion only for state change, 150–280 ms, honoring reduced motion.
- `alert()` becomes toasts (`useToast`). Loading states become `SkeletonRows`; empty lists use `EmptyState`.
- Commission:
  - **Full figures:** gestor, diretoria and admin.
  - **Own figures:** vendedor and coordenador, already scoped by the API to their own rows. They never receive `comissao_bonus` or `closer_comissao_*`, mirroring the PATCH route.
  - **No commission fields:** every other role, including visualizador (user decision 22/10).
- Works at 375 px and in light and dark themes.

## Review Focus

1. A Home funnel link `/execucao?fase=execucao&status=X` lands on the Execução tab, filtered by X.
2. `/execucao?alert_only=true` (from the Home alerts) lands on Execução with "Apenas alertas" checked.
3. Visualizador gets only the Aprovação tab. `/leads?fase=execucao` falls back to Aprovação for them.
4. Switching tabs refetches the right phase and does not strip `status` from the URL when the page is first opened.
5. A failed status PATCH in Execução shows an error toast and restores the previous status. Today the failure is silent.

---

### Task 1: Tab rules and legacy redirect

**Files:**
- Create: `web/src/lib/lead-tabs.ts`
- Create: `web/src/lib/lead-tabs.test.ts`

**Interfaces:**
- Produces:
  - `type LeadTab = 'aprovacao' | 'execucao' | 'prestacao_contas'`
  - `leadTabsForRole(role: Role): LeadTab[]`
  - `resolveLeadTab(role: Role, fase: string | null | undefined): LeadTab`
  - `legacyExecucaoTarget(search: URLSearchParams): string`
  - `leadsHref(tab: LeadTab, extra?: Record<string, string>): string`

- [ ] **Step 1: Write the failing tests:**
  - `leadTabsForRole`:
    - vendedor, coordenador, gestor, diretoria and admin → all three tabs;
    - visualizador → `['aprovacao']`;
    - projetista → `[]`.
  - `resolveLeadTab`:
    - vendedor with `'prestacao_contas'` → `'prestacao_contas'`;
    - visualizador with `'execucao'` → `'aprovacao'`;
    - vendedor with `'lixo'` or `null` → `'aprovacao'`.
  - `legacyExecucaoTarget`:
    - `fase=prestacao_contas&status=Contatado` → `/leads?fase=prestacao_contas&status=Contatado`;
    - empty query → `/leads?fase=execucao`;
    - `fase=todas` → `/leads?fase=execucao`;
    - `alert_only=true` → `/leads?fase=execucao&alert_only=true`.
  - `leadsHref`:
    - `('aprovacao')` → `/leads`;
    - `('execucao', { status: 'X' })` → `/leads?fase=execucao&status=X`.
- [ ] **Step 2:** Run `cd web && npx tsx --test src/lib/lead-tabs.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** The role lists match `areas.ts`:
  - `SELLERS` gets Aprovação;
  - `SELLERS_WITH_EXECUCAO` adds the other two.
  - Export both lists from `areas.ts` rather than copying them.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(leads): tab rules and legacy execução redirect target`.

### Task 2: Commission redaction in the leads API

**Files:**
- Modify: `web/src/lib/roles.ts` (add the helper)
- Modify: `web/src/lib/roles.test.ts`
- Modify: `web/src/app/api/leads/route.ts:153`

**Interfaces:**
- Produces: `redactLeadCommission<T extends Record<string, unknown>>(row: T, role: string): T`

- [ ] **Step 1: Write the failing tests.** Start from a row with `comissao_valor`, `comissao_percentual`, `comissao_bonus`, `closer_comissao_valor`, `closer_comissao_percentual` and `valor_venda`.
  - gestor, diretoria and admin keep every field.
  - vendedor and coordenador keep `comissao_valor` and `comissao_percentual`; the bonus and closer fields become `null`.
  - visualizador and gestor_financeiro get `null` for every commission field and keep `valor_venda`.
- [ ] **Step 2:** Run `npx tsx --test src/lib/roles.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Apply it in `/api/leads` GET with `rows.map((r) => redactLeadCommission(r, session.role))`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `fix(leads): commission only for roles allowed to see it`.

### Task 3: One Leads page with tabs; nav and links

**Files:**
- Modify: `web/src/app/leads/page.tsx`
- Create: `web/src/app/leads/LeadsTabs.tsx` (client wrapper)
- Modify: `web/src/app/execucao/page.tsx` (redirect only)
- Modify: `web/src/lib/areas.ts`, `web/src/lib/areas.test.ts`
- Modify: `web/src/app/HomeClient.tsx` (links), `web/src/app/lead/[cnpj]/page.tsx` (back links)

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `ExecucaoClient` props become `{ userRole, fase: ExecucaoFase, initialStatus?: string, initialAlertOnly?: boolean }`. `LeadsClient` loses its own page header.

- [ ] **Step 1: Update `areas.test.ts` first.**
  - In the BEFORE check, each `/execucao?fase=F` entry counts as reached when the role has the `/leads` item and `leadTabsForRole(role)` includes F.
  - Drop the `/execucao` assertion in `isNavItemActive`.
  - Add: the comercial nav has exactly one item whose label starts with "Leads".
  - Run the tests. Expected: FAIL on the new assertion.
- [ ] **Step 2:** In `areas.ts`:
  - replace the three items with `{ href: '/leads', label: 'Leads', icon: 'leads', roles: SELLERS }`;
  - remove the `/execucao` branch from `isNavItemActive`.

  Run the tests. Expected: PASS.
- [ ] **Step 3:** Build the page:
  - **`leads/page.tsx`:**
    - keep the adm_produto guard;
    - if `leadTabsForRole` is empty, redirect to `/sem-permissao`;
    - compute the tab with `resolveLeadTab`;
    - render `<LeadsTabs>`.
  - **`LeadsTabs`:**
    - `PageHeader` "Leads" with a one-line description per tab, and `SectionTabs` with the allowed tabs only;
    - changing tabs calls `router.replace(leadsHref(tab), { scroll: false })`;
    - mount only the active client, keyed by tab.
  - **`execucao/page.tsx`:** `redirect(legacyExecucaoTarget(...))`.
- [ ] **Step 4:** Point the links straight at the new URLs:
  - HomeClient: `/execucao?...` → `leadsHref(...)`, including `alert_only`.
  - Lead card: back links go to `/leads` with the right `fase`.
- [ ] **Step 5:** Run `npx tsc --noEmit` and the test suite. Expected: clean. Commit `feat(leads): one Leads page with Aprovação, Execução and Prestação tabs`.

### Task 4: ExecucaoClient embedded and restyled

**Files:** Modify `web/src/app/execucao/ExecucaoClient.tsx`.

- [ ] Remove:
  - the `history.replaceState` effect;
  - the inner Execução/Prestação/Todas toggle;
  - the page header (the wrapper owns the title);
  - `FASE_HEADER`.

  Keep the "Dados atualizados em" line and the refreshing hint inside the filter bar.
- [ ] Make `fase` come from props. `initialAlertOnly` seeds `alertOnly`.
- [ ] `updateStatus`:
  - check `res.ok`;
  - on failure, restore the previous status and show `toast.error('Não foi possível salvar o status.')`.
- [ ] Restyle:
  - tokens instead of raw grays (`text-ink`, `text-ink-2`, `border-line`, `bg-surface`, `bg-raised`, `accent`);
  - header cells in sentence case, `text-xs font-medium text-ink-3`, no uppercase;
  - status control styled with `statusStyle()` pill colors;
  - no `border-l-*`: rows without contact get a subtle tint and the "Sem contato" label; the alert column already marks alerts;
  - `SkeletonRows` while loading;
  - `EmptyState` for "no results" (with a "Limpar filtros" action when filters are on) and for the error state;
  - `Button` for exports and "Carregar mais";
  - KPI row without emoji: a compact stat row built with tokens.
- [ ] Verify tsc and lint. Commit `feat(leads): execução and prestação tabs on the phase 1 foundation`.

### Task 5: LeadsClient restyled

**Files:** Modify `web/src/app/leads/LeadsClient.tsx`.

- [ ] Replace the five `alert()` calls with toasts. A failed export guard becomes `toast.info`.
- [ ] Show commission in the Valor column only when the row carries it (it is `null` after Task 2 for roles that must not see it), and still use `hasTeamCommercialView` for the Responsável column as today.
- [ ] Apply the same restyle rules as Task 4:
  - tokens;
  - header cells;
  - status pill colors from `statusStyle()`;
  - CLIENTE/NOVO badges in sentence case;
  - expand chevron as an icon button with `aria-expanded`;
  - `SkeletonRows`, `EmptyState`, `Button`.
- [ ] Verify tsc and lint. Commit `feat(leads): aprovação tab on the phase 1 foundation`.

### Task 6: Shared side panel shell

**Files:**
- Create: `web/src/components/ui/SlideOver.tsx`
- Modify: `web/src/components/LeadSlideOver.tsx`, `web/src/components/ExecucaoSlideOver.tsx`

**Interfaces:**
- Produces: `SlideOver({ open, onClose, title, subtitle?, headerExtra?, footer?, children, widthClass? })`. It provides:
  - a portal to `document.body`;
  - a `z-overlay` backdrop (`bg-black/30`, no blur) and a `z-modal` panel;
  - `m.aside` sliding in from the right (x 24 → 0, opacity, 240 ms out-expo) inside `AnimatePresence`;
  - Escape to close, `role="dialog"`, `aria-modal`, `aria-labelledby`;
  - focus moves to the close button on open and returns to the opener on close.

- [ ] Both slide-overs render inside `SlideOver`.
  - Drop the gradient top line, the private `STATUS_COLORS` map (use `StatusPill`) and raw grays.
  - Keep the existing "open full card" action as the footer button.
- [ ] `LeadSlideOver`: if the contact update fails, show `toast.error`.
- [ ] Verify tsc and lint. Commit `feat(ui): shared side panel for leads`.

### Task 7: Release notes, seed and verification

**Files:**
- Modify: `web/src/components/NewsBanner.tsx` (v1.7)
- Modify: `web/scripts/dev-db/seed.mjs` (add a visualizador)

- [ ] NewsBanner v1.7 items:
  - "Leads numa página só, com abas Aprovação, Execução e Prestação de Contas"
  - "Lista e painel lateral com o visual novo"
  - "Comissão aparece só para quem tem permissão de vê-la"
- [ ] Seed `visualizador@dev.local` (Vera Visualizadora). Re-seed locally.
- [ ] Run:
  - the full suite (`npx tsx --test 'src/**/*.test.ts'`);
  - `npx tsc --noEmit`;
  - `npm run lint`;
  - `next build`, after stopping the dev server and clearing `.next`.
- [ ] Browser checks:
  - **vendedor:** three tabs; own commission only.
  - **visualizador:** Aprovação only; no commission in the list, panel or card. `/leads?fase=execucao` falls back.
  - **gestor:** Responsável and assignment work.
  - **Old URLs:** `/execucao?fase=prestacao_contas&status=Contatado`, `/execucao?alert_only=true` and `/execucao?fase=todas`.
  - **Screenshots:** light, dark and 375 px.
- [ ] Commit `chore(news): v1.7 release notes for Leads`.
