import { describe, expect, it } from 'vitest';

import {
  aggregateSupplementContaminants,
  contaminantDailyMass,
  formatContaminantMass,
  formatSupplementQualityResult,
  isActiveIngredientPotencyTest,
  isInformationalActiveIngredientPotencyTest,
  isSupplementQualityIncludedInAI,
  supplementQualityKey,
  supplementQualityEvidenceScope,
} from '../js/supplement-quality.js';

describe('supplement quality and contaminant aggregation', () => {
  it('does not turn ND, NQ, concentrations, or PRN use into intake amounts', () => {
    const daily = { timesPerDay: 2, servingSize: { value: 2, unit: 'capsule' }, schedule: { mode: 'daily' }, qualityEvidenceScope: 'matching-lot' };
    expect(contaminantDailyMass({ category: 'contaminant', analyte: 'Lead', status: 'not-detected', value: null, unit: 'mg', basis: 'per capsule' }, daily)).toBeNull();
    expect(contaminantDailyMass({ category: 'contaminant', analyte: 'Lead', status: 'reported', value: 0.01, unit: 'mg', basis: 'mg/kg' }, daily)).toBeNull();
    expect(contaminantDailyMass({ category: 'contaminant', analyte: 'Lead', status: 'reported', value: 0.01, unit: 'mg', basis: 'per serving' }, { ...daily, schedule: { mode: 'prn' } })).toBeNull();
    expect(contaminantDailyMass({ category: 'contaminant', analyte: 'Lead', status: 'reported', value: 0.01, unit: 'mg', basis: 'per serving' }, { ...daily, qualityEvidenceScope: 'unknown' })).toBeNull();
  });

  it('combines only compatible daily mass results and preserves upper bounds', () => {
    const groups = aggregateSupplementContaminants([
      {
        name: 'Product A', timesPerDay: 2, servingSize: { value: 1, unit: 'capsule' }, schedule: { mode: 'daily' }, qualityEvidenceScope: 'matching-lot',
        qualityTests: [{ category: 'contaminant', analyte: 'Lead', resultText: '0.001 mg', value: 0.001, unit: 'mg', basis: 'per serving', status: 'reported' }],
      },
      {
        name: 'Product B', timesPerDay: 1, servingSize: { value: 2, unit: 'capsule' }, schedule: { mode: 'daily' }, qualityEvidenceScope: 'matching-lot',
        qualityTests: [{ category: 'contaminant', analyte: 'Olovo', canonicalAnalyte: 'Lead', resultText: '< 0.5 mcg', comparator: '<', value: 0.5, unit: 'mcg', basis: 'per capsule', status: 'reported' }],
      },
      {
        name: 'Product C', timesPerDay: 1, schedule: { mode: 'daily' },
        qualityTests: [{ category: 'contaminant', analyte: 'Lead', resultText: 'ND', value: null, unit: 'mg', basis: 'per capsule', status: 'not-detected' }],
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      analyte: 'Lead', exactMcgPerDay: 2, upperMcgPerDay: 1,
      summableCount: 2, reportedCount: 3,
    });
    expect(formatContaminantMass(3)).toBe('3 mcg/day');
  });

  it('uses Unicode-safe analyte identities', () => {
    expect(supplementQualityKey('Кадмий')).toBe('кадмий');
    expect(supplementQualityKey('カドミウム')).toBe('カドミウム');
  });

  it('formats qualitative and numeric source results without losing their measurement basis', () => {
    expect(formatSupplementQualityResult({ resultText: 'ND', unit: 'mg', basis: 'per capsule' }))
      .toBe('ND · mg per capsule');
    expect(formatSupplementQualityResult({ resultText: '< 0.5', unit: 'mcg', basis: 'per serving' }))
      .toBe('< 0.5 mcg · per serving');
  });

  it('stores matching potency verification without duplicating active-ingredient AI context', () => {
    const supplement = { ingredients: [{ name: 'Vitamin B6 (P-5-P)' }, { name: 'Folate' }] };
    const duplicate = { category: 'potency', analyte: 'Vitamin B6', resultText: '101%', status: 'pass' };
    const contaminant = { category: 'contaminant', analyte: 'Lead', resultText: 'ND' };

    expect(isActiveIngredientPotencyTest(duplicate, supplement)).toBe(true);
    expect(isInformationalActiveIngredientPotencyTest(duplicate, supplement)).toBe(true);
    expect(isSupplementQualityIncludedInAI(duplicate, supplement)).toBe(false);
    expect(isSupplementQualityIncludedInAI({ ...duplicate, includeInAIContext: true }, supplement)).toBe(true);
    expect(isSupplementQualityIncludedInAI({ ...duplicate, status: 'fail' }, supplement)).toBe(true);
    expect(isSupplementQualityIncludedInAI(contaminant, supplement)).toBe(true);
  });

  it('defaults report-to-bottle applicability to unknown without rewriting legacy records', () => {
    expect(supplementQualityEvidenceScope({})).toBe('unknown');
    expect(supplementQualityEvidenceScope({ qualityEvidenceScope: 'matching-lot' })).toBe('matching-lot');
    expect(supplementQualityEvidenceScope({ qualityEvidenceScope: 'publisher-marketing-copy' })).toBe('unknown');
  });
});
