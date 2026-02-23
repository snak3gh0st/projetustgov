---
phase: quick-50
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/leads/page.tsx
autonomous: true
requirements: [QUICK-50]

must_haves:
  truths:
    - "Ao abrir o slide-over de um lead, a página permanece na mesma posição de scroll"
    - "Ao fechar o slide-over, a página retorna exatamente ao ponto de scroll onde estava antes de abrir"
    - "A linha do lead clicado continua visível após fechar o slide-over"
  artifacts:
    - path: "web/src/app/leads/page.tsx"
      provides: "Scroll position save/restore on slide-over open/close"
      contains: "scrollPositionRef"
  key_links:
    - from: "row onClick"
      to: "scrollPositionRef.current = window.scrollY"
      via: "handleOpenSlideOver function"
      pattern: "scrollPositionRef"
    - from: "onClose callback"
      to: "window.scrollTo"
      via: "requestAnimationFrame after setSelectedLead(null)"
      pattern: "window\\.scrollTo"
---

<objective>
Preserve scroll position in the leads list when opening and closing the LeadSlideOver.

Purpose: Currently when a vendedor clicks a lead row to open the slide-over, then closes it, the browser resets to the top of the page. This forces the user to scroll back down to find their place, which is disruptive during active prospecting sessions.

Output: Modified leads/page.tsx that saves scrollY before opening the slide-over and restores it after closing.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Preserve and restore scroll position on slide-over open/close</name>
  <files>web/src/app/leads/page.tsx</files>
  <action>
Add a `useRef` to track scroll position:

```typescript
const scrollPositionRef = useRef<number>(0)
```

Replace the inline `onClick={() => setSelectedLead(lead)}` on the `<tr>` row (line ~353) with a named handler call that saves scroll first:

```typescript
// Add handler near other functions (around line 160-180):
function handleOpenLead(lead: typeof displayLeads[0]) {
  scrollPositionRef.current = window.scrollY
  setSelectedLead(lead)
}
```

Update the `<tr onClick>` on each row to call `handleOpenLead(lead)` instead of `setSelectedLead(lead)`.

Update the `onClose` callback passed to `<LeadSlideOver>` to restore scroll after the state update completes:

```typescript
onClose={() => {
  setSelectedLead(null)
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' })
  })
}}
```

The `requestAnimationFrame` is required because React needs to re-render (unmounting the slide-over overlay) before scroll restoration is meaningful. Using `behavior: 'instant'` avoids a visible scroll animation that would feel jarring.

Import `useRef` is already present in the React import on line 3 — no additional import needed.
  </action>
  <verify>
1. Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — should pass with no new errors.
2. Open /leads in browser, scroll down past 10+ rows, click any lead row, confirm slide-over opens and page stays in place.
3. Close slide-over via X or backdrop click — page must return to the same row without jumping to top.
  </verify>
  <done>
- `scrollPositionRef` declared with `useRef&lt;number&gt;(0)`
- `handleOpenLead` saves `window.scrollY` then calls `setSelectedLead`
- All `<tr onClick>` calls in displayLeads.map use `handleOpenLead`
- `onClose` on `<LeadSlideOver>` calls `setSelectedLead(null)` then `requestAnimationFrame(() => window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' }))`
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in `web/`
- Scroll position is identical before opening and after closing the slide-over
- Works for rows near top AND rows far down the list
</verification>

<success_criteria>
Clicking a lead row at position Y=1200px, viewing the slide-over, then closing it returns the page to Y=1200px without any visible jump or reload.
</success_criteria>

<output>
After completion, create `.planning/quick/50-visualiza-o-voltar-para-o-mesmo-ponto-an/50-SUMMARY.md`
</output>
