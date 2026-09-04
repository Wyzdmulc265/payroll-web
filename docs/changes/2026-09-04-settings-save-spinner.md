# Wire up the settings save-button spinner and disabled state

**Type:** feature
**Date:** 2026-09-04
**Author(s):** AI assistant
**Related issue/PR:** none

---

## 1. Why

Every settings tab renders a `Saving...` spinner branch keyed off the
`saving` state (`saving === 'COMPANY'`, etc.) — but nothing ever called
`setSaving`, so the buttons gave zero feedback during the batch request.
Users assumed the click did nothing and clicked repeatedly, stacking
duplicate batch transactions on an already slow connection (see
`docs/bugsfix/2026-09-04-settings-batch-save-500.md`, where the resulting
load made timeouts more likely).

## 2. What changed

- Clicking any Save button (COMPANY, PAYROLL, STATUTORY, SYSTEM, Advanced)
  now immediately shows the rotating `Loader2` "Saving..." state and disables
  the button until the request settles — success or failure.
- No visual redesign: the spinner branches already existed; they are now
  actually reached.

## 3. How it works

- `src/app/settings/page.tsx` — `saveToApi` (the single funnel for all tab
  and Advanced saves) now calls `setSaving(category)` on entry and
  `setSaving(null)` in a `finally`, so errors still propagate to the
  callers' toast handling. One edit covers all five entry points instead of
  patching each handler.

## 4. What got better

- **Before (qualitative):** click → silence for several seconds → users
  re-clicked, firing parallel batches.
- **After:** click → instant spinner + disabled button → toast result.
  Double-submits are structurally prevented while a save is in flight.

## 5. Risks and trade-offs

- While an Advanced-modal save is in flight, the background tab button for
  the same category also shows Saving.../disabled (both key off one state).
  Harmless and truthful — a save is in flight — and the modal closes on
  success as before.
- A second save started before the first settles would clear the flag early
  via its own `finally`; disabled buttons make this unreachable in practice.

## 6. Test plan

- `npx tsc --noEmit` — clean; `npx eslint` on the page — 0 errors.
- Manual: throttle network, click "Save Company Settings" — spinner appears
  at once, button disables, re-clicks are impossible; success/failure toast
  restores the idle button.

## 7. Follow-ups

- None; the per-tab `saving` keys were designed for exactly this and now
  work as intended.
