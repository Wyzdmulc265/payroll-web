# Dynamic compression of frozen columns on horizontal scroll

**File:** `src/app/payroll/page.tsx`

## Problem

The frozen columns (Emp ID, Name, Department, Actions) keep their full width even when the user scrolls horizontally. This wastes space and makes the scrollable area feel cramped. The user wants the frozen columns to progressively compress as the user scrolls right, eventually collapsing to minimum widths so the scrollable columns have more room.

## Approach

Replace the static Tailwind sticky positioning with dynamic inline styles driven by a scroll-tracking state. Track `scrollProgress` (0 → 1) on the table container and interpolate each frozen column’s width and `left` offset between a base size and a minimum size.

### Column specs

| Column | Base width | Min width | Base left | Min left |
|--------|-----------|-----------|-----------|----------|
| Emp ID | 6rem (`w-24`) | 2.5rem | 0 | 0 |
| Name | 10rem (`w-40`) | 4rem | 6rem | 2.5rem |
| Department | 7rem (`w-28`) | 3rem | 16rem | 6.5rem |
| Actions | 6rem (`w-24`) | 2.5rem | 23rem | 9.5rem |

`scrollProgress` = `scrollLeft / (scrollWidth - clientWidth)`, clamped to `[0, 1]`.

Width at progress `p`: `base - (base - min) * p`
Left offset at progress `p`: sum of all previous columns’ compressed widths.

### Implementation steps

1. **Add state and ref**
   - `const [scrollProgress, setScrollProgress] = useState(0)`
   - `const tableContainerRef = useRef<HTMLDivElement>(null)`

2. **Add scroll listener with rAF throttle**
   - In a `useEffect`, attach `scroll` listener to `tableContainerRef.current`
   - Compute `scrollLeft / (scrollWidth - clientWidth)`, clamp to `[0, 1]`
   - Update state inside `requestAnimationFrame` to avoid jank

3. **Compute compressed widths/offsets**
   - Derive arrays of compressed widths and cumulative offsets from `scrollProgress`
   - Round to 2 decimal places to avoid sub-pixel rendering issues

4. **Replace static sticky classes with inline styles**
   - **Header `<th>` elements:** remove `sticky left-* z-* bg-gray-50` classes; apply `style={{ position: 'sticky', left: offset, zIndex: 30 or 20, backgroundColor: '#f9fafb' }}`
   - **Body `<td>` elements:** remove `sticky left-* z-10 bg-white` classes; apply `style={{ position: 'sticky', left: offset, zIndex: 10, backgroundColor: '#fff' }}`
   - Keep the `w-*` classes on non-frozen columns; frozen columns get `style.width` instead

5. **Update colSpan values**
   - Empty state: `colSpan={20}` → `colSpan={23}` (4 frozen + 19 scrollable)
   - Totals row first cell: already `colSpan={4}`, keep it
   - Chips sub-row: already `colSpan={23}`, keep it

6. **Update the FBT button cell**
   - Add the sticky inline style to the Actions `<td>` as well

### Key constraints

- **No re-render jank:** rAF throttle is mandatory; direct DOM manipulation via ref is an acceptable alternative if React re-renders prove expensive, but start with state + rAF since the table is moderate size.
- **z-index hierarchy:** Emp ID header = 30, other frozen headers = 20, frozen body cells = 10. Corner cell (Emp ID) must have `zIndex: 30` and `left: 0`.
- **Background colors:** every sticky cell must have an explicit `backgroundColor` or content ghosts through.
- **Table container:** must have `overflow-x-auto` and the ref must point to this container, not the `<table>`.

### Validation

- `npm run build` passes
- Scroll the payroll table horizontally: frozen columns visibly compress
- At full scroll right, frozen columns are at their minimum widths
- FBT button remains visible and clickable throughout
- Chips sub-row and totals row alignment remain correct
