import { describe, it, expect } from 'vitest';
import {
  calculateEmployerFBT,
  calculateBenefitValue,
  summarizeFBTResult,
  FringeBenefitType,
  BenefitPaymentMethod,
  TaxRuleNotFoundError,
} from './fbt-engine';

function d(iso: string): Date {
  return new Date(iso);
}

describe('calculateBenefitValue', () => {
  describe('classification', () => {
    it('classifies cash-to-employee school fees as EXCLUDED', () => {
      const input = {
        type: FringeBenefitType.SCHOOL_FEES,
        paymentMethod: BenefitPaymentMethod.CASH_TO_EMPLOYEE,
        amount: 4_000_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.classification).toBe('EXCLUDED');
      expect(result.selectedTaxableValue).toBe(0);
      expect(result.classificationReason).toContain('excluded');
    });

    it('classifies school fees advance as EXCLUDED', () => {
      const input = {
        type: FringeBenefitType.SCHOOL_FEES,
        paymentMethod: BenefitPaymentMethod.ADVANCE,
        amount: 4_000_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.classification).toBe('EXCLUDED');
      expect(result.selectedTaxableValue).toBe(0);
    });

    it('classifies direct school fees as FBT', () => {
      const input = {
        type: FringeBenefitType.SCHOOL_FEES,
        paymentMethod: BenefitPaymentMethod.DIRECT_TO_INSTITUTION,
        amount: 4_000_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.classification).toBe('FBT');
    });
  });

  describe('motor vehicle', () => {
    it('computes 15% of original cost', () => {
      const input = {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 30_000_000,
        originalCost: 30_000_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(4_500_000);
      expect(result.ruleUsed).toBe('MOTOR_VEHICLE_15PCT');
    });

    it('returns 0 when originalCost is missing', () => {
      const input = {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 30_000_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(0);
    });
  });

  describe('housing', () => {
    it('unfurnished employer-owned: 10% of salary', () => {
      const input = {
        type: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
        amount: 800_000,
        ownershipType: 'EMPLOYER_OWNED' as const,
        furnished: false,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(80_000);
      expect(result.ruleUsed).toBe('HOUSING_EMPLOYER_OWNED_UNFURNISHED');
    });

    it('furnished employer-owned: 12% of salary', () => {
      const input = {
        type: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
        amount: 800_000,
        ownershipType: 'EMPLOYER_OWNED' as const,
        furnished: true,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(96_000);
      expect(result.ruleUsed).toBe('HOUSING_EMPLOYER_OWNED_FURNISHED');
    });

    it('rented: capped at open market value', () => {
      const input = {
        type: FringeBenefitType.HOUSING_RENTED,
        amount: 500_000,
        ownershipType: 'RENTED' as const,
        employerRentalCost: 300_000,
        openMarketRentalValue: 250_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(250_000);
      expect(result.candidateValues['Capped (min of above)']).toBe(250_000);
    });

    it('employee contribution reduces taxable value (not below 0)', () => {
      const input = {
        type: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
        amount: 800_000,
        ownershipType: 'EMPLOYER_OWNED' as const,
        furnished: false,
        employeeContribution: 30_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(50_000);
      expect(result.reductionApplied).toBe(50_000);
    });
  });

  describe('airtime/data', () => {
    it('applies 50% after 2024-04-01', () => {
      const input = {
        type: FringeBenefitType.AIRTIME_DATA,
        amount: 1_000_000,
        effectiveFrom: d('2024-04-02'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(500_000);
      expect(result.ruleUsed).toBe('AIRTIME_DATA_50PCT_POST_2024');
    });

    it('applies 100% before 2024-04-01', () => {
      const input = {
        type: FringeBenefitType.AIRTIME_DATA,
        amount: 1_000_000,
        effectiveFrom: d('2024-03-31'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(1_000_000);
      expect(result.ruleUsed).toBe('AIRTIME_DATA_100PCT_PRE_2024');
    });
  });

  describe('concessionary loan', () => {
    it('computes principal × (benchmark - employer) × periodFraction', () => {
      const input = {
        type: FringeBenefitType.CONCESSIONARY_LOAN,
        amount: 10_000_000,
        principalAmount: 10_000_000,
        benchmarkInterestRate: 15,
        employerInterestRate: 5,
        effectiveFrom: d('2026-01-01'),
        effectiveTo: d('2026-12-31'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBeCloseTo(997_000, 0);
    });
  });

  describe('default benefit', () => {
    it('uses employerCost for OTHER_BENEFIT', () => {
      const input = {
        type: FringeBenefitType.OTHER_BENEFIT,
        amount: 200_000,
        effectiveFrom: d('2026-08-01'),
      };
      const result = calculateBenefitValue(input);
      expect(result.selectedTaxableValue).toBe(200_000);
    });
  });
});

describe('calculateEmployerFBT', () => {
  it('aggregates multiple benefits correctly', () => {
    const benefits = [
      {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 30_000_000,
        originalCost: 30_000_000,
        effectiveFrom: d('2026-08-01'),
      },
      {
        type: FringeBenefitType.SCHOOL_FEES,
        paymentMethod: BenefitPaymentMethod.DIRECT_TO_INSTITUTION,
        amount: 4_000_000,
        effectiveFrom: d('2026-08-01'),
      },
    ];
    const result = calculateEmployerFBT(benefits, 30, 'EMP001', '2026-08');
    expect(result.totalTaxableValue).toBe(6_500_000);
    expect(result.fringeBenefitsTax).toBe(1_950_000);
    expect(result.fbtRate).toBe(30);
    expect(result.benefits).toHaveLength(2);
  });

  it('FBT never reduces employee net pay (employer-side liability)', () => {
    const benefits = [
      {
        type: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
        amount: 800_000,
        ownershipType: 'EMPLOYER_OWNED' as const,
        furnished: false,
        effectiveFrom: d('2026-08-01'),
      },
    ];
    const result = calculateEmployerFBT(benefits, 30);
    expect(result.fringeBenefitsTax).toBeGreaterThanOrEqual(0);
    expect(result.liabilityType).toBe('EMPLOYER');
  });

  it('cash benefits classified for PAYE are not subjected to FBT', () => {
    const benefits = [
      {
        type: FringeBenefitType.SCHOOL_FEES,
        paymentMethod: BenefitPaymentMethod.CASH_TO_EMPLOYEE,
        amount: 4_000_000,
        effectiveFrom: d('2026-08-01'),
      },
    ];
    const result = calculateEmployerFBT(benefits, 30);
    expect(result.totalTaxableValue).toBe(0);
    expect(result.fringeBenefitsTax).toBe(0);
    expect(result.benefits[0].classification).toBe('EXCLUDED');
  });

  it('uses default rate 30 when not specified', () => {
    const result = calculateEmployerFBT(
      [
        {
          type: FringeBenefitType.AIRTIME_DATA,
          amount: 1_000_000,
          effectiveFrom: d('2024-04-02'),
        },
      ],
      30
    );
    expect(result.fringeBenefitsTax).toBe(150_000);
  });
});

describe('summarizeFBTResult', () => {
  it('groups taxable values by benefit type', () => {
    const result = calculateEmployerFBT(
      [
        {
          type: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
          amount: 800_000,
          ownershipType: 'EMPLOYER_OWNED' as const,
          furnished: false,
          effectiveFrom: d('2026-08-01'),
        },
        {
          type: FringeBenefitType.MOTOR_VEHICLE,
          amount: 30_000_000,
          originalCost: 30_000_000,
          effectiveFrom: d('2026-08-01'),
        },
      ],
      30
    );
    const summary = summarizeFBTResult(result);
    expect(summary['HOUSING_EMPLOYER_OWNED']).toBe(80_000);
    expect(summary['MOTOR_VEHICLE']).toBe(4_500_000);
  });
});
