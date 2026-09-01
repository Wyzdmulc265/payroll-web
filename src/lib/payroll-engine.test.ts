import { describe, it, expect } from 'vitest';
import {
  calculatePAYE,
  calculatePensionEE,
  calculatePensionER,
  calculateTEVETLevy,
  calculateOvertimePay,
  calculatePayroll,
  buildStatutoryConfigFromSettings,
  DEFAULT_STATUTORY_CONFIG,
  selectEffectiveSettings,
} from './payroll-engine';

describe('calculatePAYE (Malawi 2026 bands)', () => {
  it('is 0 at and below the first band threshold', () => {
    expect(calculatePAYE(0)).toBe(0);
    expect(calculatePAYE(100000)).toBe(0);
    expect(calculatePAYE(170000)).toBe(0);
  });

  it('starts taxing from the first MWK above the tax-free threshold', () => {
    expect(calculatePAYE(170001)).toBe(0);
    expect(calculatePAYE(200000)).toBe(9000);
  });

  it('matches each band boundary', () => {
    expect(calculatePAYE(1570000)).toBe(420000);
    expect(calculatePAYE(1570001)).toBe(420000);
    expect(calculatePAYE(10000000)).toBe(3370500);
  });

  it('applies the top 40% band above 10M', () => {
    expect(calculatePAYE(10000001)).toBe(3370500);
    expect(calculatePAYE(20000000)).toBe(7370500);
  });

  it('handles a mid-band value correctly', () => {
    expect(calculatePAYE(5000000)).toBe(1620500);
  });
});

describe('calculatePensionEE / calculatePensionER', () => {
  it('applies 5% employee / 10% employer', () => {
    expect(calculatePensionEE(80000)).toBe(4000);
    expect(calculatePensionER(80000)).toBe(8000);
  });

  it('caps pensionable income at MWK 1,000,000', () => {
    expect(calculatePensionEE(1000000)).toBe(50000);
    expect(calculatePensionEE(2000000)).toBe(50000);
    expect(calculatePensionER(2000000)).toBe(100000);
  });
});

describe('calculateTEVETLevy', () => {
  it('is 1% of gross', () => {
    expect(calculateTEVETLevy(1000000)).toBe(10000);
    expect(calculateTEVETLevy(0)).toBe(0);
  });
});

describe('calculateOvertimePay', () => {
   it('returns 0 for no overtime hours', () => {
     expect(calculateOvertimePay(0, 0, 0, 800000, DEFAULT_STATUTORY_CONFIG)).toBe(0);
   });

   it('uses basic / working days / working hours formula for normal overtime', () => {
     expect(calculateOvertimePay(10, 0, 0, 800000, DEFAULT_STATUTORY_CONFIG)).toBe(68182);
   });

   it('calculates public holiday overtime correctly', () => {
     expect(calculateOvertimePay(0, 10, 0, 800000, DEFAULT_STATUTORY_CONFIG)).toBe(90909);
   });

   it('calculates off-day overtime correctly', () => {
     expect(calculateOvertimePay(0, 0, 10, 800000, DEFAULT_STATUTORY_CONFIG)).toBe(90909);
   });

   it('calculates combined overtime correctly', () => {
     expect(calculateOvertimePay(5, 3, 2, 800000, DEFAULT_STATUTORY_CONFIG)).toBe(79545);
   });
 });

describe('calculatePayroll', () => {
   it('matches the updated high-earner example with 2026 bands', () => {
     const result = calculatePayroll(
       {
         basicSalary: 800000,
         allowances: 150000,
         normalOvertimeHours: 10,
         publicHolidayOvertimeHours: 0,
         offDayOvertimeHours: 0,
         bonuses: 50000,
         otherEarnings: 0,
         otherDeductions: 0,
       },
       DEFAULT_STATUTORY_CONFIG
     );

     expect(result.grossEarnings).toBe(1068182);
     expect(result.paye).toBe(269455)  // 898182 * 0.30 = 269454.6 -> 269455;
     expect(result.pensionEE).toBe(50000);
     expect(result.pensionER).toBe(100000);
     expect(result.tevetLevy).toBe(10682);
     expect(result.totalDeductions).toBe(319455);
     expect(result.netPay).toBe(748727);
     expect(result.employerCost).toBe(1178864);
   });
 });

describe('selectEffectiveSettings', () => {
   it('returns rows effective as of the given date', () => {
     const rows = [
       { key: 'rate', value: '10', effectiveFrom: new Date('2025-01-01') },
       { key: 'rate', value: '20', effectiveFrom: new Date('2026-06-01') },
       { key: 'rate', value: '30', effectiveFrom: new Date('2027-01-01') },
     ];
     expect(selectEffectiveSettings(rows, new Date('2026-03-01'))).toEqual({ rate: '10' });
     expect(selectEffectiveSettings(rows, new Date('2026-12-31'))).toEqual({ rate: '20' });
     expect(selectEffectiveSettings(rows, new Date('2027-06-01'))).toEqual({ rate: '30' });
   });

   it('keeps undated rows and excludes future-only keys', () => {
     const rows = [
       { key: 'undated', value: 'ok', effectiveFrom: null },
       { key: 'future', value: 'no', effectiveFrom: new Date('2999-01-01') },
     ];
     expect(selectEffectiveSettings(rows, new Date('2026-01-01'))).toEqual({ undated: 'ok' });
   });
 });

describe('calculateOvertimePay period-aware working days', () => {
   it('uses workingDaysInPeriod when provided (rate scales with day count)', () => {
     const base = calculateOvertimePay(10, 0, 0, 800000, DEFAULT_STATUTORY_CONFIG); // 22 days
     const fewer = calculateOvertimePay(10, 0, 0, 800000, DEFAULT_STATUTORY_CONFIG, 20);
     expect(fewer).toBe(Math.round(base * 22 / 20));
   });

   it('falls back to config.workingDaysPerMonth when not provided', () => {
     expect(calculateOvertimePay(10, 0, 0, 800000, DEFAULT_STATUTORY_CONFIG, undefined)).toBe(68182);
   });
 });

describe('buildStatutoryConfigFromSettings', () => {
   it('falls back to defaults for an empty (or missing) settings map', () => {
     const cfg = buildStatutoryConfigFromSettings({});
     expect(cfg.taxBands).toEqual(DEFAULT_STATUTORY_CONFIG.taxBands);
     expect(cfg.pensionEEPercent).toBe(DEFAULT_STATUTORY_CONFIG.pensionEEPercent);
     expect(cfg.workingDaysPerMonth).toBe(DEFAULT_STATUTORY_CONFIG.workingDaysPerMonth);
     expect(cfg.overtimeNormalRateMultiplier).toBe(DEFAULT_STATUTORY_CONFIG.overtimeNormalRateMultiplier);
     expect(cfg.overtimePublicHolidayRateMultiplier).toBe(DEFAULT_STATUTORY_CONFIG.overtimePublicHolidayRateMultiplier);
     expect(cfg.overtimeOffDayRateMultiplier).toBe(DEFAULT_STATUTORY_CONFIG.overtimeOffDayRateMultiplier);
   });

   it('has 4 PAYE bands by default', () => {
     const cfg = buildStatutoryConfigFromSettings({});
     expect(cfg.taxBands).toHaveLength(4);
     expect(cfg.taxBands[0].ratePercent).toBe(0);
     expect(cfg.taxBands[0].fromAmount).toBe(0);
     expect(cfg.taxBands[0].toAmount).toBe(170000);
     expect(cfg.taxBands[3].ratePercent).toBe(40);
     expect(cfg.taxBands[3].fromAmount).toBe(10000001);
   });

   it('overrides statutory/payroll settings and derives cumulative tax', () => {
     const cfg = buildStatutoryConfigFromSettings({
       'statutory.pension_ee_rate': '7',
       'statutory.pension_er_rate': '12',
       'statutory.max_pensionable_income': '2000000',
       'statutory.tevet_levy_rate': '1.5',
       'statutory.overtime_normal_rate_multiplier': '2',
       'statutory.overtime_public_holiday_rate_multiplier': '3',
       'statutory.overtime_off_day_rate_multiplier': '3',
       'working_days_per_month': '20',
       'decimal_places': '0',
       currency: 'USD',
     });

     expect(cfg.pensionEEPercent).toBe(7);
     expect(cfg.pensionERPercent).toBe(12);
     expect(cfg.maxPensionableIncome).toBe(2000000);
     expect(cfg.tevetLevyPercent).toBe(1.5);
     expect(cfg.overtimeNormalRateMultiplier).toBe(2);
     expect(cfg.overtimePublicHolidayRateMultiplier).toBe(3);
     expect(cfg.overtimeOffDayRateMultiplier).toBe(3);
     expect(cfg.workingDaysPerMonth).toBe(20);
     expect(cfg.decimalPlaces).toBe(0);
     expect(cfg.currency).toBe('USD');

     expect(cfg.taxBands).toHaveLength(4);
     expect(cfg.taxBands[2].cumulativeTax).toBe(420000);
     expect(cfg.taxBands[3].cumulativeTax).toBe(3370500);
   });

   it('lets custom tax-band boundaries change PAYE', () => {
     const cfg = buildStatutoryConfigFromSettings({
       'statutory.paye_band_1_to': '150000',
       'statutory.paye_band_2_from': '150001',
       'statutory.paye_band_2_to': '250000',
       'statutory.paye_band_3_from': '250001',
       'statutory.paye_band_2_rate': '15',
     });

     // Band 2 now spans 150001–250000 at 15% → PAYE(200000) = 15% of 49,999 ≈ 7500
     expect(calculatePAYE(200000, cfg)).toBe(7500);
   });
 });
