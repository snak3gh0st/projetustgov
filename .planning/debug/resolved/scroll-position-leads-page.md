---
status: resolved
trigger: "scroll position not preserved when closing lead detail slider on leads page"
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:01:00Z
---

## Current Focus

hypothesis: Two distinct failure paths - (1) single rAF might race with React's async commit when closing slide-over, (2) browser Back navigation from /lead/[cnpj] page completely bypasses the onClose scroll restore
test: Code analysis shows onClose only triggers scroll restore via requestAnimationFrame; router.push('/lead/[cnpj]') navigation bypasses it entirely
expecting: Fix requires (1) double-rAF to ensure scroll restore fires after React commit, (2) sessionStorage-based scroll preservation for browser back navigation
next_action: Apply fix - use double rAF for close, and sessionStorage for cross-navigation scroll preservation

## Symptoms

expected: After closing/going back from lead detail slider, the leads list should remain at the same scroll position the user was at before opening the lead details.
actual: When the lead detail slider closes and user goes back to the leads list, the scroll position resets (likely to top), not to where the user was before clicking the lead.
errors: No error messages - this is a UX/navigation behavior issue
reproduction: 1) Go to /leads page, 2) Scroll down to any lead not visible at top, 3) Click on that lead to open slider/detail panel, 4) Close the slider or press Back, 5) Page resets to top instead of keeping previous scroll position
timeline: Current behavior - scroll position preservation is needed

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-02-24T00:00:00Z
  checked: web/src/app/leads/page.tsx lines 59, 193-196, 583-590
  found: scrollPositionRef stores window.scrollY on lead open. onClose uses requestAnimationFrame(() => window.scrollTo(...)) to restore. This handles the X/backdrop close path only.
  implication: The mechanism exists for explicit close, but timing may be fragile.

- timestamp: 2026-02-24T00:00:00Z
  checked: web/src/components/LeadSlideOver.tsx line 415
  found: "Ver Detalhes" button calls router.push(`/lead/${encodeURIComponent(lead.cnpj)}`). This navigates away WITHOUT calling onClose.
  implication: When user navigates to detail page and presses Back, scroll position is completely lost - no restore code runs at all.

- timestamp: 2026-02-24T00:00:00Z
  checked: web/src/app/layout.tsx line 30
  found: Layout uses <main className="ml-56 min-h-screen p-6"> with no overflow-y setting. Scroll container is window (document.scrollingElement).
  implication: window.scrollY and window.scrollTo are correct APIs for this scroll container.

- timestamp: 2026-02-24T00:00:00Z
  checked: web/next.config.js
  found: No scrollRestoration configuration. Next.js App Router defaults to resetting scroll on navigation.
  implication: Browser Back from /lead/[cnpj] to /leads causes Next.js to reset scroll to top.

- timestamp: 2026-02-24T00:00:00Z
  checked: Single requestAnimationFrame timing in onClose
  found: A single rAF fires before the browser paint but React 18 concurrent mode can schedule state commits asynchronously. The rAF may fire before React commits setSelectedLead(null), and if React's commit happens to reset something after the rAF, scroll could be lost.
  implication: Double requestAnimationFrame (rAF inside rAF) ensures execution AFTER React's commit phase.

## Resolution

root_cause: Two bugs: (1) Single requestAnimationFrame in onClose may fire before React's async commit completes in React 18 concurrent mode, causing the scrollTo to happen before the DOM settles. (2) "Ver Detalhes" button navigates via router.push() WITHOUT calling onClose, so scroll position is never restored when user presses browser Back to return to /leads - the sessionStorage key was never written AND there was no restoration code for the back-navigation case.

fix: (1) Changed single rAF to double-rAF in onClose handler to guarantee execution after React's commit + paint cycle. (2) Added sessionStorage.setItem('leads_scroll_position') in handleOpenLead to persist position across navigation. (3) Added useEffect([loading]) in LeadsPage that reads sessionStorage after leads finish loading and restores scroll via double-rAF. The check for sessionStorage key is idempotent - it removes the key after first use so filter/search changes don't retrigger it.

verification: TypeScript passes with no errors. Two paths verified by code: (a) X/backdrop close: double-rAF fires after React commit, scrollTo(ref.value) runs; (b) "Ver Detalhes" + Back: sessionStorage preserved, useEffect restores after loading=false.
files_changed:
  - web/src/app/leads/page.tsx
