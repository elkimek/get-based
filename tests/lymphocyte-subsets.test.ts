// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { MARKER_SCHEMA, OPTIMAL_RANGES, normalizeToSI, getBuiltinMarkerId } from '../js/schema.js';
import { convertImportValueUnit } from '../js/pdf-import-unit-conversions.js';
import { reconcileImportMarkerMappings } from '../js/pdf-import-marker-mapping.js';
import type { ImportReviewMarker } from '../js/pdf-import-review-runtime.js';
import { getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { state } from '../js/state.js';
import { CHAT_SYSTEM_PROMPT } from '../js/chat-system-prompt.js';
import { formatMarkerValuesForChat } from '../js/marker-analysis.js';

const original = { importedData: state.importedData, unitSystem: state.unitSystem, profileSex: state.profileSex, profileDob: state.profileDob, rangeMode: state.rangeMode };
afterEach(() => { Object.assign(state, original); invalidateActiveDataCache(); });
const countKeys = ['cd3', 'cd4', 'cd8', 'cd19', 'nkCells'];
function active(entries: Array<{ date: string; markers: Record<string, number> }>, profile = 'EU', refOverrides: unknown = {}) {
  (state as { importedData: unknown }).importedData = { entries, refOverrides };
  state.unitSystem = profile;
  state.profileSex = null;
  state.profileDob = null;
  state.rangeMode = 'reference';
  invalidateActiveDataCache();
  return getActiveData();
}
function mapped(rawName: string, unit: string, mappedKey: string | null = null) {
  const rows: ImportReviewMarker[] = [{ rawName, unit, value: 1, mappedKey, matched: !!mappedKey }];
  reconcileImportMarkerMappings(rows);
  return rows[0]!;
}

describe('lymphocyte subset schema and import', () => {
  it('keeps subset identities contextual, with no invented optimal targets', () => {
    for (const [key, marker] of Object.entries(MARKER_SCHEMA.lymphocyteSubsets!.markers)) {
      expect(getBuiltinMarkerId(`lymphocyteSubsets.${key}`)).toBe(`gb:marker:${key}`);
      expect(marker).toMatchObject({ refMin: null, refMax: null, rangePolicy: 'contextual' });
      expect(OPTIMAL_RANGES[`lymphocyteSubsets.${key}`]).toBeUndefined();
    }
    expect(OPTIMAL_RANGES['calculatedRatios.cd4Cd8Ratio']).toBeUndefined();
    expect(OPTIMAL_RANGES['calculatedRatios.lmr']).toBeUndefined();
  });

  it.each(countKeys)('converts %s counts and laboratory bounds in both directions', key => {
    const dotKey = `lymphocyteSubsets.${key}`;
    for (const unit of ['cells/µL', 'cells/μl', 'cells/mcL', '/µl', 'cells/mm³', 'cells/mm^3', '10^6/L']) {
      expect(normalizeToSI(dotKey, 800, unit)).toBe(0.8);
      expect(convertImportValueUnit(dotKey, 800, unit, '10^9/l')).toBe(0.8);
      expect(convertImportValueUnit(dotKey, 0.8, '10^9/l', unit)).toBe(800);
    }
    expect(normalizeToSI(dotKey, 0.8, 'K/µL')).toBe(0.8);
    expect(normalizeToSI(dotKey, 0.8, '10^3/µl')).toBe(0.8);
    expect(normalizeToSI(dotKey, 800, '')).toBe(800); // Never guess missing units.
    expect(convertImportValueUnit(dotKey, 40, '%', '10^9/l')).toBeNull();
  });

  it.each(countKeys)('stores %s percentages on an explicit 0–100 scale', key => {
    const dotKey = `lymphocyteSubsets.${key}Pct`;
    expect(MARKER_SCHEMA.lymphocyteSubsets!.markers[`${key}Pct`]!.unit).toBe('%');
    expect(normalizeToSI(dotKey, 40, '%')).toBe(40);
    expect(normalizeToSI(dotKey, 0.5, '%')).toBe(0.5); // Small true percentages stay small.
    expect(normalizeToSI(dotKey, 0.4, 'fraction')).toBe(40);
    expect(convertImportValueUnit(dotKey, 0.4, '1', '%')).toBe(40);
    expect(convertImportValueUnit(dotKey, 40, '%', 'fraction')).toBe(0.4);
  });

  it.each([
    ['CD3', 'cd3'], ['CD4', 'cd4'], ['CD3+CD4+', 'cd4'],
    ['CD8', 'cd8'], ['CD3+CD8+', 'cd8'], ['CD19', 'cd19'],
    ['NK cells', 'nkCells'], ['CD16+CD56+', 'nkCells'], ['CD3− CD16+CD56+', 'nkCells'],
  ])('keeps %s counts and percentages on separate markers', (name, key) => {
    expect(mapped(name, 'cells/µL', `lymphocyteSubsets.${key}Pct`).mappedKey).toBe(`lymphocyteSubsets.${key}`);
    expect(mapped(name, '%', `lymphocyteSubsets.${key}`).mappedKey).toBe(`lymphocyteSubsets.${key}Pct`);
    expect(mapped(name, 'fraction').mappedKey).toBe(`lymphocyteSubsets.${key}Pct`);
  });

  it.each([
    ['CD4 (% of CD3+)', 'lymphocyteSubsets.cd4Pct'],
    ['CD4 (% CD3+)', 'lymphocyteSubsets.cd4Pct'],
    ['CD8 (percentage CD3+)', 'lymphocyteSubsets.cd8Pct'],
    ['CD4 (% T cells)', 'lymphocyteSubsets.cd4Pct'],
    ['CD8 (% of T cells)', 'lymphocyteSubsets.cd8Pct'],
    ['CD4 (% of WBC)', 'lymphocyteSubsets.cd4Pct'],
    ['CD3+CD16+CD56+', 'lymphocyteSubsets.nkCellsPct'],
    ['NKT cells', 'lymphocyteSubsets.nkCellsPct'],
    ['NK activity', 'lymphocyteSubsets.nkCellsPct'],
  ])('does not merge %s into a different denominator or assay', (name, key) => {
    expect(mapped(name, '%', key)).toMatchObject({ mappedKey: null, matched: false, suggestedKey: null });
  });

  it.each([
    ['CD3− CD16/CD56+', 'nkCells'],
    ['NK cells (CD3− CD16/CD56+) %', 'nkCells'],
    ['% CD3− CD16/CD56+', 'nkCells'],
    ['% CD3 (T cells)', 'cd3'],
    ['B % CD4', 'cd4'],
    ['CD4 (% lymphocytes)', 'cd4'],
  ])('preserves valid numerator and cell-group labels in %s', (name, key) => {
    expect(mapped(name, '%', `lymphocyteSubsets.${key}Pct`)).toMatchObject({
      mappedKey: `lymphocyteSubsets.${key}Pct`, matched: true,
    });
  });

  it.each([['CD4/CD8 ratio', 'cd4Cd8Ratio'], ['Helper/suppressor ratio', 'cd4Cd8Ratio'], ['LMR', 'lmr']])(
    'accepts a directly reported %s', (name, key) => {
      expect(mapped(name, '').mappedKey).toBe(`calculatedRatios.${key}`);
    },
  );
});

describe('subset projection and derived ratios', () => {
  it.each([['EU', 0.8, '10^9/l'], ['ANZ', 0.8, '10^9/L'], ['US', 800, 'cells/µL']] as const)(
    'projects %s counts and lab intervals together while preserving percentages and storage', (profile, value, unit) => {
      const markers = { 'lymphocyteSubsets.cd4': 0.8, 'lymphocyteSubsets.cd8': 0.4, 'lymphocyteSubsets.cd4Pct': 40 };
      const data = active([{ date: '2026-10-01', markers }], profile, {
        'lymphocyteSubsets.cd4': { refMin: 0.365, refMax: 1.437, refSource: 'lab' },
      });
      const cd4 = data.categories.lymphocyteSubsets!.markers.cd4!;
      expect(cd4).toMatchObject({ values: [value], unit, referenceRangeSource: 'lab' });
      expect(cd4.refMin).toBeCloseTo(profile === 'US' ? 365 : 0.365);
      expect(cd4.refMax).toBeCloseTo(profile === 'US' ? 1437 : 1.437);
      expect(data.categories.lymphocyteSubsets!.markers.cd4Pct).toMatchObject({ values: [40], unit: '%' });
      expect(data.categories.calculatedRatios!.markers.cd4Cd8Ratio!.values).toEqual([2]);
      expect(state.importedData.entries[0]!.markers).toEqual(markers);
    },
  );

  it('derives LMR directly from counts and preserves reported ratios', () => {
    const data = active([
      { date: '2026-09-01', markers: { 'lymphocyteSubsets.cd4': 0.8, 'lymphocyteSubsets.cd8': 0.3, 'differential.lymphocytes': 2.2, 'differential.monocytes': 0.4 } },
      { date: '2026-10-01', markers: { 'lymphocyteSubsets.cd4': 0.8, 'lymphocyteSubsets.cd8': 0.4, 'calculatedRatios.cd4Cd8Ratio': 1.99, 'differential.lymphocytes': 2.2, 'differential.monocytes': 0.4, 'calculatedRatios.lmr': 5.49 } },
    ]);
    const ratios = data.categories.calculatedRatios!.markers;
    expect(ratios.cd4Cd8Ratio!.values).toEqual([2.667, 1.99]);
    expect(ratios.lmr!.values).toEqual([5.5, 5.49]);
    expect(ratios.mlr!.values).toEqual([0.182, 0.182]);
  });

  it.each([[0.8, 0], [0.8, -1], [-0.8, 0.4], [Infinity, 0.4], [0.8, NaN]])(
    'does not derive ratios from invalid counts %s / %s', (n, d) => {
      const data = active([{ date: '2026-10-01', markers: { 'lymphocyteSubsets.cd4': n, 'lymphocyteSubsets.cd8': d, 'differential.lymphocytes': n, 'differential.monocytes': d } }]);
      expect(data.categories.calculatedRatios!.markers.cd4Cd8Ratio!.values).toEqual([null]);
      expect(data.categories.calculatedRatios!.markers.lmr!.values).toEqual([null]);
    },
  );

  it('does not combine dates or substitute percentages for missing absolute counts', () => {
    const data = active([
      { date: '2026-09-01', markers: { 'lymphocyteSubsets.cd4': 0.8, 'differential.lymphocytes': 2 } },
      { date: '2026-10-01', markers: { 'lymphocyteSubsets.cd8': 0.4, 'lymphocyteSubsets.cd4Pct': 40, 'lymphocyteSubsets.cd8Pct': 20, 'differential.monocytes': 0.4 } },
    ]);
    expect(data.categories.calculatedRatios!.markers.cd4Cd8Ratio!.values).toEqual([null, null]);
    expect(data.categories.calculatedRatios!.markers.lmr!.values).toEqual([null, null]);
  });

  it('provides the existing historical-baseline chat context for the new markers', () => {
    const data = active(['07', '08', '09', '10'].map((month, i) => ({
      date: `2026-${month}-01`, markers: { 'lymphocyteSubsets.cd4': 0.6 + i * 0.1, 'lymphocyteSubsets.cd8': 0.4 },
    })), 'US');
    const cd4 = data.categories.lymphocyteSubsets!.markers.cd4!;
    expect(cd4.personalBaselines?.[3]).toMatchObject({ median: 700, count: 3 });
    expect(formatMarkerValuesForChat(cd4, data)).toContain('Personal baseline: 700');
    expect(CHAT_SYSTEM_PROMPT).toContain('HIV-cohort thresholds and research Immune Health Grades are not general-population targets');
    expect(CHAT_SYSTEM_PROMPT).toContain('LMR and MLR are reciprocal views');
  });
});
