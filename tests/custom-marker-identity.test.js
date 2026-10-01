import { describe, expect, it } from 'vitest';

import {
  createCustomMarkerId,
  deriveLegacyCustomMarkerId,
  getCustomMarkerDotKey,
  getCustomMarkerId,
  migrateCustomMarkerIdentities,
  resolveCustomMarkerDotKey,
} from '../js/custom-marker-identity.js';
import { mergeImportedData } from '../js/data-merge.js';
import { migrateProfileData } from '../js/profile-data-migrations.js';
import { isCustomMarkerId } from '../js/marker-schema.js';

describe('stable custom marker identity contract', () => {

  it('adds ids without re-keying any user data and survives JSON exchange', () => {
    const dotKey = 'oatEnergy.acetoaceticAcid';
    const profile = {
      entries: [{ date: '2026-07-01', markers: { [dotKey]: 12.5 } }],
      customMarkers: {
        [dotKey]: { name: 'Acetoacetic Acid', unit: 'mmol/mol creatinine' },
      },
      refOverrides: { [dotKey]: { refMax: 10 } },
      markerNotes: { [dotKey]: 'Retest fasting' },
      markerLabels: { [dotKey]: 'Acetoacetate' },
      manualValues: { [`${dotKey}:2026-07-01`]: true },
      markerValueNotes: { [`${dotKey}:2026-07-01`]: 'Imported from OAT' },
    };
    const markerDataBefore = structuredClone({
      entries: profile.entries,
      refOverrides: profile.refOverrides,
      markerNotes: profile.markerNotes,
      markerLabels: profile.markerLabels,
      manualValues: profile.manualValues,
      markerValueNotes: profile.markerValueNotes,
    });

    migrateProfileData(profile);
    const markerId = profile.customMarkers[dotKey].markerId;
    const exchanged = JSON.parse(JSON.stringify(profile));
    migrateProfileData(exchanged);

    expect(markerId).toBe(deriveLegacyCustomMarkerId(dotKey));
    expect({
      entries: profile.entries,
      refOverrides: profile.refOverrides,
      markerNotes: profile.markerNotes,
      markerLabels: profile.markerLabels,
      manualValues: profile.manualValues,
      markerValueNotes: profile.markerValueNotes,
    }).toEqual(markerDataBefore);
    expect(exchanged.customMarkers[dotKey].markerId).toBe(markerId);
  });

  it('preserves a custom reference range when the custom key is adopted as a built-in', () => {
    const key = 'hematology.immatureGranulocytesPct';
    const profile = {
      entries: [{ date: '2026-07-01', markers: { [key]: 0.3 } }],
      customMarkers: { [key]: { name: 'IG %', unit: '%', refMin: 0.1, refMax: 0.9 } },
    };

    migrateProfileData(profile);

    expect(profile.customMarkers[key]).toBeUndefined();
    expect(profile.entries[0].markers[key]).toBe(0.3);
    expect(profile.refOverrides?.[key]).toEqual({ refMin: 0.1, refMax: 0.9 });
  });

  it('keeps an existing override and a non-differing custom range during adoption', () => {
    const key = 'hematology.immatureGranulocytesPct';
    const withOverride = {
      customMarkers: { [key]: { name: 'IG %', unit: '%', refMin: 0.1, refMax: 0.9 } },
      refOverrides: { [key]: { refMin: 0.5, refMax: 3 } },
    };
    const sameAsStandard = {
      customMarkers: { [key]: { name: 'IG %', unit: '%', refMin: null, refMax: null } },
    };

    migrateProfileData(withOverride);
    migrateProfileData(sameAsStandard);

    expect(withOverride.refOverrides[key]).toEqual({ refMin: 0.5, refMax: 3 });
    expect(sameAsStandard.refOverrides?.[key]).toBeUndefined();
  });

  it.each([false, true])('preserves reference ranges with import snapshot=%s and an optimal-only override', (withSnapshot) => {
    const key = 'hematology.immatureGranulocytesPct';
    const profile = {
      entries: [{ date: '2026-07-01', markers: { [key]: 1.2 } }],
      customMarkers: { [key]: { name: 'IG %', unit: '%', refMin: 0.1, refMax: 0.9 } },
      refOverrides: { [key]: { optimalMin: 0.1, optimalMax: 0.5, optimalSource: 'manual' } },
      importSnapshots: withSnapshot ? [{
        id: 'report-1', date: '2026-07-01',
        markers: [{ suggestedKey: key, value: 1.2, unit: '%', refMin: 0.1, refMax: 0.9 }],
      }] : [],
    };

    migrateProfileData(profile);

    expect(profile.customMarkers[key]).toBeUndefined();
    expect(profile.entries[0].markers[key]).toBe(1.2);
    expect(profile.refOverrides[key]).toEqual({
      optimalMin: 0.1, optimalMax: 0.5, optimalSource: 'manual', refMin: 0.1, refMax: 0.9,
    });
    if (withSnapshot) expect(profile.importSnapshots[0].markers[0]).toMatchObject({ mappedKey: key, suggestedKey: null, matched: true });
    const once = structuredClone(profile);
    migrateProfileData(profile);
    expect(profile).toEqual(once);
  });

  it('preserves snapshot-backed custom bounds without a pre-existing override', () => {
    const key = 'hematology.immatureGranulocytesPct';
    const profile = {
      entries: [{ date: '2026-07-01', markers: { [key]: 1.2 } }],
      customMarkers: { [key]: { name: 'IG %', unit: '%', refMin: 0.1, refMax: 0.9 } },
      importSnapshots: [{ id: 'report-1', date: '2026-07-01', markers: [{ mappedKey: key, value: 1.2, unit: '%' }] }],
    };
    migrateProfileData(profile);
    expect(profile.refOverrides[key]).toEqual({ refMin: 0.1, refMax: 0.9 });
    expect(profile.customMarkers[key]).toBeUndefined();
    expect(profile.entries[0].markers[key]).toBe(1.2);
  });

  it('fills a missing bound without overwriting an explicit null bound or metadata', () => {
    const key = 'hematology.immatureGranulocytesPct';
    const profile = {
      customMarkers: { [key]: { name: 'IG %', unit: '%', refMin: 0.1, refMax: 0.9 } },
      refOverrides: { [key]: { refMin: null, refSource: 'manual', labRefMax: 0.8 } },
    };
    migrateProfileData(profile);
    expect(profile.refOverrides[key]).toEqual({ refMin: null, refMax: 0.9, refSource: 'manual', labRefMax: 0.8 });
  });

  it('keeps an open-ended custom range and does not infer zero from blank bounds', () => {
    const key = 'hematology.reticulocytesPct';
    const profile = { customMarkers: { [key]: { name: 'Reticulocytes %', unit: '%', refMin: null, refMax: ' ' } } };
    migrateProfileData(profile);
    expect(profile.refOverrides[key]).toEqual({ refMin: null });
  });

  it('does not copy incompatible custom units into canonical reference overrides', () => {
    const key = 'hematology.immatureGranulocytesPct';
    const profile = { customMarkers: { [key]: { name: 'IG', unit: '10^9/l', refMin: 0, refMax: 0.1 } } };
    migrateProfileData(profile);
    expect(profile.customMarkers[key]).toMatchObject({ unit: '10^9/l', refMax: 0.1 });
    expect(profile.refOverrides?.[key]).toBeUndefined();
  });

});
