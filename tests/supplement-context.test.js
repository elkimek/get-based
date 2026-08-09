import { describe, expect, it } from 'vitest';

import {
  buildCompactSupplementContextRecords,
  buildSupplementAIContext,
  resolveSupplementContextMode,
} from '../js/supplement-context.js';

function product(overrides = {}) {
  return {
    name: 'Multilingual Daily',
    type: 'supplement',
    startDate: '2026-01-01',
    schedule: { mode: 'daily', timesPerDay: 1 },
    servingSize: { value: 1, unit: 'capsule' },
    ingredients: Array.from({ length: 10 }, (_, index) => ({
      name: `Active ${index + 1}`,
      amount: `${index + 1} mg`,
    })),
    inactiveIngredients: [
      'Rice flour',
      'Silicon dioxide',
      'Magnesium stearate',
      'Natural color',
      'Vegetable capsule (hypromellose)',
      'Sunflower lecithin',
    ],
    qualityTests: [
      {
        category: 'contaminant', analyte: 'Кадмий', canonicalAnalyte: 'cadmium',
        resultText: 'ND', unit: 'mg', basis: 'per capsule', status: 'not-detected',
        method: 'ICP-MS full method should only appear in detail',
      },
      { category: 'potency', analyte: 'Active 1', resultText: '101%', status: 'pass' },
      { category: 'microbiology', analyte: 'Salmonella', resultText: 'positive', status: 'fail' },
    ],
    ...overrides,
  };
}

describe('token-bounded supplement AI context', () => {
  it('keeps high-signal capsule materials and quality summaries in compact mode', () => {
    const context = buildSupplementAIContext([product()], { mode: 'compact', maxChars: 3000 });

    expect(context.length).toBeLessThanOrEqual(3000);
    expect(context).toContain('Vegetable capsule (hypromellose)');
    expect(context).toContain('(+1 more stored)');
    expect(context).toContain('explicit source failures: Salmonella: positive');
    expect(context).toContain('cadmium — Multilingual Daily: ND · mg per capsule');
    expect(context).toContain('0/1 result(s) convertible to scheduled daily mass');
    expect(context).toContain('relationship to the user’s bottle lot not verified');
    expect(context).toContain('1 informational/excluded result(s) retained outside AI context');
    expect(context).not.toContain('potency — Active 1');
    expect(context).toContain('keep ND/NQ distinct from zero');
    expect(context).not.toContain('ICP-MS full method');
    expect(context).toContain('(+2 more stored)');
  });

  it('unlocks detail from stored terms in arbitrary scripts and includes full evidence', () => {
    const supplement = product({
      inactiveIngredients: ['植物性カプセル', '米粉'],
    });

    expect(resolveSupplementContextMode('Покажи подробнее Кадмий', [supplement])).toBe('detail');
    expect(resolveSupplementContextMode('植物性カプセルについて教えて', [supplement])).toBe('detail');
    expect(resolveSupplementContextMode('How was my sleep?', [supplement])).toBe('compact');

    const detail = buildSupplementAIContext([supplement], { mode: 'detail' });
    expect(detail).toContain('ICP-MS full method should only appear in detail');
    expect(detail).toContain('植物性カプセル');
  });

  it('honors an explicit per-result AI exclusion without deleting other quality evidence', () => {
    const supplement = product();
    supplement.qualityTests[0].includeInAIContext = false;
    const context = buildSupplementAIContext([supplement], { mode: 'detail' });

    expect(context).not.toContain('cadmium —');
    expect(context).toContain('Salmonella: positive');
    expect(context).toContain('2 informational/excluded result(s) retained outside AI context');
  });

  it('keeps archived records discoverable without expanding their full data', () => {
    const current = product();
    const ended = product({ name: 'Past course', startDate: '2025-01-01', endDate: '2025-02-01' });
    const context = buildSupplementAIContext([current], {
      mode: 'compact',
      inventorySupplements: [current, ended],
    });

    expect(context).toContain('Other stored therapy records (summary only): Past course [ended]');
    expect(context.match(/Past course/gu)).toHaveLength(1);
  });

  it('enforces hard prompt budgets and marks omitted records', () => {
    const supplements = Array.from({ length: 35 }, (_, index) => product({
      name: `Product ${index + 1}`,
      note: 'Long but bounded context note '.repeat(20),
    }));
    const context = buildSupplementAIContext(supplements, { mode: 'compact', maxChars: 1200 });
    const records = buildCompactSupplementContextRecords(supplements, { maxChars: 900 });

    expect(context.length).toBeLessThanOrEqual(1200);
    expect(context).toContain('full records remain stored');
    expect(JSON.stringify(records).length).toBeLessThanOrEqual(900);
    expect(records.at(-1)).toHaveProperty('moreTherapyRecordsStored');
    expect(JSON.stringify(records)).not.toContain('ICP-MS full method');
  });
});
