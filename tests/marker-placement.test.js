import { describe, expect, it } from 'vitest';

import { deriveLegacyCustomMarkerId } from '../js/custom-marker-identity.js';
import { mergeImportedData } from '../js/data-merge.js';
import { getBuiltinMarkerId } from '../js/marker-schema.js';
import {
  applyMarkerPlacements,
  clearMarkerPlacement,
  getMarkerPlacementPlan,
  getMarkerStorageDotKey,
  getMarkerStorageViewId,
  migrateMarkerPlacements,
  resolveMarkerIdentity,
  resolveActiveMarkerPath,
  resolveMarkerStorageViewId,
  setMarkerPlacement,
} from '../js/marker-placement.js';

describe('marker category placement engine', () => {
  it('stores placement by stable identity without re-keying user data', () => {
    const dotKey = 'oatEnergy.acetoaceticAcid';
    const markerId = 'custom:acetoacetate';
    const profile = {
      entries: [{ date: '2026-08-01', markers: { [dotKey]: 12.5 } }],
      customMarkers: {
        [dotKey]: { markerId, name: 'Acetoacetic Acid' },
        'energyMetabolism.atp': { markerId: 'custom:atp', name: 'ATP' },
      },
      refOverrides: { [dotKey]: { refMax: 10 } },
      markerNotes: { [dotKey]: 'Retest fasting' },
      markerLabels: { [dotKey]: 'Acetoacetate' },
      manualValues: { [`${dotKey}:2026-08-01`]: true },
      markerValueNotes: { [`${dotKey}:2026-08-01`]: 'OAT panel' },
    };
    const storedDataBefore = structuredClone(profile);

    expect(setMarkerPlacement(profile, markerId, 'energyMetabolism')).toMatchObject({
      ok: true,
      changed: true,
      markerId,
      storageDotKey: dotKey,
      categoryKey: 'energyMetabolism',
    });
    expect(profile.markerPlacements).toEqual({
      [markerId]: { categoryKey: 'energyMetabolism' },
    });
    expect({ ...profile, markerPlacements: undefined }).toEqual({
      ...storedDataBefore,
      markerPlacements: undefined,
    });

    expect(clearMarkerPlacement(profile, dotKey)).toMatchObject({ ok: true, changed: true });
    expect(profile.markerPlacements).toEqual({});
  });

  it('supports built-in markers and removes a redundant native assignment', () => {
    const markerId = getBuiltinMarkerId('biochemistry.glucose');
    const profile = { customMarkers: {}, markerPlacements: {} };

    expect(setMarkerPlacement(profile, 'biochemistry.glucose', 'lipids')).toMatchObject({
      ok: true,
      markerId,
      storageDotKey: 'biochemistry.glucose',
    });
    expect(getMarkerPlacementPlan(profile)[markerId]).toMatchObject({
      effectiveCategoryKey: 'lipids',
      reason: 'placed',
    });

    expect(setMarkerPlacement(profile, markerId, 'biochemistry')).toMatchObject({
      ok: true,
      changed: true,
      categoryKey: 'biochemistry',
    });
    expect(profile.markerPlacements).toEqual({});
    expect(resolveMarkerIdentity(profile, 'lipids.totalCholesterol')).toMatchObject({
      markerId: getBuiltinMarkerId('lipids.cholesterol'),
      storageDotKey: 'lipids.cholesterol',
    });
  });

  it('falls back safely for unavailable, incompatible, calculated, and colliding destinations', () => {
    const profile = {
      customMarkers: {
        'regularPanel.sample': { markerId: 'custom:regular', name: 'Regular' },
        'singlePanel.sample': { markerId: 'custom:single', name: 'Single', singlePoint: true },
        'energy.glucose': { markerId: 'custom:energy_glucose', name: 'Other Glucose' },
      },
      markerPlacements: {},
    };

    expect(setMarkerPlacement(profile, 'custom:regular', 'missingPanel')).toMatchObject({
      ok: false,
      reason: 'unknown-category',
    });
    expect(setMarkerPlacement(profile, 'custom:regular', 'singlePanel')).toMatchObject({
      ok: false,
      reason: 'category-mode-mismatch',
    });
    expect(setMarkerPlacement(profile, 'custom:regular', 'calculatedRatios')).toMatchObject({
      ok: false,
      reason: 'calculated-category',
    });
    expect(setMarkerPlacement(profile, 'biochemistry.glucose', 'energy')).toMatchObject({
      ok: false,
      reason: 'marker-key-collision',
    });
    expect(profile.markerPlacements).toEqual({});
  });

  it('places calculated markers in regular categories after calculation', () => {
    const profile = { customMarkers: {}, markerPlacements: {} };

    expect(setMarkerPlacement(profile, 'calculatedRatios.tgHdlRatio', 'lipids')).toMatchObject({
      ok: true,
      storageDotKey: 'calculatedRatios.tgHdlRatio',
      categoryKey: 'lipids',
    });
    expect(getMarkerPlacementPlan(profile)[getBuiltinMarkerId('calculatedRatios.tgHdlRatio')])
      .toMatchObject({ effectiveCategoryKey: 'lipids', reason: 'placed' });
    expect(setMarkerPlacement(profile, 'biochemistry.glucose', 'calculatedRatios'))
      .toMatchObject({ ok: false, reason: 'calculated-category' });
  });

  it('preserves forward metadata and ignores unresolved imported assignments', () => {
    const unknownId = 'custom:arrives_later';
    const profile = {
      customMarkers: {},
      markerPlacements: {
        [unknownId]: { categoryKey: 'futureCategory', futureField: { preserve: true } },
        [getBuiltinMarkerId('biochemistry.glucose')]: 'futureCategory',
      },
    };

    migrateMarkerPlacements(profile);

    expect(profile.markerPlacements[unknownId]).toEqual({
      categoryKey: 'futureCategory',
      futureField: { preserve: true },
    });
    expect(profile.markerPlacements[getBuiltinMarkerId('biochemistry.glucose')])
      .toEqual({ categoryKey: 'futureCategory' });
    expect(getMarkerPlacementPlan(profile)[getBuiltinMarkerId('biochemistry.glucose')])
      .toMatchObject({ effectiveCategoryKey: 'biochemistry', reason: 'unknown-category' });
  });

  it('projects marker objects while retaining their immutable addresses', () => {
    const markerId = getBuiltinMarkerId('biochemistry.glucose');
    const categories = {
      biochemistry: { markers: { glucose: { name: 'Glucose', values: [5.2] } } },
      lipids: { markers: {} },
    };
    const profile = {
      customMarkers: {},
      markerPlacements: { [markerId]: { categoryKey: 'lipids' } },
    };

    applyMarkerPlacements(categories, profile);

    expect(categories.biochemistry.markers.glucose).toBeUndefined();
    expect(categories.lipids.markers.glucose).toMatchObject({
      markerId,
      storageDotKey: 'biochemistry.glucose',
      nativeCategoryKey: 'biochemistry',
      displayCategoryKey: 'lipids',
      values: [5.2],
    });
    expect(getMarkerStorageDotKey(categories.lipids.markers.glucose, 'lipids_glucose'))
      .toBe('biochemistry.glucose');
    expect(getMarkerStorageViewId(categories.lipids.markers.glucose, 'lipids_glucose'))
      .toBe('biochemistry_glucose');
    expect(resolveMarkerStorageViewId(categories, 'lipids_glucose'))
      .toBe('biochemistry_glucose');
    expect(resolveMarkerStorageViewId(categories, 'biochemistry_glucose'))
      .toBe('biochemistry_glucose');
    expect(resolveActiveMarkerPath(categories, 'biochemistry', 'glucose')).toMatchObject({
      categoryKey: 'lipids',
      marker: { storageDotKey: 'biochemistry.glucose' },
    });
  });

  it('derives the same identity for an unmigrated legacy custom marker', () => {
    const dotKey = 'legacyPanel.marker';
    const profile = {
      customMarkers: {
        [dotKey]: { name: 'Legacy marker' },
        'destination.anchor': { markerId: 'custom:anchor', name: 'Anchor' },
      },
      markerPlacements: {
        [deriveLegacyCustomMarkerId(dotKey)]: { categoryKey: 'destination' },
      },
    };

    expect(getMarkerPlacementPlan(profile)[deriveLegacyCustomMarkerId(dotKey)])
      .toMatchObject({ storageDotKey: dotKey, effectiveCategoryKey: 'destination' });
  });

  it('composes independent placement maps while retaining the local conflict winner', () => {
    const glucoseId = getBuiltinMarkerId('biochemistry.glucose');
    const sodiumId = getBuiltinMarkerId('electrolytes.sodium');
    const merged = mergeImportedData(
      { markerPlacements: { [glucoseId]: { categoryKey: 'lipids' } } },
      {
        markerPlacements: {
          [glucoseId]: { categoryKey: 'diabetes' },
          [sodiumId]: { categoryKey: 'biochemistry' },
        },
      },
    );

    expect(merged.markerPlacements).toEqual({
      [glucoseId]: { categoryKey: 'lipids' },
      [sodiumId]: { categoryKey: 'biochemistry' },
    });
  });
});
