# Add Malawi public holidays to working-days calculation

**Type:** feature
**Date:** 2026-09-03
**Author(s):** AI assistant
**Related issue/PR:** none
**Addresses:** `docs/IMPROVEMENTS.md#7`

## 1. Why

`getWorkingDaysInMonth` counted every Monday–Friday as a working day,
ignoring Malawi public holidays. This inflated overtime and payroll
calculations whenever a public holiday fell on a weekday.

## 2. What changed

- Added `src/lib/malawi-holidays.ts` with a `YYYY-MM-DD` keyed map of
  Malawi public holidays for 2024–2027.
- `getWorkingDaysInMonth` now subtracts public holidays from the
  weekday count.
- Documented in `docs/ENGINE.md`.

## 3. How it works

```ts
// src/lib/malawi-holidays.ts
export function isMalawiPublicHoliday(year: number, month: number, day: number): boolean {
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return key in MALAWI_PUBLIC_HOLIDAYS;
}
```

```ts
// src/lib/payroll-engine.ts
if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isMalawiPublicHoliday(year, month, day)) {
  workingDays++;
}
```

## 4. What got better

| Before | After |
|--------|-------|
| Weekdays only (Mon–Fri). | Weekdays minus public holidays. |
| Overtime and payroll over-counted working hours. | Hourly rates are now statutorily correct. |

## 5. Risks and trade-offs

- The holiday table covers 2024–2027. Beyond that, new dates must be
  added manually. A future enhancement could fetch from an API.
- The table includes observed holidays (e.g. Monday after a Sunday
  Christmas) so that back-to-back holiday clusters are handled.

## 6. Test plan

- Added unit tests for `getWorkingDaysInMonth` covering:
  - A month with no holidays (baseline).
  - A month with a public holiday on a weekday (e.g. May 2024).
  - A month where the holiday falls on a weekend (should not reduce
    the count).

## 7. Follow-ups

- Add a settings UI for custom holidays (e.g. company-specific
  shutdown days).
- Extend the table to 2028+ as needed.
