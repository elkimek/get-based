import { describe, expect, it } from 'vitest';
import { latestVitaminDContext } from '../js/lab-vitamin-d-context.js';

describe('canonical vitamin D context', () => {
  it('selects the latest finite total vitamin D result without mutating entries', () => {
    const entries = [
      { date: '2026-01-01', markers: { 'vitamins.vitaminD': 40 } },
      { date: '2026-03-01', markers: { 'vitamins.vitaminD3': 85 } },
      { date: '2026-02-01', markers: { 'vitamins.vitaminD': 75 } },
      { date: '2026-04-01', markers: { 'vitamins.vitaminD': NaN } },
    ];
    const before = structuredClone(entries);
    expect(latestVitaminDContext(entries)).toBe('Latest 25-OH-D: 75 nmol/l (2026-02-01)');
    expect(entries).toEqual(before);
  });
  it('omits missing/null measurements and does not confuse D3 with total D', () => {
    expect(latestVitaminDContext()).toBe('');
    expect(latestVitaminDContext([{ date: '2026-01-01', markers: { 'vitamins.vitaminD': null, 'vitamins.vitaminD3': 80 } }])).toBe('');
  });
  it('does not retain results from another supplied profile snapshot', () => {
    expect(latestVitaminDContext([{ date: '2026-01-01', markers: { 'vitamins.vitaminD': 0 } }])).toContain('0 nmol/l');
    expect(latestVitaminDContext([])).toBe('');
  });
});
