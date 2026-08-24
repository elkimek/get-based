// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { renderDisplaySettingsPanel } from '../js/settings-display-panel.js';
import { state } from '../js/state.js';

const original = {
  importedData: state.importedData,
  profileSex: state.profileSex,
  profileDob: state.profileDob,
  unitSystem: state.unitSystem,
};

afterEach(() => {
  Object.assign(state, original);
  invalidateActiveDataCache();
});

describe('ANZ unit profile integration', () => {
  it('projects canonical entries through the active data pipeline without mutating storage', () => {
    state.importedData = {
      entries: [{
        date: '2026-08-20',
        markers: {
          'biochemistry.alt': 0.5,
          'hormones.igf1': 100,
          'diabetes.cPeptide': 1,
          'customPanel.myMarker': 12.34567,
        },
      }],
      customMarkers: {
        'customPanel.myMarker': {
          name: 'My marker',
          unit: 'µg/g creatinine',
          refMin: 2,
          refMax: 10,
          categoryLabel: 'Custom panel',
        },
      },
    };
    state.profileSex = null;
    state.profileDob = null;
    state.unitSystem = 'ANZ';
    invalidateActiveDataCache();

    const data = getActiveData();
    expect(data.categories.biochemistry.markers.alt).toMatchObject({ unit: 'U/L', values: [30] });
    expect(data.categories.hormones.markers.igf1).toMatchObject({ unit: 'nmol/L', values: [13.07] });
    expect(data.categories.diabetes.markers.cPeptide).toMatchObject({ unit: 'nmol/L', values: [0.331] });
    expect(data.categories.customPanel.markers.myMarker).toMatchObject({
      unit: 'µg/g creatinine',
      values: [12.34567],
    });
    expect(state.importedData.entries[0].markers).toEqual({
      'biochemistry.alt': 0.5,
      'hormones.igf1': 100,
      'diabetes.cPeptide': 1,
      'customPanel.myMarker': 12.34567,
    });
  });

  it('renders all three profiles and explains that the preference is display-only', () => {
    state.unitSystem = 'ANZ';
    const html = renderDisplaySettingsPanel(true);
    expect(html).toContain('data-unit="EU"');
    expect(html).toContain('data-unit="ANZ"');
    expect(html).toContain('data-unit="US"');
    expect(html).toContain('Australia / NZ');
    expect(html).toMatch(/unit-toggle-btn active[^>]*data-unit="ANZ"/);
    expect(html).toContain('Your original data remains unchanged.');
  });
});
