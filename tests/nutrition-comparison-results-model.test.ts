import { expect, it } from 'vitest';
import { projectNutritionComparisonResults } from '../js/nutrition-comparison-results-model.js';
import { nutritionComparisonFixture } from './helpers/nutrition-comparison-fixture.js';
it('preserves zero, unknown and signed nutrient differences without mutating restored metadata', () => {
  const fixture = nutritionComparisonFixture(), before = JSON.stringify(fixture);
  const view = projectNutritionComparisonResults({ runs: fixture.runs, reference: fixture.manualReference, isRestored: true });
  expect(JSON.stringify(fixture)).toBe(before); expect(view.manualReference).toBe(true);
  const precise = view.cards.find(card => card.index === 0)!;
  expect(precise.metrics.find(metric => metric.label === 'Protein')).toEqual({ label: 'Protein', value: '0 g', difference: { label: 'Same', tone: 'is-close' } });
  expect(precise.detailed.find(row => row.label === 'Sodium')).toMatchObject({ predicted: '120 mg', expected: '100 mg', difference: { label: '+20%', tone: '' } });
  expect(precise.detailed.find(row => row.label === 'Vitamin C')).toMatchObject({ predicted: '0 mg', expected: '0 mg', difference: { label: 'Same', tone: 'is-close' } });
  const other = view.cards.find(card => card.index === 1)!;
  expect(other.detailed.find(row => row.label === 'Vitamin C')).toMatchObject({ predicted: '—', expected: '0 mg', difference: { label: '—', tone: '' } });
  expect(other.differences.find(row => row.label === 'Vitamin C')).toMatchObject({ predicted: 'Missing', difference: { label: 'Missing estimate', tone: 'is-missing' } });
  expect(other.ingredients).toHaveLength(6); expect(other.ingredientCount).toBe('6 of 8 shown'); expect(precise.checks).toEqual(['Review salt', 'Reviewed portions']);
});
it('keeps a selected baseline distinct from known-value truth and retains original action indices after ranking', () => {
  const fixture = nutritionComparisonFixture(), baseline = fixture.runs[0]!;
  const view = projectNutritionComparisonResults({ runs: fixture.runs, reference: fixture.manualReference, referenceRun: baseline, referenceRunIndex: 0 });
  expect(view.baseline).toBe('Fixture precise'); expect(view.referenceHeading).toBe('Baseline'); expect(view.manualReference).toBe(false);
  const card = view.cards.find(value => value.index === 0)!;
  expect(card).toMatchObject({ baseline: true, best: false, title: 'Baseline', scoreLabel: 'Selected model', rankLabel: '' });
  expect(card.metrics.find(metric => metric.label === 'Protein')?.difference).toEqual({ label: 'Reference', tone: 'is-reference' });
  expect(view.cards.find(value => value.index === 2)).toMatchObject({ restored: false, successful: false, error: 'Provider unavailable <literal>' });
});
it('leaves estimates unranked without reference values and reports unavailable costs separately from token usage', () => {
  const fixture = nutritionComparisonFixture(); const view = projectNutritionComparisonResults({ runs: fixture.runs });
  expect(view.cards.find(card => card.index === 0)).toMatchObject({ title: 'Not ranked', scoreLabel: 'Add known values', tokens: '150 tokens · 100 in / 50 out', usageKnown: true });
  expect(view.cards.find(card => card.index === 1)).toMatchObject({ cost: 'Cost unknown', usageKnown: false, tokens: '' });
});
