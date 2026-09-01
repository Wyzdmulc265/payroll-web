/**
 * Malawi Payroll Calculation Engine
 * Pure TypeScript port of the Excel VBA formulas
 * Used by both API routes and frontend calculations
 */

export interface MalawiTaxBand {
  band: number;
  fromAmount: number;
  toAmount: number;
  ratePercent: number;
  fixedAmount: number;
  cumulativeTax: number;
}

export interface StatutoryConfig {
   // PAYE Tax Bands (MONTHLY bands — applied per pay period, NOT annual).
   // Values effective 2026-01-01.
   taxBands: MalawiTaxBand[];
   
   // Pension Configuration
   pensionEEPercent: number;      // Employee contribution %
   pensionERPercent: number;      // Employer contribution %
   maxPensionableIncome: number;  // Cap for pension calculation
   
   // Other Statutory
   tevetLevyPercent: number;      // TEVET levy (employer) % of gross
   fringeBenefitTaxRate: number;  // Fringe benefit tax rate %
   
   // Leave Entitlements
   leaveDaysPerYear: number;
   sickDaysPerYear: number;
   
   // Payroll Settings
   workingHoursPerDay: number;
   workingDaysPerMonth: number;
   
   // Overtime Configuration
   overtimeNormalRateMultiplier: number;      // Normal day overtime (min 1.5)
   overtimePublicHolidayRateMultiplier: number; // Public holiday overtime (min 2.0)
   overtimeOffDayRateMultiplier: number;      // Off-day overtime (min 2.0)
   
   currency: string;
   decimalPlaces: number;
 }

// Default Malawi Statutory Configuration (effective 2026-01-01)
export const DEFAULT_STATUTORY_CONFIG: StatutoryConfig = {
   taxBands: [
     { band: 1, fromAmount: 0, toAmount: 170000, ratePercent: 0, fixedAmount: 0, cumulativeTax: 0 },
     { band: 2, fromAmount: 170001, toAmount: 1570000, ratePercent: 30, fixedAmount: 0, cumulativeTax: 0 },
     { band: 3, fromAmount: 1570001, toAmount: 10000000, ratePercent: 35, fixedAmount: 0, cumulativeTax: 420000 },
     { band: 4, fromAmount: 10000001, toAmount: Number.MAX_SAFE_INTEGER, ratePercent: 40, fixedAmount: 0, cumulativeTax: 3370500 },
   ],
   pensionEEPercent: 5,
   pensionERPercent: 10,
   maxPensionableIncome: 1000000,
   tevetLevyPercent: 1,
   fringeBenefitTaxRate: 30,
   leaveDaysPerYear: 24,
   sickDaysPerYear: 14,
   workingHoursPerDay: 8,
   workingDaysPerMonth: 22,
   overtimeNormalRateMultiplier: 1.5,
   overtimePublicHolidayRateMultiplier: 2.0,
   overtimeOffDayRateMultiplier: 2.0,
   currency: 'MWK',
   decimalPlaces: 2,
 };
/**
 * Select the settings that are effective as of `asOf`: for each key, take the
 * row with the highest `effectiveFrom` that is <= asOf. Keys whose rows are
 * all in the future are omitted (callers fall back to statutory defaults).
 * Rows without a date are treated as effective since the epoch (always apply).
 */
export interface DatedSettingRow {
  key: string;
  value: string;
  effectiveFrom?: Date | string | null;
}

export function selectEffectiveSettings<T extends DatedSettingRow>(
  rows: T[],
  asOf: Date = new Date()
): Record<string, string> {
  const asOfTime = asOf.getTime();
  const latest = new Map<string, { value: string; time: number }>();

  for (const row of rows) {
    const raw = row.effectiveFrom;
    const time = raw ? new Date(raw).getTime() : Number.NEGATIVE_INFINITY;
    if (time > asOfTime) continue; // not yet effective

    const existing = latest.get(row.key);
    if (!existing || time >= existing.time) {
      latest.set(row.key, { value: row.value, time });
    }
  }

  return Object.fromEntries([...latest].map(([key, { value }]) => [key, value]));
}

/**
 * Count Mon–Fri working days in a given calendar month (1-based month).
 * Used to make overtime rates period-aware instead of the fixed
 * `workingDaysPerMonth` constant.
 */
export function getWorkingDaysInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate(); // last day of month
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++; // skip Sun(0) and Sat(6)
  }
  return count;
}

/**
  * Build a StatutoryConfig from a settings key/value map (as stored in the
  * `Settings` table). Any missing or unparseable key falls back to `base`
  * (which defaults to DEFAULT_STATUTORY_CONFIG), so payroll always has a valid
  * configuration even if the DB rows are absent.
  *
  * Supported keys (see prisma/schema.prisma + prisma/seed.ts):
  *   statutory.paye_band_{1..N}_{from,to,rate}
  *   statutory.pension_ee_rate, statutory.pension_er_rate
  *   statutory.max_pensionable_income
  *   statutory.tevet_levy_rate, statutory.fringe_benefit_tax_rate
  *   statutory.overtime_normal_rate_multiplier, statutory.overtime_public_holiday_rate_multiplier, statutory.overtime_off_day_rate_multiplier
  *   working_hours_per_day, working_days_per_month, currency, decimal_places
  */
export function buildStatutoryConfigFromSettings(
  settingsMap: Record<string, string>,
  base: StatutoryConfig = DEFAULT_STATUTORY_CONFIG
): StatutoryConfig {
  const num = (key: string, fallback: number): number => {
    const raw = settingsMap[key];
    const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Determine band count dynamically: scan settingsMap for the highest PAYE
  // band index present. If none found, fall back to the base config count.
  let bandCount = base.taxBands.length;
  for (const key of Object.keys(settingsMap)) {
    const m = key.match(/^statutory\.paye_band_(\d+)_(from|to|rate)$/);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (idx > bandCount) bandCount = idx;
    }
  }

  const baseBand = (i: number): MalawiTaxBand =>
    base.taxBands[i - 1] ?? {
      band: i,
      fromAmount: Number.MAX_SAFE_INTEGER,
      toAmount: Number.MAX_SAFE_INTEGER,
      ratePercent: 0,
      fixedAmount: 0,
      cumulativeTax: 0,
    };

  // Rebuild PAYE bands from settings (falling back to base bands).
  const bands: MalawiTaxBand[] = [];
  for (let i = 1; i <= bandCount; i++) {
    bands.push({
      band: i,
      fromAmount: num(`statutory.paye_band_${i}_from`, baseBand(i).fromAmount),
      toAmount: num(`statutory.paye_band_${i}_to`, baseBand(i).toAmount),
      ratePercent: num(`statutory.paye_band_${i}_rate`, baseBand(i).ratePercent),
      fixedAmount: baseBand(i).fixedAmount,
      cumulativeTax: 0,
    });
  }

  // Derive each band's cumulative tax — the tax owed on all income up to the
  // band's start. cumTax(n) = cumTax(n-1) + rate(n-1) * (size of band n-1).
  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1];
    bands[i].cumulativeTax = Math.round(
      bands[i - 1].cumulativeTax + (prev.ratePercent / 100) * (prev.toAmount - prev.fromAmount + 1)
    );
  }

return {
     taxBands: bands,
     pensionEEPercent: num('statutory.pension_ee_rate', base.pensionEEPercent),
     pensionERPercent: num('statutory.pension_er_rate', base.pensionERPercent),
     maxPensionableIncome: num('statutory.max_pensionable_income', base.maxPensionableIncome),
     tevetLevyPercent: num('statutory.tevet_levy_rate', base.tevetLevyPercent),
     fringeBenefitTaxRate: num('statutory.fringe_benefit_tax_rate', base.fringeBenefitTaxRate),
     leaveDaysPerYear: base.leaveDaysPerYear,
     sickDaysPerYear: base.sickDaysPerYear,
     workingHoursPerDay: num('working_hours_per_day', base.workingHoursPerDay),
     workingDaysPerMonth: num('working_days_per_month', base.workingDaysPerMonth),
     overtimeNormalRateMultiplier: num('statutory.overtime_normal_rate_multiplier', base.overtimeNormalRateMultiplier),
     overtimePublicHolidayRateMultiplier: num('statutory.overtime_public_holiday_rate_multiplier', base.overtimePublicHolidayRateMultiplier),
     overtimeOffDayRateMultiplier: num('statutory.overtime_off_day_rate_multiplier', base.overtimeOffDayRateMultiplier),
     currency: settingsMap['currency'] || base.currency,
     decimalPlaces: num('decimal_places', base.decimalPlaces),
   };
}

/**
 * Calculate PAYE (Pay As You Earn) tax for Malawi
 * Progressive tax bands as per 2026 tax year
 */
export function calculatePAYE(grossIncome: number, config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG): number {
  const taxable = grossIncome;
  
  // Find applicable tax band
  const band = config.taxBands.find(b => taxable >= b.fromAmount && taxable <= b.toAmount);
  if (!band) return 0;
  
  if (band.ratePercent === 0) return 0;
  
  // Tax = cumulative tax from previous band + rate% on excess over band threshold.
  // band.fromAmount is the first taxable income in this band (e.g. 170001),
  // so the threshold that is tax-free is band.fromAmount - 1 (e.g. 170000).
  // The portion of income taxed at this rate is therefore taxable - (band.fromAmount - 1).
  const excessOverThreshold = taxable - (band.fromAmount - 1);
  const taxOnExcess = (excessOverThreshold * band.ratePercent) / 100;
  
  return Math.round(band.cumulativeTax + taxOnExcess);
}

/**
 * Calculate Employee Pension Contribution (5% of gross, capped)
 */
export function calculatePensionEE(
  grossIncome: number, 
  config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG
): number {
  const pensionableIncome = Math.min(grossIncome, config.maxPensionableIncome);
  return Math.round(pensionableIncome * (config.pensionEEPercent / 100));
}

/**
 * Calculate Employer Pension Contribution (10% of gross, capped)
 */
export function calculatePensionER(
  grossIncome: number, 
  config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG
): number {
  const pensionableIncome = Math.min(grossIncome, config.maxPensionableIncome);
  return Math.round(pensionableIncome * (config.pensionERPercent / 100));
}

/**
 * Calculate TEVET Levy (1% of gross, employer only)
 */
export function calculateTEVETLevy(
  grossIncome: number, 
  config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG
): number {
  return Math.round(grossIncome * (config.tevetLevyPercent / 100));
}

/**
  * Calculate Overtime Pay
  * Formula: (normalHours * normalRate + holidayHours * holidayRate + offDayHours * offDayRate) * 
  *          (basicSalary / workingDaysPerMonth / workingHoursPerDay)
  */
export function calculateOvertimePay(
   normalHours: number,
   publicHolidayHours: number,
   offDayHours: number,
   basicSalary: number,
   config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG,
   workingDaysInPeriod?: number
): number {
   if (normalHours <= 0 && publicHolidayHours <= 0 && offDayHours <= 0) return 0;
   
   // Prefer the actual Mon-Fri day count of the pay period when provided;
   // fall back to the configured constant otherwise.
   const days = workingDaysInPeriod && workingDaysInPeriod > 0 ? workingDaysInPeriod : config.workingDaysPerMonth;
   const hourlyRate = basicSalary / days / config.workingHoursPerDay;
   
   const normalPay = normalHours * config.overtimeNormalRateMultiplier * hourlyRate;
   const holidayPay = publicHolidayHours * config.overtimePublicHolidayRateMultiplier * hourlyRate;
   const offDayPay = offDayHours * config.overtimeOffDayRateMultiplier * hourlyRate;
   
   return Math.round(normalPay + holidayPay + offDayPay);
 }

/**
 * Calculate Gross Earnings
 * Basic + Allowances + Overtime + Bonuses + Other Earnings
 */
export function calculateGrossEarnings(
  basicSalary: number,
  allowances: number,
  overtimePay: number,
  bonuses: number,
  otherEarnings: number
): number {
  return basicSalary + allowances + overtimePay + bonuses + otherEarnings;
}

/**
 * Calculate Total Deductions
 * PAYE + Pension (Employee) + Other Deductions
 */
export function calculateTotalDeductions(
  paye: number,
  pensionEE: number,
  otherDeductions: number
): number {
  return paye + pensionEE + otherDeductions;
}

/**
 * Calculate Net Pay
 * Gross Earnings - Total Deductions
 */
export function calculateNetPay(
  grossEarnings: number,
  totalDeductions: number
): number {
  return grossEarnings - totalDeductions;
}

/**
 * Calculate Employer Cost
 * Gross Earnings + Pension (Employer) + TEVET Levy
 */
export function calculateEmployerCost(
  grossEarnings: number,
  pensionER: number,
  tevetLevy: number
): number {
  return grossEarnings + pensionER + tevetLevy;
}

/**
  * Complete payroll calculation for a single employee
  */
export interface PayrollInput {
   basicSalary: number;
   allowances: number;
   normalOvertimeHours: number;        // Replaces overtimeHours
   publicHolidayOvertimeHours: number; // New
   offDayOvertimeHours: number;        // New
   bonuses: number;
   otherEarnings: number;
   otherDeductions: number;
   /** Actual Mon-Fri day count of the pay period; enables period-aware overtime rates. */
   workingDaysInPeriod?: number;
 }

export interface PayrollResult {
   basicSalary: number;
   allowances: number;
   normalOvertimeHours: number;
   publicHolidayOvertimeHours: number;
   offDayOvertimeHours: number;
   overtimePay: number;
   bonuses: number;
   otherEarnings: number;
   grossEarnings: number;
   paye: number;
   pensionEE: number;
   pensionER: number;
   tevetLevy: number;
   otherDeductions: number;
   totalDeductions: number;
   netPay: number;
   employerCost: number;
 }

export function calculatePayroll(
   input: PayrollInput,
   config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG
): PayrollResult {
   // Calculate overtime pay
   const overtimePay = calculateOvertimePay(
     input.normalOvertimeHours,
     input.publicHolidayOvertimeHours,
     input.offDayOvertimeHours,
     input.basicSalary,
      config,
      input.workingDaysInPeriod
   );
   
   // Calculate gross earnings
   const grossEarnings = calculateGrossEarnings(
     input.basicSalary,
     input.allowances,
     overtimePay,
     input.bonuses,
     input.otherEarnings
   );
   
   // Calculate statutory deductions
   const paye = calculatePAYE(grossEarnings, config);
   const pensionEE = calculatePensionEE(grossEarnings, config);
   const pensionER = calculatePensionER(grossEarnings, config);
   const tevetLevy = calculateTEVETLevy(grossEarnings, config);
   
   // Calculate totals
   const totalDeductions = calculateTotalDeductions(paye, pensionEE, input.otherDeductions);
   const netPay = calculateNetPay(grossEarnings, totalDeductions);
   const employerCost = calculateEmployerCost(grossEarnings, pensionER, tevetLevy);
   
   return {
     basicSalary: input.basicSalary,
     allowances: input.allowances,
     normalOvertimeHours: input.normalOvertimeHours,
     publicHolidayOvertimeHours: input.publicHolidayOvertimeHours,
     offDayOvertimeHours: input.offDayOvertimeHours,
     overtimePay,
     bonuses: input.bonuses,
     otherEarnings: input.otherEarnings,
     grossEarnings,
     paye,
     pensionEE,
     pensionER,
     tevetLevy,
     otherDeductions: input.otherDeductions,
     totalDeductions,
     netPay,
     employerCost,
   };
 }

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'MWK', decimals: number = 2): string {
  return new Intl.NumberFormat('en-MW', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Round to specified decimal places
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
  * Validate payroll input
  */
export function validatePayrollInput(input: PayrollInput): string[] {
   const errors: string[] = [];
   
   if (input.basicSalary <= 0) {
     errors.push('Basic salary must be greater than zero');
   }
   
   if (input.allowances < 0) {
     errors.push('Allowances cannot be negative');
   }
   
   if (input.normalOvertimeHours < 0) {
     errors.push('Normal overtime hours cannot be negative');
   }
   
   if (input.publicHolidayOvertimeHours < 0) {
     errors.push('Public holiday overtime hours cannot be negative');
   }
   
   if (input.offDayOvertimeHours < 0) {
     errors.push('Off-day overtime hours cannot be negative');
   }
   
   if (input.bonuses < 0) {
     errors.push('Bonuses cannot be negative');
   }
   
   if (input.otherEarnings < 0) {
     errors.push('Other earnings cannot be negative');
   }
   
   if (input.otherDeductions < 0) {
     errors.push('Other deductions cannot be negative');
   }
   
   return errors;
 }
