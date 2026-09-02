# FBT Benefit Rules Configuration via Settings - Implementation Plan

## Goal
Make FBT benefit types and valuation rules configurable via the settings table instead of hardcoded in fbt-engine.ts.

## Steps

### 1. Design FBT Rule Settings Format
- Define JSON schema for FBT benefit rules stored as settings values
- Use key pattern: `statutory.fbt_rule_<benefitType>_<version>_<effectiveFromDate>`
- Support rule types: PERCENTAGE_OF_COST, PERCENTAGE_OF_SALARY, FIXED_PERCENTAGE, EMPLOYER_COST, CONCESSIONARY_LOAN, CAPPED_RENTAL
- Include fields: benefitType, version, effectiveFrom, effectiveTo, valuationRule (type-specific params), classification, exclusionConditions

### 2. Modify fbt-engine.ts
- Add `loadFbtRulesFromSettings(settingsMap: Record<string, string>): FbtRule[]` function
- Add rule selection logic: find applicable rule by benefitType + effectiveFrom date
- Replace hardcoded valuation functions with generic rule applicator
- Maintain backward compatibility: fall back to hardcoded logic if no matching rule found
- Preserve all audit trail functionality
- Update calculateEmployerFBT signature if needed (should already work via config)

### 3. Extend Settings Page UI
- Add FBT Rules section to STATUTORY tab
- Create table view of existing FBT rules
- Implement add/edit/delete rule functionality
- Create rule configuration form with:
  * Benefit type dropdown (from FringeBenefitType enum)
  * Version input (text)
  * Effective from date picker
  * Effective to date picker (optional)
  * Valuation rule type dropdown
  * Dynamic parameter fields based on rule type selection
  * Classification dropdown (FBT/PAYE_NOT_FBT/EXCLUDED)
  * Exclusion conditions builder (for future enhancement)
- Add validation: prevent overlapping effective dates for same benefit type
- Add live preview: show calculated value for sample inputs

### 4. Update Settings Sync Logic
- Modify settings useEffect in SettingsPage to parse FBT rules alongside existing data
- Add FBT rules to settingsMap processing if needed for performance
- Ensure FBT rules are included in save operations

### 5. Testing
- Write unit tests for rules engine functions
- Write integration tests for full FBT calculation with configured rules
- Manual verification:
  * Configure motor vehicle rule at 12% instead of 15%
  * Verify payroll calculation uses new rate
  * Check audit trail shows correct rule source
  * Test effective date behavior
  * Verify backward compatibility when no FBT rules configured

### 6. Documentation
- Update docs/changes/2026-09-02-payroll-frozen-scroll-compression.md if needed
- Create new docs file for this FBT rules feature
- Document settings format and usage examples

## Files to Modify
1. src/lib/fbt-engine.ts - Main implementation
2. src/app/settings/page.tsx - Settings UI
3. docs/changes/2026-09-02-fbt-rules-settings.md - Documentation
4. src/lib/payroll-engine.ts - Potentially, if settings parsing needs updates
5. prisma/schema.prisma - Potentially, if we need to extend Setting model (but current JSON storage in value field should work)

## Dependencies
- None - uses existing settings infrastructure
- Builds on existing FBT engine and settings page

## Acceptance Criteria
- Users can add/edit/delete FBT benefit rules via Settings → STATUTORY tab
- FBT calculations use configured rules when available
- Audit trail shows which rule version was applied
- Effective date rule selection works correctly
- Backward compatibility maintained (hardcoded rules as fallback)
- TypeScript compilation passes: npx tsc --noEmit
- No lint errors introduced