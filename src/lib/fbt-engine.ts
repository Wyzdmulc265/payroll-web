import Decimal from 'decimal.js';

export enum FringeBenefitType {
  HOUSING_EMPLOYER_OWNED = 'HOUSING_EMPLOYER_OWNED',
  HOUSING_RENTED = 'HOUSING_RENTED',
  MOTOR_VEHICLE = 'MOTOR_VEHICLE',
  SCHOOL_FEES = 'SCHOOL_FEES',
  UTILITIES = 'UTILITIES',
  HOUSEHOLD_ITEMS = 'HOUSEHOLD_ITEMS',
  VACATION = 'VACATION',
  TRAVEL = 'TRAVEL',
  DOMESTIC_SERVICE = 'DOMESTIC_SERVICE',
  AIRTIME_DATA = 'AIRTIME_DATA',
  CONCESSIONARY_LOAN = 'CONCESSIONARY_LOAN',
  OTHER_BENEFIT = 'OTHER_BENEFIT',
}

export enum BenefitPaymentMethod {
  DIRECT_TO_INSTITUTION = 'DIRECT_TO_INSTITUTION',
  CASH_TO_EMPLOYEE = 'CASH_TO_EMPLOYEE',
  ADVANCE = 'ADVANCE',
}

export interface FringeBenefitInput {
  type: FringeBenefitType;
  description?: string;
  paymentMethod?: BenefitPaymentMethod;
  amount: number;
  employeeContribution?: number;
  effectiveFrom: Date;
  effectiveTo?: Date;

  originalCost?: number;
  furnished?: boolean;
  ownershipType?: 'EMPLOYER_OWNED' | 'RENTED';
  employerRentalCost?: number;
  openMarketRentalValue?: number;
  benchmarkInterestRate?: number;
  employerInterestRate?: number;
  principalAmount?: number;
}

export interface AuditEntry {
  rule: string;
  source: string;
  effectiveFrom: Date;
  formula: string;
  inputs: Record<string, unknown>;
  result: number;
}

export interface BenefitValuationResult {
  input: FringeBenefitInput;
  classification: 'FBT' | 'PAYE_NOT_FBT' | 'EXCLUDED';
  classificationReason?: string;
  candidateValues: Record<string, number>;
  selectedTaxableValue: number;
  reductionApplied?: number;
  ruleUsed: string;
  ruleEffectiveFrom: Date;
  auditTrail: AuditEntry[];
}

export interface FBTResult {
  employeeId: string;
  payrollPeriod: string;
  benefits: BenefitValuationResult[];
  totalTaxableValue: number;
  fbtRate: number;
  fringeBenefitsTax: number;
  liabilityType: 'EMPLOYER';
}

export class TaxRuleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxRuleNotFoundError';
  }
}

function classifyBenefit(input: FringeBenefitInput): { classification: 'FBT' | 'PAYE_NOT_FBT' | 'EXCLUDED'; reason?: string } {
  if (
    input.type === FringeBenefitType.SCHOOL_FEES &&
    (input.paymentMethod === BenefitPaymentMethod.CASH_TO_EMPLOYEE || input.paymentMethod === BenefitPaymentMethod.ADVANCE)
  ) {
    return { classification: 'EXCLUDED', reason: 'School fees advance or cash to employee — excluded under MRA guidance' };
  }
  return { classification: 'FBT' };
}

function toDecimal(value: unknown): Decimal {
  return new Decimal(Number(value) || 0);
}

function roundMWK(value: Decimal | number): number {
  return Math.round(Number(value));
}

function addAudit(
  trail: AuditEntry[],
  rule: string,
  source: string,
  effectiveFrom: Date,
  formula: string,
  inputs: Record<string, unknown>,
  result: number
): AuditEntry[] {
  return [...trail, { rule, source, effectiveFrom, formula, inputs, result }];
}

function applyEmployeeContribution(grossValue: number, contribution?: number): number {
  return Math.max(0, grossValue - (contribution ?? 0));
}

function calculateMotorVehicle(input: FringeBenefitInput): BenefitValuationResult {
  const trail: AuditEntry[] = [];
  const originalCost = toDecimal(input.originalCost);
  const ruleDate = new Date('2024-04-01');

  if (originalCost.isZero() || originalCost.isNegative()) {
    const result: BenefitValuationResult = {
      input,
      classification: 'FBT',
      candidateValues: {},
      selectedTaxableValue: 0,
      ruleUsed: 'MOTOR_VEHICLE_15PCT',
      ruleEffectiveFrom: ruleDate,
      auditTrail: addAudit(trail, 'MOTOR_VEHICLE_15PCT', 'MRA FBT guidelines', ruleDate, 'originalCost × 15%', { originalCost: input.originalCost }, 0),
    };
    return result;
  }

  const taxableValue = originalCost.mul(0.15);
  const roundedValue = roundMWK(taxableValue);

  trail.push({
    rule: 'MOTOR_VEHICLE_15PCT',
    source: 'MRA FBT guidelines',
    effectiveFrom: ruleDate,
    formula: 'originalCost × 15%',
    inputs: { originalCost: Number(originalCost) },
    result: roundedValue,
  });

  return {
    input,
    classification: 'FBT',
    candidateValues: { '15% of original cost': roundedValue },
    selectedTaxableValue: roundedValue,
    ruleUsed: 'MOTOR_VEHICLE_15PCT',
    ruleEffectiveFrom: ruleDate,
    auditTrail: trail,
  };
}

function calculateHousing(input: FringeBenefitInput): BenefitValuationResult {
  const trail: AuditEntry[] = [];
  const ruleDate = new Date('2024-04-01');
  const salary = toDecimal(input.amount);
  const furnished = input.furnished ?? false;
  const ownershipType = input.ownershipType ?? 'EMPLOYER_OWNED';

  let candidateValues: Record<string, number> = {};
  let selectedTaxableValue = 0;
  let ruleUsed = '';

  if (ownershipType === 'EMPLOYER_OWNED') {
    const pct = furnished ? 0.12 : 0.10;
    const key = `${furnished ? 'Furnished' : 'Unfurnished'} (${(pct * 100)}% × salary)`;
    candidateValues[key] = roundMWK(salary.mul(pct));
    selectedTaxableValue = candidateValues[key];
    ruleUsed = furnished ? 'HOUSING_EMPLOYER_OWNED_FURNISHED' : 'HOUSING_EMPLOYER_OWNED_UNFURNISHED';
    trail.push({
      rule: ruleUsed,
      source: 'MRA FBT guidelines',
      effectiveFrom: ruleDate,
      formula: `${pct * 100}% × basicSalary`,
      inputs: { basicSalary: Number(salary), furnished },
      result: selectedTaxableValue,
    });
  } else {
    const employerRentalCost = toDecimal(input.employerRentalCost);
    const openMarketRentalValue = toDecimal(input.openMarketRentalValue);
    const cappedValue = employerRentalCost.gt(openMarketRentalValue) ? openMarketRentalValue : employerRentalCost;
    candidateValues = {
      'Employer rental cost': roundMWK(employerRentalCost),
      'Open market rental value': roundMWK(openMarketRentalValue),
      'Capped (min of above)': roundMWK(cappedValue),
    };
    selectedTaxableValue = roundMWK(cappedValue);
    ruleUsed = 'HOUSING_RENTED_CAPPED';
    trail.push({
      rule: ruleUsed,
      source: 'MRA FBT guidelines',
      effectiveFrom: ruleDate,
      formula: 'MIN(employerRentalCost, openMarketRentalValue)',
      inputs: { employerRentalCost: Number(employerRentalCost), openMarketRentalValue: Number(openMarketRentalValue) },
      result: selectedTaxableValue,
    });
  }

  const reductionApplied = input.employeeContribution ? applyEmployeeContribution(selectedTaxableValue, input.employeeContribution) : undefined;
  const finalValue = reductionApplied !== undefined ? reductionApplied : selectedTaxableValue;

  if (reductionApplied !== undefined && reductionApplied < selectedTaxableValue) {
    trail.push({
      rule: 'EMPLOYEE_CONTRIBUTION_REDUCTION',
      source: 'MRA FBT guidelines',
      effectiveFrom: ruleDate,
      formula: 'selectedTaxableValue - employeeContribution',
      inputs: { selectedTaxableValue, employeeContribution: input.employeeContribution },
      result: finalValue,
    });
  }

  return {
    input,
    classification: 'FBT',
    candidateValues,
    selectedTaxableValue: finalValue,
    reductionApplied,
    ruleUsed,
    ruleEffectiveFrom: ruleDate,
    auditTrail: trail,
  };
}

function calculateSchoolFees(input: FringeBenefitInput): BenefitValuationResult {
  const trail: AuditEntry[] = [];
  const ruleDate = new Date('2024-04-01');
  const amount = toDecimal(input.amount);

  if (input.paymentMethod === BenefitPaymentMethod.DIRECT_TO_INSTITUTION) {
    const taxableValue = amount.mul(0.5);
    const roundedValue = roundMWK(taxableValue);
    trail.push({
      rule: 'SCHOOL_FEES_DIRECT_50PCT',
      source: 'MRA FBT guidelines',
      effectiveFrom: ruleDate,
      formula: 'amount × 50%',
      inputs: { amount: Number(amount), paymentMethod: input.paymentMethod },
      result: roundedValue,
    });
    return {
      input,
      classification: 'FBT',
      candidateValues: { '50% of amount (direct to institution)': roundedValue },
      selectedTaxableValue: roundedValue,
      ruleUsed: 'SCHOOL_FEES_DIRECT_50PCT',
      ruleEffectiveFrom: ruleDate,
      auditTrail: trail,
    };
  }

  return {
    input,
    classification: 'EXCLUDED',
    classificationReason: 'School fees paid as cash or advance — excluded under MRA guidance',
    candidateValues: {},
    selectedTaxableValue: 0,
    ruleUsed: 'SCHOOL_FEES_EXCLUDED',
    ruleEffectiveFrom: ruleDate,
    auditTrail: addAudit(trail, 'SCHOOL_FEES_EXCLUDED', 'MRA FBT guidelines', ruleDate, 'N/A — excluded', { amount: Number(amount), paymentMethod: input.paymentMethod }, 0),
  };
}

function calculateAirtimeData(input: FringeBenefitInput): BenefitValuationResult {
  const trail: AuditEntry[] = [];
  const amount = toDecimal(input.amount);
  const benefitDate = new Date(input.effectiveFrom);
  const amendmentDate = new Date('2024-04-01');

  if (benefitDate >= amendmentDate) {
    const taxableValue = amount.mul(0.5);
    const roundedValue = roundMWK(taxableValue);
    trail.push({
      rule: 'AIRTIME_DATA_50PCT_POST_2024',
      source: '2024 Amendment Regulations',
      effectiveFrom: amendmentDate,
      formula: 'amount × 50%',
      inputs: { amount: Number(amount), effectiveFrom: input.effectiveFrom },
      result: roundedValue,
    });
    return {
      input,
      classification: 'FBT',
      candidateValues: { '50% of amount': roundedValue },
      selectedTaxableValue: roundedValue,
      ruleUsed: 'AIRTIME_DATA_50PCT_POST_2024',
      ruleEffectiveFrom: amendmentDate,
      auditTrail: trail,
    };
  }

  const taxableValue = amount;
  const roundedValue = roundMWK(taxableValue);
  trail.push({
    rule: 'AIRTIME_DATA_100PCT_PRE_2024',
    source: 'Prior MRA FBT guidelines',
    effectiveFrom: new Date('1900-01-01'),
    formula: 'amount × 100%',
    inputs: { amount: Number(amount), effectiveFrom: input.effectiveFrom },
    result: roundedValue,
  });
  return {
    input,
    classification: 'FBT',
    candidateValues: { '100% of amount (pre-2024 rule)': roundedValue },
    selectedTaxableValue: roundedValue,
    ruleUsed: 'AIRTIME_DATA_100PCT_PRE_2024',
    ruleEffectiveFrom: new Date('1900-01-01'),
    auditTrail: trail,
  };
}

function calculateConcessionaryLoan(input: FringeBenefitInput): BenefitValuationResult {
  const trail: AuditEntry[] = [];
  const ruleDate = new Date('2024-04-01');
  const principal = toDecimal(input.principalAmount);
  const benchmarkRate = toDecimal(input.benchmarkInterestRate).div(100);
  const employerRate = toDecimal(input.employerInterestRate).div(100);

  if (principal.isZero() || principal.isNegative()) {
    return {
      input,
      classification: 'FBT',
      candidateValues: {},
      selectedTaxableValue: 0,
      ruleUsed: 'CONCESSIONARY_LOAN',
      ruleEffectiveFrom: ruleDate,
      auditTrail: addAudit(trail, 'CONCESSIONARY_LOAN', 'MRA FBT guidelines', ruleDate, 'principal × (benchmarkRate - employerRate) × periodFraction', { principal: input.principalAmount }, 0),
    };
  }

  const rateDiff = benchmarkRate.sub(employerRate);
  const periodFraction = input.effectiveTo ? calculatePeriodFraction(input.effectiveFrom, input.effectiveTo) : 1;
  const taxableValue = principal.mul(rateDiff).mul(periodFraction);
  const roundedValue = roundMWK(taxableValue);

  trail.push({
    rule: 'CONCESSIONARY_LOAN',
    source: 'MRA FBT guidelines',
    effectiveFrom: ruleDate,
    formula: 'principal × (benchmarkRate - employerRate) × periodFraction',
    inputs: {
      principal: Number(principal),
      benchmarkRate: Number(input.benchmarkInterestRate),
      employerRate: Number(input.employerInterestRate),
      periodFraction,
    },
    result: roundedValue,
  });

  return {
    input,
    classification: 'FBT',
    candidateValues: { 'Concessionary loan benefit': roundedValue },
    selectedTaxableValue: roundedValue,
    ruleUsed: 'CONCESSIONARY_LOAN',
    ruleEffectiveFrom: ruleDate,
    auditTrail: trail,
  };
}

function calculateDefaultBenefit(input: FringeBenefitInput): BenefitValuationResult {
  const trail: AuditEntry[] = [];
  const ruleDate = new Date('2024-04-01');
  const amount = toDecimal(input.amount);
  const taxableValue = applyEmployeeContribution(Number(amount), input.employeeContribution);
  const roundedValue = Math.round(taxableValue);

  trail.push({
    rule: 'EMPLOYER_COST',
    source: 'MRA FBT guidelines',
    effectiveFrom: ruleDate,
    formula: 'employerCost',
    inputs: { amount: Number(amount), employeeContribution: input.employeeContribution },
    result: roundedValue,
  });

  return {
    input,
    classification: 'FBT',
    candidateValues: { 'Employer cost': roundedValue },
    selectedTaxableValue: roundedValue,
    ruleUsed: 'EMPLOYER_COST',
    ruleEffectiveFrom: ruleDate,
    auditTrail: trail,
  };
}

function calculatePeriodFraction(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const diffMs = end.getTime() - start.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  const yearFraction = days / 365;
  return Math.round(yearFraction * 1000) / 1000;
}

export function calculateBenefitValue(input: FringeBenefitInput): BenefitValuationResult {
  const classification = classifyBenefit(input);

  if (classification.classification === 'PAYE_NOT_FBT') {
    return {
      input,
      classification: 'PAYE_NOT_FBT',
      classificationReason: classification.reason,
      candidateValues: {},
      selectedTaxableValue: 0,
      ruleUsed: 'N/A',
      ruleEffectiveFrom: new Date(0),
      auditTrail: [],
    };
  }

  if (classification.classification === 'EXCLUDED') {
    return {
      input,
      classification: 'EXCLUDED',
      classificationReason: classification.reason,
      candidateValues: {},
      selectedTaxableValue: 0,
      ruleUsed: 'EXCLUDED',
      ruleEffectiveFrom: new Date(0),
      auditTrail: [],
    };
  }

  switch (input.type) {
    case FringeBenefitType.MOTOR_VEHICLE:
      return calculateMotorVehicle(input);
    case FringeBenefitType.HOUSING_EMPLOYER_OWNED:
    case FringeBenefitType.HOUSING_RENTED:
      return calculateHousing(input);
    case FringeBenefitType.SCHOOL_FEES:
      return calculateSchoolFees(input);
    case FringeBenefitType.AIRTIME_DATA:
      return calculateAirtimeData(input);
    case FringeBenefitType.CONCESSIONARY_LOAN:
      return calculateConcessionaryLoan(input);
    case FringeBenefitType.UTILITIES:
    case FringeBenefitType.HOUSEHOLD_ITEMS:
    case FringeBenefitType.VACATION:
    case FringeBenefitType.TRAVEL:
    case FringeBenefitType.DOMESTIC_SERVICE:
    case FringeBenefitType.OTHER_BENEFIT:
      return calculateDefaultBenefit(input);
    default:
      throw new TaxRuleNotFoundError(`No FBT valuation rule found for benefit type ${input.type}`);
  }
}

export function calculateEmployerFBT(
  benefits: FringeBenefitInput[],
  fbtRate: number = 30,
  employeeId?: string,
  payrollPeriod?: string
): FBTResult {
  const valuationResults = benefits.map(b => calculateBenefitValue(b));
  const fbtClassified = valuationResults.filter(r => r.classification === 'FBT');
  const totalTaxableValue = fbtClassified.reduce((sum, r) => sum + r.selectedTaxableValue, 0);
  const fringeBenefitsTax = Math.round(totalTaxableValue * (fbtRate / 100));

  return {
    employeeId: employeeId ?? '',
    payrollPeriod: payrollPeriod ?? '',
    benefits: valuationResults,
    totalTaxableValue,
    fbtRate,
    fringeBenefitsTax,
    liabilityType: 'EMPLOYER',
  };
}

export function summarizeFBTResult(result: FBTResult): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const b of result.benefits) {
    if (b.classification === 'FBT') {
      const type = b.input.type;
      summary[type] = (summary[type] || 0) + b.selectedTaxableValue;
    }
  }
  return summary;
}
