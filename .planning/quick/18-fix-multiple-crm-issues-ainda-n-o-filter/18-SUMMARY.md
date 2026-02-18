---
phase: quick-18
plan: 01
subsystem: ui
tags: [crm, leads, status-colors, pipeline, contact-notes, gestor, api]

requires:
  - phase: quick-17
    provides: Status filters for Aguardando Closer and Telefone Invalido in leads page
  - phase: 11-01
    provides: contact_notes table and ContactNotesTimeline component

provides:
  - Orange color for 'Não Contatado' status (distinct from red/error states)
  - Cascade parent row correctly shows sum of subLeads valor_emenda (no double-count)
  - Clickable pipeline quadrant cards on dashboard navigating to /leads?status_contato=...
  - totalForPipeline denominator excludes Fechado (active pipeline percentage)
  - PATCH + DELETE handlers for /api/leads/[cnpj]/notes with author ownership check
  - Inline edit/delete UI for contact notes in ContactNotesTimeline
  - POST /api/monitorar-cnpj endpoint to assign CNPJ directly to Paulo Gabriel
  - 'Adicionar CNPJ Monitorado' form section on /distribuir page (gestor-only)

affects:
  - leads pipeline UI
  - dashboard home page
  - contact notes workflow
  - distribuir/gestor workflow

tech-stack:
  added: []
  patterns:
    - "Inline edit pattern: editingNoteId state toggles between read and edit view"
    - "Pipeline card navigation: onClick with window.location.href + encodeURIComponent"
    - "Active pipeline denominator: excludes terminal status (Fechado) from % calculation"

key-files:
  created:
    - web/src/app/api/monitorar-cnpj/route.ts
  modified:
    - web/src/app/leads/page.tsx
    - web/src/app/page.tsx
    - web/src/app/api/leads/[cnpj]/notes/route.ts
    - web/src/components/ContactNotesTimeline.tsx
    - web/src/app/distribuir/page.tsx

key-decisions:
  - "Orange for Não Contatado: distinct from red (error/priority) while still signaling urgency"
  - "Active pipeline denominator: excludes Fechado so percentages show active-stage distribution"
  - "PATCH/DELETE notes: author or gestor can edit/delete, enforced server-side"
  - "Force flag for CNPJ conflict: single POST endpoint with force=true skips conflict check"

requirements-completed: []

duration: 7min
completed: 2026-02-18
---

# Quick Task 18: Fix Multiple CRM Issues Summary

**6 CRM UX fixes: orange status color, cascade sum, clickable pipeline cards, active pipeline %, note edit/delete UI with PATCH/DELETE API, and gestor CNPJ direct-assign form**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-18T17:27:09Z
- **Completed:** 2026-02-18T17:33:49Z
- **Tasks:** 3
- **Files modified:** 5 (+ 1 created)

## Accomplishments

- Fixed 6 CRM issues from user feedback in one atomic execution
- All 3 tasks compiled cleanly (npm run build passed after each task)
- Auto-fixed one TypeScript type error in monitorar-cnpj route (Rule 1: `query()` returns `Record<string, unknown>[]`, removed explicit type annotation on `.find()` callback)

## Task Commits

1. **Task 1: Fix status colors + cascade double-counting + clickable pipeline cards** - `f230261` (feat)
2. **Task 2: Edit contact notes (PATCH API + timeline edit UI)** - `e705f38` (feat)
3. **Task 3: Gestor UI to add monitored CNPJ directly to Paulo's pipeline** - `0d203c9` (feat)

## Files Created/Modified

- `web/src/app/leads/page.tsx` - Changed 'Não Contatado' STATUS_COLORS to orange; cascade parent sums subLeads values; sort 'valor' uses same sum
- `web/src/app/page.tsx` - STATUS_CONFIG expanded (Aguardando Closer, Telefone Invalido); STATUS_ORDER now 5 statuses; pipeline cards clickable; totalForPipeline excludes Fechado
- `web/src/app/api/leads/[cnpj]/notes/route.ts` - Added PATCH (update note with author check) and DELETE (delete note with author check) handlers
- `web/src/components/ContactNotesTimeline.tsx` - Added editingNoteId state; inline edit form with tipo select + observacao textarea; Editar/Excluir buttons per note
- `web/src/app/api/monitorar-cnpj/route.ts` - New gestor-only POST endpoint: validates CNPJ, looks up paulo@projetus.org, assigns as Exclusivo with 409 conflict on duplicate
- `web/src/app/distribuir/page.tsx` - Added amber card at top with CNPJ input, 'Atribuir a Paulo' button, success/error/conflict feedback, force override button

## Decisions Made

- Orange for 'Não Contatado' instead of red: red was indistinguishable from error states and priority indicators; orange reads as "pending action needed" without alarm
- Active pipeline denominator excludes Fechado: the meaningful business metric is share of in-flight leads per stage, not share of all time history
- Force flag on monitorar-cnpj: single endpoint with `force: true` body parameter avoids a separate override endpoint; 409 response body includes `conflict: true` to trigger UI state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type mismatch in monitorar-cnpj route**
- **Found during:** Task 3 build verification
- **Issue:** `query()` returns `Record<string, unknown>[]`. The `.find()` callback had an explicit `(l: { vendedor_id: string | null })` annotation which TypeScript rejected since `vendedor_id` is not declared in `Record<string, unknown>`
- **Fix:** Removed the explicit type annotation, let TypeScript infer `l: Record<string, unknown>` from the array type
- **Files modified:** `web/src/app/api/monitorar-cnpj/route.ts`
- **Verification:** Build passed with zero TypeScript errors
- **Committed in:** 0d203c9 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript bug)
**Impact on plan:** Minor type annotation fix. No functional or architectural change.

## Issues Encountered

None beyond the TypeScript type fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 6 CRM fixes deployed and functional
- Contact notes workflow now complete with create/edit/delete
- Gestor can add any CNPJ from the DB directly to Paulo Gabriel's pipeline from /distribuir
- Pipeline cards on home page navigate to filtered /leads view

---
*Phase: quick-18*
*Completed: 2026-02-18*
