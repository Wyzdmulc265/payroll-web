# Payroll register: dynamic scroll-based compression for frozen columns

**Type:** refactor
**Date:** 2026-09-02
**Author(s):** AI assistant
**Related issue/PR:** none

## 1. Why

The payroll register freezes the first four columns (Emp ID, Name, Department, Actions) so identity and actions stay visible while scrolling horizontally. The previous implementation hardcoded Tailwind `w-*` and `left-*` values (`w-24 sticky left-0`, `w-40 sticky left-[6rem]`, `w-28 sticky left-[16rem]`). When users scroll to inspect earnings and deductions, those four frozen columns kept their full widths, permanently consuming horizontal space even though the user had already scrolled far enough that the identifying columns no longer needed to be wide. This forced unnecessary horizontal scrolling and wasted screen real-estate on wide monitors.

## 2. What changed

- Added scroll-tracking state (`scrollX`) and rAF-throttled listener on the payroll table container (`#payroll-table-container`).
- Replaced hardcoded Tailwind `w-*`/`left-*` classes on the four frozen header and body cells with inline `width` and `left` styles computed from `scrollX`.
- Column widths compress linearly over a 200 px scroll window:
  - Emp ID: 6 rem → 2.5 rem (96 px → 40 px)
  - Name: 10 rem → 4 rem (160 px → 64 px)
  - Department: 7 rem → 3 rem (112 px → 48 px)
  - Actions: 6 rem → 2.5 rem (96 px → 40 px)
- Added a `ref` to the table container so the scroll listener attaches once the DOM is mounted.

## 3. How it works

`src/app/payroll/page.tsx`

- `tableContainerRef` (`useRef<HTMLDivElement>`) is attached to the `<div className="overflow-x-auto" …>` wrapper of the `<table>`.
- `rafRef` stores the `requestAnimationFrame` id so rapid scroll events do not queue multiple React renders.
- On each rAF tick, `setScrollX(Math.min(container.scrollLeft, 200))` caps the tracked offset at 200 px; beyond that the columns stay at their minimum widths.
- Derived values are computed synchronously before the `return`:

```tsx
const compressionRatio = Math.min(scrollX / 200, 1);
const empIdW = 96 - (96 - 40) * compressionRatio;
const nameW = 160 - (160 - 64) * compressionRatio;
const deptW = 112 - (112 - 48) * compressionRatio;
const actionsW = 96 - (96 - 40) * compressionRatio;
const nameLeft = empIdW;
const deptLeft = empIdW + nameW;
const actionsLeft = empIdW + nameW + deptW;
```

- Header `<th>` and body `<td>` cells for all four frozen columns now use `style={{ width: '…px', left: '…px' }}` instead of Tailwind `w-*`/`left-*`.
- A subtle `border-r border-gray-200` (header) / `border-r border-gray-100` (body) separates the frozen stack from the scrollable columns.

## 4. What got better

- **Usability**: as the user scrolls right to inspect PAYE, pension, FBT, and employer-cost columns, the frozen identity columns smoothly compress, giving more room to the scrollable content.
- **Horizontal scroll distance**: after 200 px of scroll the frozen stack only consumes ~168 px instead of 438 px, so the user reaches the rightmost columns faster.
- **Performance**: rAF throttling ensures at most one React render per paint frame even during fast mouse-wheel or trackpad scrolls.

## 5. Risks and trade-offs

- Inline `style` widths bypass Tailwind's design-token system; if a designer changes the default column widths the arithmetic in this file must be updated in tandem.
- `scrollLeft` is read from a DOM ref, so this code path only runs client-side (the file is already `'use client'`).
- The 200 px threshold is heuristic; very wide monitors or high-DPI scroll pads may compress sooner or later than feels natural. The value is easy to tune.

## 6. Test plan

- Manual: open `/payroll`, load a period with employees, scroll horizontally and verify the four leftmost columns compress smoothly while staying pinned to the left edge.
- Edge case: empty state (`payrollRows.length === 0`) does not attach the scroll listener because `tableContainerRef.current` is still mounted, so no error is thrown even though no rows render.
- TypeScript: `npx tsc --noEmit` passes with the new `useRef` imports and inline style shapes.

## 7. Follow-ups

- Apply the same scroll-compression pattern to other wide tables in the app (payslips, reports) if horizontal scroll becomes a repeated pain point.
- Consider exposing the compression threshold (currently 200 px) as a constant or CSS custom property so it can be tweaked without a code change.
