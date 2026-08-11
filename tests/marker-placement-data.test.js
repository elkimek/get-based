// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { getBuiltinMarkerId } from '../js/marker-schema.js';
import { state } from '../js/state.js';

const previousState = {
  importedData: state.importedData,
  profileSex: state.profileSex,
  profileDob: state.profileDob,
  unitSystem: state.unitSystem,
};

afterEach(() => {
  state.importedData = previousState.importedData;
  state.profileSex = previousState.profileSex;
  state.profileDob = previousState.profileDob;
  state.unitSystem = previousState.unitSystem;
  invalidateActiveDataCache();
});

describe('active marker placement projection', () => {
  it('moves built-in and custom markers only after native values and conversions resolve', () => {
    const customDotKey = 'oatEnergy.acetoaceticAcid';
    const customMarkerId = 'custom:acetoacetate';
    const glucoseMarkerId = getBuiltinMarkerId('biochemistry.glucose');
    state.importedData = {
      entries: [{
        date: '2026-08-01',
        markers: {
          'biochemistry.glucose': 5.2,
          [customDotKey]: 12.5,
        },
      }],
      customMarkers: {
        [customDotKey]: {
          markerId: customMarkerId,
          name: 'Acetoacetic Acid',
          unit: 'mmol/mol creatinine',
          refMax: 10,
          categoryLabel: 'OAT Energy',
        },
      },
      markerPlacements: {
        [glucoseMarkerId]: { categoryKey: 'lipids' },
        [customMarkerId]: { categoryKey: 'biochemistry' },
      },
      markerNotes: { [customDotKey]: 'Keep this address' },
    };
    state.profileSex = null;
    state.profileDob = null;
    state.unitSystem = 'US';
    invalidateActiveDataCache();

    const data = getActiveData();

    expect(data.categories.biochemistry.markers.glucose).toBeUndefined();
    expect(data.categories.lipids.markers.glucose).toMatchObject({
      markerId: glucoseMarkerId,
      storageDotKey: 'biochemistry.glucose',
      values: [93.69],
      unit: 'mg/dl',
    });
    expect(data.categories.oatEnergy.markers.acetoaceticAcid).toBeUndefined();
    expect(data.categories.biochemistry.markers.acetoaceticAcid).toMatchObject({
      markerId: customMarkerId,
      storageDotKey: customDotKey,
      values: [12.5],
    });
    expect(state.importedData.entries[0].markers).toEqual({
      'biochemistry.glucose': 5.2,
      [customDotKey]: 12.5,
    });
    expect(state.importedData.markerNotes).toEqual({ [customDotKey]: 'Keep this address' });
  });
});
