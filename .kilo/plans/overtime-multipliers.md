# Plan: Overtime Multiplier Configuration

## Goal

Add support for configuring three different overtime rate multipliers in Malawi:
1. Normal day overtime (minimum 1.5×)
2. Public holiday overtime (minimum 2.0×) 
3. Off-day overtime (minimum 2.0×)

## Current State Analysis

Current implementation in `src/lib/payroll-engine.ts`:
- `StatutoryConfig` has single `overtimeRateMultiplier: number` (default: 1.5)
- `PayrollInput` has `overtimeHours: number` and `overtimeRate: number`
- `calculateOvertimePay(overtimeHours, overtimeRate, basicSalary, config)` uses single rate
- Settings UI has single "Overtime Rate Multiplier" field (key: `overtime_rate_multiplier`)

## Changes Required

### 1. Payroll Engine (`src/lib/payroll-engine.ts`)

**Update StatutoryConfig interface:**
```typescript
export interface StatutoryConfig {
  // ... existing fields ...
  
  // Overtime Configuration
  overtimeNormalRateMultiplier: number;      // Normal day overtime (min 1.5)
  overtimePublicHolidayRateMultiplier: number; // Public holiday overtime (min 2.0)
  overtimeOffDayRateMultiplier: number;      // Off-day overtime (min 2.0)
}
```

**Update DEFAULT_STATUTORY_CONFIG:**
```typescript
export const DEFAULT_STATUTORY_CONFIG: StatutoryConfig = {
  // ... existing fields ...
  overtimeNormalRateMultiplier: 1.5,
  overtimePublicHolidayRateMultiplier: 2.0,
  overtimeOffDayRateMultiplier: 2.0,
};
```

**Update buildStatutoryConfigFromSettings:**
Add to the return object:
```typescript
overtimeNormalRateMultiplier: num('statutory.overtime_normal_rate_multiplier', base.overtimeNormalRateMultiplier),
overtimePublicHolidayRateMultiplier: num('statutory.overtime_public_holiday_rate_multiplier', base.overtimePublicHolidayRateMultiplier),
overtimeOffDayRateMultiplier: num('statutory.overtime_off_day_rate_multiplier', base.overtimeOffDayRateMultiplier),
```

Add to JSDoc supported keys:
```
  *   statutory.overtime_normal_rate_multiplier
  *   statutory.overtime_public_holiday_rate_multiplier
  *   statutory.overtime_off_day_rate_multiplier
```

**Update PayrollInput interface:**
```typescript
export interface PayrollInput {
  basicSalary: number;
  allowances: number;
  normalOvertimeHours: number;        // Replaces overtimeHours
  publicHolidayOvertimeHours: number; // New
  offDayOvertimeHours: number;        // New
  bonuses: number;
  otherEarnings: number;
  otherDeductions: number;
}
```

**Update calculateOvertimePay function:**
```typescript
export function calculateOvertimePay(
  normalHours: number,
  publicHolidayHours: number,
  offDayHours: number,
  basicSalary: number,
  config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG
): number {
  if (normalHours <= 0 && publicHolidayHours <= 0 && offDayHours <= 0) return 0;
  
  const hourlyRate = basicSalary / config.workingDaysPerMonth / config.workingHoursPerDay;
  
  const normalPay = normalHours * config.overtimeNormalRateMultiplier * hourlyRate;
  const holidayPay = publicHolidayHours * config.overtimePublicHolidayRateMultiplier * hourlyRate;
  const offDayPay = offDayHours * config.overtimeOffDayRateMultiplier * hourlyRate;
  
  return Math.round(normalPay + holidayPay + offDayPay);
}
```

**Update calculatePayroll function:**
- Extract the three overtime hour values from input
- Call `calculateOvertimePay` with the three parameters instead of two

**Update validatePayrollInput:**
- Add validation for the three new overtime hour fields (>= 0)
- Remove validation for old overtimeHours and overtimeRate

### 2. Settings UI (`src/app/settings/page.tsx`)

**Update PAYROLL_FIELDS:**
Replace the single overtime field with three fields:
```typescript
{ key: 'overtime_normal_rate_multiplier', label: 'Normal Day Overtime Rate', type: 'number', helper: 'e.g. 1.5 means 1.5× normal hourly pay (minimum 1.5)', min: 1.5, step: 0.1 },
{ key: 'overtime_public_holiday_rate_multiplier', label: 'Public Holiday Overtime Rate', type: 'number', helper: 'e.g. 2.0 means 2.0× normal hourly pay (minimum 2.0)', min: 2.0, step: 0.1 },
{ key: 'overtime_off_day_rate_multiplier', label: 'Off-Day Overtime Rate', type: 'number', helper: 'e.g. 2.0 means 2.0× normal hourly pay (minimum 2.0)', min: 2.0, step: 0.1 },
```

**Update form synchronization logic:**
- Add handling for the three new fields in the useEffect that syncs from settings
- Add handling in the saveToApi call in renderPayrollForm

### 3. Database Seed (`prisma/seed.ts`)

Add the three new overtime multiplier settings to the PAYROLL section:
```typescript
{ key: 'overtime_normal_rate_multiplier', value: '1.5', description: 'Normal day overtime rate multiplier', category: 'PAYROLL', effectiveFrom: new Date('2026-01-01') },
{ key: 'overtime_public_holiday_rate_multiplier', value: '2.0', description: 'Public holiday overtime rate multiplier', category: 'PAYROLL', effectiveFrom: new Date('2026-01-01') },
{ key: 'overtime_off_day_rate_multiplier', value: '2.0', description: 'Off-day overtime rate multiplier', category: 'PAYROLL', effectiveFrom: new Date('2026-01-01') },
```

## Validation

1. All existing tests pass after updates (with appropriate modifications)
2. New tests cover:
   - Individual overtime type calculations
   - Mixed overtime scenarios
   - Settings persistence and retrieval
3. Manual verification:
   - Settings UI shows all three overtime fields with correct labels and constraints
   - Changing values affects payroll calculations correctly
   - Seed data loads correctly in fresh DB
   - Edge cases (zero hours, maximum values) work properly

## Files to Modify

- `src/lib/payroll-engine.ts` - Core logic changes
- `src/lib/payroll-engine.test.ts` - Test updates
- `src/app/settings/page.tsx` - UI changes
- `prisma/seed.ts` - Database seed updates

## API Routes Impact

The API routes that handle payroll calculation (`/api/payroll` and `/api/payroll/calculate`) will need to be updated to match the new `PayrollInput` structure. However, since the user mentioned this is a new app being built, these changes are acceptable as long as all internal call sites are updated consistently.

## Backward Compatibility Note

This change modifies the `PayrollInput` interface and `calculateOvertimePay` signature, which is a breaking change from the previous implementation. Since this is a new app being built (per user context), breaking changes are acceptable as long as all internal call sites are updated consistently.