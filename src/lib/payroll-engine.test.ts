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
} from './payroll-engine';

describe('calculatePAYE (Malawi 2024/25 bands)', () => {
  it('is 0 at and below the first band threshold', () => {
    expect(calculatePAYE(0)).toBe(0);
    expect(calculatePAYE(100000)).toBe(0);
  });

  it('matches each band boundary', () => {
    expect(calculatePAYE(200000)).toBe(15000);
    expect(calculatePAYE(300000)).toBe(40000);
    expect(calculatePAYE(400000)).toBe(70000);
    expect(calculatePAYE(500000)).toBe(105000);
  });

  it('applies the top 40% band above 500k', () => {
    expect(calculatePAYE(600000)).toBe(145000);
    expect(calculatePAYE(1000000)).toBe(305000); // README "test case 1"
  });
});

describe('calculatePensionEE / calculatePensionER', () => {
  it('applies 5% employee / 10% employer', () => {
    expect(calculatePensionEE(80000)).toBe(4000); // README "test case 2"
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
    expect(calculateOvertimePay(0, 1.5, 800000, DEFAULT_STATUTORY_CONFIG)).toBe(0);
  });

  it('uses basic / working days / working hours formula', () => {
    // 10h * 1.5 * (800000 / 22 / 8) ≈ 68182
    expect(calculateOvertimePay(10, 1.5, 800000, DEFAULT_STATUTORY_CONFIG)).toBe(68182);
  });
});

describe('calculatePayroll', () => {
  it('matches the documented high-earner example', () => {
    const result = calculatePayroll(
      {
        basicSalary: 800000,
        allowances: 150000,
        overtimeHours: 10,
        overtimeRate: 1.5,
        bonuses: 50000,
        otherEarnings: 0,
        otherDeductions: 0,
      },
      DEFAULT_STATUTORY_CONFIG
    );

    expect(result.grossEarnings).toBe(1068182);
    expect(result.paye).toBe(332272);
    expect(result.pensionEE).toBe(50000);
    expect(result.pensionER).toBe(100000);
    expect(result.tevetLevy).toBe(10682);
    expect(result.totalDeductions).toBe(382272);
    expect(result.netPay).toBe(685910);
    expect(result.employerCost).toBe(1178864);
  });
});

describe('buildStatutoryConfigFromSettings', () => {
  it('falls back to defaults for an empty (or missing) settings map', () => {
    const cfg = buildStatutoryConfigFromSettings({});
    expect(cfg.taxBands).toEqual(DEFAULT_STATUTORY_CONFIG.taxBands);
    expect(cfg.pensionEEPercent).toBe(DEFAULT_STATUTORY_CONFIG.pensionEEPercent);
    expect(cfg.workingDaysPerMonth).toBe(DEFAULT_STATUTORY_CONFIG.workingDaysPerMonth);
    expect(cfg.overtimeRateMultiplier).toBe(DEFAULT_STATUTORY_CONFIG.overtimeRateMultiplier);
  });

  it('overrides statutory/payroll settings and derives cumulative tax', () => {
    const cfg = buildStatutoryConfigFromSettings({
      'statutory.pension_ee_rate': '7',
      'statutory.pension_er_rate': '12',
      'statutory.max_pensionable_income': '2000000',
      'statutory.tevet_levy_rate': '1.5',
      'overtime_rate_multiplier': '2',
      'working_days_per_month': '20',
      'decimal_places': '0',
      currency: 'USD',
    });

    expect(cfg.pensionEEPercent).toBe(7);
    expect(cfg.pensionERPercent).toBe(12);
    expect(cfg.maxPensionableIncome).toBe(2000000);
    expect(cfg.tevetLevyPercent).toBe(1.5);
    expect(cfg.overtimeRateMultiplier).toBe(2);
    expect(cfg.workingDaysPerMonth).toBe(20);
    expect(cfg.decimalPlaces).toBe(0);
    expect(cfg.currency).toBe('USD');

    // Bands fall back to defaults and cumulative tax is still derived correctly.
    expect(cfg.taxBands).toHaveLength(6);
    expect(cfg.taxBands[2].cumulativeTax).toBe(15000);
    expect(cfg.taxBands[5].cumulativeTax).toBe(105000);
  });

  it('lets custom tax-band boundaries change PAYE', () => {
    const cfg = buildStatutoryConfigFromSettings({
      'statutory.paye_band_1_to': '150000',
      'statutory.paye_band_2_from': '150001',
      'statutory.paye_band_2_to': '250000',
      'statutory.paye_band_3_from': '250001',
    });

    // Band 2 now spans 150001–250000 at 15% → PAYE(200000) = 15% of 49,999 ≈ 7500
    expect(calculatePAYE(200000, cfg)).toBe(7500);
  });
});