// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { normalizeToSI } from '../js/schema.js';
import { convertImportValueUnit, getValidUnitsForMarker } from '../js/pdf-import-unit-conversions.js';
import { getActiveData, invalidateActiveDataCache, applyUnitConversion } from '../js/data.js';
import { state } from '../js/state.js';
import { getMarkerHit } from '../js/biology-score-engine.js';
import { convertDisplayToCanonical, getMarkerInputUnits } from '../js/unit-profiles.js';

const key = 'diabetes.cPeptide';
const original = { importedData: state.importedData, unitSystem: state.unitSystem, profileSex: state.profileSex, profileDob: state.profileDob };
afterEach(() => { Object.assign(state, original); invalidateActiveDataCache(); });

describe('C-peptide report and display units', () => {
  it.each(['pmol/L', 'pmol/l', ' pmol / L '])('normalizes %s with the marker-specific molecular conversion', unit => {
    expect(normalizeToSI(key, 662, unit)).toBe(2);
    expect(normalizeToSI(key, 165.5, unit)).toBe(0.5);
    expect(convertImportValueUnit(key, 662, unit, 'ng/ml')).toBe(2);
    expect(convertImportValueUnit(key, 662, unit, 'nmol/l')).toBe(0.662);
    expect(convertImportValueUnit(key, 2, 'µg/l', unit)).toBe(662);
  });

  it('offers picomoles in import review and as the first EU manual-entry unit', () => {
    expect(getValidUnitsForMarker(key)).toContain('pmol/l');
    expect(getMarkerInputUnits(key, 'EU')[0]).toBe('pmol/L');
    expect(convertDisplayToCanonical(key, 662, 'EU')).toBe(2);
    expect(normalizeToSI(key, 0.662, 'nmol/L')).toBe(2);
    expect(normalizeToSI(key, 2, 'ng/ml')).toBe(2);
  });

  it.each([['EU', 'pmol/L', 662], ['ANZ', 'nmol/L', 0.662], ['US', 'ng/ml', 2]] as const)(
    'projects %s values and ranges while leaving storage and scoring canonical', (profile, unit, value) => {
      (state as { importedData: unknown }).importedData = { entries: [{ date: '2026-10-01', markers: { [key]: 2, 'biochemistry.glucose': 5 } }] };
      state.unitSystem = profile;
      state.profileSex = null;
      state.profileDob = null;
      invalidateActiveDataCache();
      const active = getActiveData();
      const marker = active.categories.diabetes!.markers.cPeptide!;
      expect(getMarkerHit(active, key)).toMatchObject({ value, canonicalValue: 2 });
      expect(marker.unit).toBe(unit);
      expect(marker.values).toEqual([value]);
      const factor = value / 2;
      expect(marker.refMin).toBeCloseTo(0.8 * factor, 2);
      expect(marker.refMax).toBe(profile === 'EU' ? 1026 : profile === 'ANZ' ? 1.026 : 3.1);
      if (profile !== 'US') expect(marker.canonicalScoring).toMatchObject({ unit: 'µg/l', values: [2], refMin: 0.8, refMax: 3.1 });
      expect(state.importedData.entries[0]!.markers).toEqual({ [key]: 2, 'biochemistry.glucose': 5 });
    });

  it('projects every EU range shape and preserves canonical precision and null bounds', () => {
    const marker = { unit: 'µg/l', values: [2, null], refMin: 0.5, refMax: 3,
      optimalMin: 0.8, optimalMax: 2.5,
      phaseRefRanges: [{ min: 0.5, max: 3, label: 'phase' }, null],
      contextRefRanges: [{ min: null, max: 3, label: 'context' }],
      contextOptimalRanges: [{ min: 0.8, max: null, label: 'guide' }] };
    const canonical = structuredClone(marker);
    const fixture = { dates: ['2026-10-01', '2026-10-02'], categories: { diabetes: { markers: { cPeptide: marker } } } };
    (applyUnitConversion as unknown as (data: typeof fixture, profile: string) => void)(fixture, 'EU');
    expect(marker).toMatchObject({ unit: 'pmol/L', values: [662, null], refMin: 165.5, refMax: 993,
      optimalMin: 264.8, optimalMax: 827.5,
      phaseRefRanges: [{ min: 165.5, max: 993, label: 'phase' }, null],
      contextRefRanges: [{ min: null, max: 993, label: 'context' }],
      contextOptimalRanges: [{ min: 264.8, max: null, label: 'guide' }],
      canonicalScoring: { ...canonical, dateIndices: { '2026-10-01': 0, '2026-10-02': 1 } } });
  });
});
