// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { normalizeToSI } from '../js/schema.js';
import { convertImportValueUnit } from '../js/pdf-import-unit-conversions.js';
import { getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { state } from '../js/state.js';

const key = 'thyroid.t3total';
const original = { importedData: state.importedData, unitSystem: state.unitSystem, profileSex: state.profileSex, profileDob: state.profileDob };
afterEach(() => { Object.assign(state, original); invalidateActiveDataCache(); });

// Total T3 (MW 650.98 g/mol): 1 nmol/L = 65.1 ng/dL.
describe('Total T3 ng/dL conversion', () => {
  it('normalizes a US ng/dL report value to nmol/L', () => {
    expect(normalizeToSI(key, 110, 'ng/dL')).toBeCloseTo(1.689, 3);
    expect(convertImportValueUnit(key, 1.69, 'nmol/l', 'ng/dl')).toBeCloseTo(110.1, 1);
  });

  it('projects stored nmol/L values and ranges into US ng/dL', () => {
    (state as { importedData: unknown }).importedData = { entries: [{ date: '2026-10-01', markers: { [key]: 1.69 } }] };
    state.unitSystem = 'US';
    state.profileSex = null;
    state.profileDob = null;
    invalidateActiveDataCache();
    const marker = getActiveData().categories.thyroid!.markers.t3total!;
    expect(marker.unit).toBe('ng/dl');
    expect(marker.values![0]).toBeCloseTo(110.1, 1);
    expect(marker.refMin).toBeCloseTo(84.7, 1);
    expect(marker.refMax).toBeCloseTo(201.9, 1);
  });
});
