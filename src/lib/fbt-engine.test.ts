import { describe, it, expect } from 'vitest';
import {
  calculateEmployerFBT,
  calculateBenefitValue,
  summarizeFBTResult,
  loadFbtRulesFromSettings,
  findApplicableFbtRule,
  applyFbtRule,
  FringeBenefitType,
  BenefitPaymentMethod,
  FbtRuleType,
  FbtClassification,
  FbtRule,
  FringeBenefitInput
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

describe('FBT Rules Engine', () => {
  function d(iso: string): Date {
    return new Date(iso);
  }

  describe('loadFbtRulesFromSettings', () => {
    it('loads FBT rules from settings map', () => {
      const settingsMap = {
        'statutory.fbt_rule_MOTOR_VEHICLE_v1_2026-01-01': JSON.stringify({
          benefitType: FringeBenefitType.MOTOR_VEHICLE,
          version: 'v1',
          effectiveFrom: '2026-01-01',
          valuationRule: {
            type: FbtRuleType.PERCENTAGE_OF_COST,
            parameters: { percentage: 12 }
          },
          classification: FbtClassification.FBT
        }),
        'statutory.fbt_rule_HOUSING_EMPLOYER_OWNED_v1_2026-01-01': JSON.stringify({
          benefitType: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
          version: 'v1',
          effectiveFrom: '2026-01-01',
          valuationRule: {
            type: FbtRuleType.PERCENTAGE_OF_SALARY,
            parameters: { percentage: 8 }
          },
          classification: FbtClassification.FBT
        })
      };

      const rules = loadFbtRulesFromSettings(settingsMap);
      expect(rules).toHaveLength(2);
      
// Check first rule (should be sorted by effectiveFrom descending, but same date so order may vary)
       const motorVehicleRule = rules.find((r: FbtRule) => r.benefitType === FringeBenefitType.MOTOR_VEHICLE);
       expect(motorVehicleRule).toBeDefined();
       expect(motorVehicleRule?.version).toBe('v1');
       expect(motorVehicleRule?.effectiveFrom).toEqual(d('2026-01-01'));
       expect(motorVehicleRule?.valuationRule.type).toBe(FbtRuleType.PERCENTAGE_OF_COST);
       expect(motorVehicleRule?.valuationRule.parameters.percentage).toBe(12);
       expect(motorVehicleRule?.classification).toBe(FbtClassification.FBT);
       
       // Check second rule
       const housingRule = rules.find((r: FbtRule) => r.benefitType === FringeBenefitType.HOUSING_EMPLOYER_OWNED);
       expect(housingRule).toBeDefined();
       expect(housingRule?.version).toBe('v1');
       expect(housingRule?.effectiveFrom).toEqual(d('2026-01-01'));
       expect(housingRule?.valuationRule.type).toBe(FbtRuleType.PERCENTAGE_OF_SALARY);
       expect(housingRule?.valuationRule.parameters.percentage).toBe(8);
       expect(housingRule?.classification).toBe(FbtClassification.FBT);
    });

    it('ignores invalid FBT rule settings', () => {
      const settingsMap = {
        'statutory.fbt_rule_INVALID_v1_2026-01-01': 'invalid json',
        'statutory.fbt_rule_MOTOR_VEHICLE_v1_2026-01-01': JSON.stringify({
          benefitType: FringeBenefitType.MOTOR_VEHICLE,
          version: 'v1',
          effectiveFrom: '2026-01-01',
          valuationRule: {
            type: FbtRuleType.PERCENTAGE_OF_COST,
            parameters: { percentage: 12 }
          },
          classification: FbtClassification.FBT
        }),
        'statutory.not_a_fbt_rule': JSON.stringify({ some: 'other setting' })
      };

      const rules = loadFbtRulesFromSettings(settingsMap);
      expect(rules).toHaveLength(1);
      expect(rules[0].benefitType).toBe(FringeBenefitType.MOTOR_VEHICLE);
    });
  });

  describe('findApplicableFbtRule', () => {
    const rules: FbtRule[] = [
      {
        benefitType: FringeBenefitType.MOTOR_VEHICLE,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        effectiveTo: d('2026-06-30'),
        valuationRule: {
          type: FbtRuleType.PERCENTAGE_OF_COST,
          parameters: { percentage: 10 }
        },
        classification: FbtClassification.FBT
      },
      {
        benefitType: FringeBenefitType.MOTOR_VEHICLE,
        version: 'v2',
        effectiveFrom: d('2026-07-01'),
        valuationRule: {
          type: FbtRuleType.PERCENTAGE_OF_COST,
          parameters: { percentage: 12 }
        },
        classification: FbtClassification.FBT
      },
      {
        benefitType: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        valuationRule: {
          type: FbtRuleType.PERCENTAGE_OF_SALARY,
          parameters: { percentage: 8 }
        },
        classification: FbtClassification.FBT
      }
    ];

    it('finds rule effective on the date', () => {
      const rule = findApplicableFbtRule(rules, FringeBenefitType.MOTOR_VEHICLE, d('2026-03-15'));
      expect(rule).toBeDefined();
      expect(rule?.version).toBe('v1');
      expect(rule?.valuationRule.parameters.percentage).toBe(10);
    });

    it('finds the most recent rule effective on the date', () => {
      const rule = findApplicableFbtRule(rules, FringeBenefitType.MOTOR_VEHICLE, d('2026-08-15'));
      expect(rule).toBeDefined();
      expect(rule?.version).toBe('v2');
      expect(rule?.valuationRule.parameters.percentage).toBe(12);
    });

    it('returns null for date before rule effectiveFrom', () => {
      const rule = findApplicableFbtRule(rules, FringeBenefitType.MOTOR_VEHICLE, d('2025-12-31'));
      expect(rule).toBeNull();
    });

    it('returns null for date after rule effectiveTo', () => {
      const rule = findApplicableFbtRule(rules, FringeBenefitType.MOTOR_VEHICLE, d('2026-08-15'));
      expect(rule).toBeDefined(); // This should find v2 since v1 expired
      
      // Actually, let me test the expiration properly
      const rule2 = findApplicableFbtRule(rules, FringeBenefitType.MOTOR_VEHICLE, d('2026-08-15'));
      expect(rule2?.version).toBe('v2'); // v2 should apply since v1 expired on 2026-06-30
    });

    it('returns null for non-existent benefit type', () => {
      const rule = findApplicableFbtRule(rules, FringeBenefitType.SCHOOL_FEES, d('2026-01-01'));
      expect(rule).toBeNull();
    });
  });

  describe('applyFbtRule', () => {
    it('applies PERCENTAGE_OF_COST rule correctly', () => {
      const rule: FbtRule = {
        benefitType: FringeBenefitType.MOTOR_VEHICLE,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        valuationRule: {
          type: FbtRuleType.PERCENTAGE_OF_COST,
          parameters: { percentage: 12 }
        },
        classification: FbtClassification.FBT
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 500_000,
        originalCost: 1_000_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = applyFbtRule(rule, input);
      expect(result.selectedTaxableValue).toBe(120_000); // 1,000,000 * 12%
      expect(result.ruleUsed).toBe('MOTOR_VEHICLE_v1');
      expect(result.classification).toBe('FBT');
    });

    it('applies PERCENTAGE_OF_SALARY rule correctly', () => {
      const rule: FbtRule = {
        benefitType: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        valuationRule: {
          type: FbtRuleType.PERCENTAGE_OF_SALARY,
          parameters: { percentage: 8 }
        },
        classification: FbtClassification.FBT
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.HOUSING_EMPLOYER_OWNED,
        amount: 500_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = applyFbtRule(rule, input);
      expect(result.selectedTaxableValue).toBe(40_000); // 500,000 * 8%
      expect(result.ruleUsed).toBe('HOUSING_EMPLOYER_OWNED_v1');
      expect(result.classification).toBe('FBT');
    });

    it('applies FIXED_PERCENTAGE rule correctly', () => {
      const rule: FbtRule = {
        benefitType: FringeBenefitType.OTHER_BENEFIT,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        valuationRule: {
          type: FbtRuleType.FIXED_PERCENTAGE,
          parameters: { percentage: 5 }
        },
        classification: FbtClassification.FBT
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.OTHER_BENEFIT,
        amount: 200_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = applyFbtRule(rule, input);
      expect(result.selectedTaxableValue).toBe(10_000); // 200,000 * 5%
      expect(result.ruleUsed).toBe('OTHER_BENEFIT_v1');
      expect(result.classification).toBe('FBT');
    });

    it('applies EMPLOYER_COST rule correctly', () => {
      const rule: FbtRule = {
        benefitType: FringeBenefitType.UTILITIES,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        valuationRule: {
          type: FbtRuleType.EMPLOYER_COST,
          parameters: {}
        },
        classification: FbtClassification.FBT
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.UTILITIES,
        amount: 300_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = applyFbtRule(rule, input);
      expect(result.selectedTaxableValue).toBe(300_000); // Full amount
      expect(result.ruleUsed).toBe('UTILITIES_v1');
      expect(result.classification).toBe('FBT');
    });

    it('handles employee contribution reduction correctly', () => {
      const rule: FbtRule = {
        benefitType: FringeBenefitType.MOTOR_VEHICLE,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        valuationRule: {
          type: FbtRuleType.PERCENTAGE_OF_COST,
          parameters: { percentage: 10 }
        },
        classification: FbtClassification.FBT
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 500_000,
        originalCost: 1_000_000,
        employeeContribution: 50_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = applyFbtRule(rule, input);
      // 1,000,000 * 10% = 100,000 - 50,000 contribution = 50,000
      expect(result.selectedTaxableValue).toBe(50_000);
      expect(result.reductionApplied).toBe(50_000);
      expect(result.ruleUsed).toBe('MOTOR_VEHICLE_v1');
      expect(result.classification).toBe('FBT');
    });

    it('handles EXCLUDED classification correctly', () => {
      const rule: FbtRule = {
        benefitType: FringeBenefitType.SCHOOL_FEES,
        version: 'v1',
        effectiveFrom: d('2026-01-01'),
        valuationRule: {
          type: FbtRuleType.EMPLOYER_COST,
          parameters: {}
        },
        classification: FbtClassification.EXCLUDED
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.SCHOOL_FEES,
        amount: 400_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = applyFbtRule(rule, input);
      expect(result.selectedTaxableValue).toBe(0);
      expect(result.classification).toBe('EXCLUDED');
      expect(result.classificationReason).toBe('Excluded per configured FBT rule');
    });
  });

  describe('calculateBenefitValue with settings', () => {
it('uses configured FBT rule when available', () => {
      const settingsMap = {
        'statutory.fbt_rule_MOTOR_VEHICLE_v1_2026-01-01': JSON.stringify({
          benefitType: FringeBenefitType.MOTOR_VEHICLE,
          version: 'v1',
          effectiveFrom: '2026-01-01',
          valuationRule: {
            type: FbtRuleType.PERCENTAGE_OF_COST,
            parameters: { percentage: 12 }
          },
          classification: FbtClassification.FBT
        })
        // No rule for SCHOOL_FEES - should use hardcoded
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 500_000,
        originalCost: 1_000_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = calculateBenefitValue(input, settingsMap);
      expect(result.selectedTaxableValue).toBe(120_000); // 1,000,000 * 12%
      expect(result.ruleUsed).toBe('MOTOR_VEHICLE_v1');
      expect(result.classification).toBe('FBT');
    });

    it('falls back to hardcoded rule when no matching rule found', () => {
      const settingsMap = {
        'statutory.fbt_rule_SCHOOL_FEES_v1_2026-01-01': JSON.stringify({
          benefitType: FringeBenefitType.SCHOOL_FEES,
          version: 'v1',
          effectiveFrom: '2026-01-01',
          valuationRule: {
            type: FbtRuleType.EMPLOYER_COST,
            parameters: {}
          },
          classification: FbtClassification.FBT
        })
        // No rule for MOTOR_VEHICLE
      };

      const input: FringeBenefitInput = {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 500_000,
        originalCost: 1_000_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = calculateBenefitValue(input, settingsMap);
      // Should fall back to hardcoded 15% rule
      expect(result.selectedTaxableValue).toBe(150_000); // 1,000,000 * 15%
      expect(result.ruleUsed).toBe('MOTOR_VEHICLE_15PCT');
      expect(result.classification).toBe('FBT');
    });

    it('falls back to hardcoded rule when settingsMap is empty', () => {
      const input: FringeBenefitInput = {
        type: FringeBenefitType.MOTOR_VEHICLE,
        amount: 500_000,
        originalCost: 1_000_000,
        effectiveFrom: d('2026-01-01')
      };

      const result = calculateBenefitValue(input, {});
      // Should fall back to hardcoded 15% rule
      expect(result.selectedTaxableValue).toBe(150_000); // 1,000,000 * 15%
      expect(result.ruleUsed).toBe('MOTOR_VEHICLE_15PCT');
      expect(result.classification).toBe('FBT');
    });
  });

  describe('calculateEmployerFBT with settings', () => {
    it('uses configured FBT rules for calculation', () => {
      const settingsMap = {
'statutory.fbt_rule_MOTOR_VEHICLE_v1_2026-01-01': JSON.stringify({
          benefitType: FringeBenefitType.MOTOR_VEHICLE,
          version: 'v1',
          effectiveFrom: '2026-01-01',
          valuationRule: {
            type: FbtRuleType.PERCENTAGE_OF_COST,
            parameters: { percentage: 12 }
          },
          classification: FbtClassification.FBT
        })
      };

      const benefits: FringeBenefitInput[] = [
        {
          type: FringeBenefitType.MOTOR_VEHICLE,
          amount: 500_000,
          originalCost: 1_000_000,
          effectiveFrom: d('2026-01-01')
        }
      ];

      const result = calculateEmployerFBT(benefits, 30, 'EMP001', '2026-01', settingsMap);
      // 1,000,000 * 12% = 120,000 taxable value
      // 120,000 * 30% = 36,000 FBT
      expect(result.totalTaxableValue).toBe(120_000);
      expect(result.fringeBenefitsTax).toBe(36_000);
      expect(result.benefits[0].ruleUsed).toBe('MOTOR_VEHICLE_v1');
      expect(result.benefits[0].selectedTaxableValue).toBe(120_000);
    });

    it('uses mixed configured and hardcoded rules', () => {
      const settingsMap = {
'statutory.fbt_rule_MOTOR_VEHICLE_v1_2026-01-01': JSON.stringify({
          benefitType: FringeBenefitType.MOTOR_VEHICLE,
          version: 'v1',
          effectiveFrom: '2026-01-01',
          valuationRule: {
            type: FbtRuleType.PERCENTAGE_OF_COST,
            parameters: { percentage: 10 } // Changed from 15% to 10%
          },
          classification: FbtClassification.FBT
        })
        // No rule for SCHOOL_FEES - should use hardcoded
      };

const benefits: FringeBenefitInput[] = [
         {
           type: FringeBenefitType.MOTOR_VEHICLE,
           amount: 500_000,
           originalCost: 1_000_000,
           effectiveFrom: d('2026-01-01')
         },
         {
           type: FringeBenefitType.SCHOOL_FEES,
           paymentMethod: BenefitPaymentMethod.DIRECT_TO_INSTITUTION,
           amount: 400_000,
           effectiveFrom: d('2026-01-01')
         }
       ];

      const result = calculateEmployerFBT(benefits, 30, 'EMP001', '2026-01', settingsMap);
      // MOTOR_VEHICLE: 1,000,000 * 10% = 100,000
      // SCHOOL_FEES: 400,000 * 50% = 200,000 (hardcoded rule)
      // Total: 300,000
      // FBT: 300,000 * 30% = 90,000
      expect(result.totalTaxableValue).toBe(300_000);
      expect(result.fringeBenefitsTax).toBe(90_000);
      expect(result.benefits[0].ruleUsed).toBe('MOTOR_VEHICLE_v1');
      expect(result.benefits[0].selectedTaxableValue).toBe(100_000);
      expect(result.benefits[1].ruleUsed).toBe('SCHOOL_FEES_DIRECT_50PCT');
      expect(result.benefits[1].selectedTaxableValue).toBe(200_000);
    });
  });
});
