import { describe, expect, it } from 'vitest';

import { MARKER_SCHEMA, normalizeToSI } from '../js/schema.js';
import {
  ANZ_UNIT_OVERRIDES,
  auditUnitProfileCoverage,
  convertCanonicalToDisplay,
  convertCanonicalToInputUnit,
  convertDisplayToCanonical,
  convertUnitInputToCanonical,
  getAlternateUnitForProfile,
  getMarkerInputUnits,
  getUnitProfileLabel,
  normalizeUnitProfile,
  resolveMarkerUnitProfile,
} from '../js/unit-profiles.js';

const builtInCount = Object.values(MARKER_SCHEMA)
  .reduce((total, category) => total + Object.keys(category.markers || {}).length, 0);

describe('schema-wide unit profiles', () => {
  it('resolves every built-in marker in every profile', () => {
    expect(builtInCount).toBe(196);
    for (const profile of ['EU', 'ANZ', 'US']) {
      const rows = auditUnitProfileCoverage(profile);
      expect(rows).toHaveLength(builtInCount);
      for (const row of rows) {
        expect(row.profile).toBe(profile);
        expect(typeof row.unit).toBe('string');
        if (row.canonicalUnit) expect(row.unit).not.toBe('');
      }
    }
  });

  it('keeps explicit ANZ overrides attached to real schema markers', () => {
    for (const dotKey of Object.keys(ANZ_UNIT_OVERRIDES)) {
      const [categoryKey, markerKey] = dotKey.split('.');
      expect(MARKER_SCHEMA[categoryKey]?.markers?.[markerKey], dotKey).toBeTruthy();
      expect(resolveMarkerUnitProfile(dotKey, 'ANZ').conversion, dotKey).toBeTruthy();
    }
  });

  it.each([
    ['biochemistry.alt', 0.5, 30, 'U/L'],
    ['biochemistry.egfr', 1.5, 90, 'mL/min/1.73m²'],
    ['biochemistry.uricAcid', 400, 0.4, 'mmol/L'],
    ['hormones.prolactin', 10, 212, 'mIU/L'],
    ['hormones.igf1', 100, 13.07, 'nmol/L'],
    ['diabetes.cPeptide', 1, 0.331, 'nmol/L'],
    ['boneMetabolism.p1np', 0.05, 50, 'ng/L'],
    ['urinalysis.totalProtein', 0.2, 200, 'mg/L'],
    ['thyroid.tsh', 2.5, 2.5, 'mIU/L'],
    ['hormones.lh', 6, 6, 'IU/L'],
    ['tumorMarkers.afp', 8, 8, 'kIU/L'],
  ])('converts %s to its ANZ display unit and back', (dotKey, canonical, displayed, unit) => {
    expect(resolveMarkerUnitProfile(dotKey, 'ANZ').unit).toBe(unit);
    expect(convertCanonicalToDisplay(dotKey, canonical, 'ANZ')).toBeCloseTo(displayed, 6);
    expect(convertDisplayToCanonical(dotKey, displayed, 'ANZ')).toBeCloseTo(canonical, 6);
  });

  it('round-trips every ANZ conversion across the complete schema', () => {
    for (const row of auditUnitProfileCoverage('ANZ')) {
      const canonical = 7.125;
      const displayed = convertCanonicalToDisplay(row.dotKey, canonical, 'ANZ');
      const restored = convertDisplayToCanonical(row.dotKey, displayed, 'ANZ');
      expect(restored, row.dotKey).toBeCloseTo(canonical, 4);
    }
  });

  it('preserves custom-marker units instead of guessing a regional conversion', () => {
    const custom = resolveMarkerUnitProfile('customPanel.myMarker', 'ANZ', 'µg/g creatinine');
    expect(custom).toMatchObject({
      unit: 'µg/g creatinine',
      canonicalUnit: 'µg/g creatinine',
      conversion: null,
      isIdentity: true,
    });
    expect(convertCanonicalToDisplay('customPanel.myMarker', 12.5, 'ANZ', custom.unit)).toBe(12.5);
  });

  it('accepts active, canonical, and compatible lab-report units for entry/import', () => {
    const units = getMarkerInputUnits('boneMetabolism.p1np', 'ANZ');
    expect(units[0]).toBe('ng/L');
    expect(units).toEqual(expect.arrayContaining(['ng/L', 'ng/ml']));
    expect(convertUnitInputToCanonical('boneMetabolism.p1np', 50, 'ng/L', 'ANZ')).toBeCloseTo(0.05, 6);
    expect(convertCanonicalToInputUnit('boneMetabolism.p1np', 0.05, 'ng/L', 'ANZ')).toBeCloseTo(50, 6);
    expect(convertUnitInputToCanonical('biochemistry.alt', 30, 'U/L', 'EU')).toBeCloseTo(0.5, 6);

    expect(normalizeToSI('boneMetabolism.p1np', 50, 'ng/L')).toBeCloseTo(0.05, 6);
    expect(normalizeToSI('urinalysis.totalProtein', 200, 'mg/L')).toBeCloseTo(0.2, 6);
    expect(normalizeToSI('thyroid.tsh', 2.5, 'mIU/L')).toBeCloseTo(2.5, 6);
    expect(normalizeToSI('tumorMarkers.afp', 8, 'kIU/L')).toBeCloseTo(8, 6);
  });

  it('selects a useful alternate unit for all three display profiles', () => {
    expect(getAlternateUnitForProfile('biochemistry.uricAcid', 400, 'EU')).toMatchObject({ unit: 'mg/dl' });
    expect(getAlternateUnitForProfile('biochemistry.uricAcid', 0.4, 'ANZ')).toMatchObject({ value: 400 });
    expect(getAlternateUnitForProfile('biochemistry.uricAcid', 6.724, 'US')).toMatchObject({ unit: 'µmol/l' });
  });

  it('normalizes persisted values and exposes readable labels', () => {
    expect(normalizeUnitProfile('ANZ')).toBe('ANZ');
    expect(normalizeUnitProfile('anz')).toBe('ANZ');
    expect(normalizeUnitProfile('unexpected')).toBe('EU');
    expect(getUnitProfileLabel('ANZ')).toBe('Australia / New Zealand');
  });
});
