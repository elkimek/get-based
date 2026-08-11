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
  it('creates opaque category-independent ids for newly authored markers', () => {
    const first = createCustomMarkerId();
    const second = createCustomMarkerId({ existing: { markerId: first } });

    expect(isCustomMarkerId(first)).toBe(true);
    expect(isCustomMarkerId(second)).toBe(true);
    expect(second).not.toBe(first);
    expect(first).not.toContain('category');
    expect(first).not.toContain('marker');
  });

  it('backfills legacy definitions deterministically and idempotently', () => {
    const original = {
      'urineAminoAcids.acetoaceticAcid': {
        name: 'Acetoacetic Acid',
        unit: 'mmol/mol creatinine',
        futureField: { preserve: true },
      },
      'antioxidants.glutathione': { name: 'Glutathione' },
    };
    const firstDevice = structuredClone(original);
    const secondDevice = structuredClone(original);

    migrateCustomMarkerIdentities(firstDevice);
    migrateCustomMarkerIdentities(secondDevice);
    const firstPass = structuredClone(firstDevice);
    migrateCustomMarkerIdentities(firstDevice);

    expect(firstDevice).toEqual(firstPass);
    expect(secondDevice).toEqual(firstDevice);
    expect(firstDevice['urineAminoAcids.acetoaceticAcid']).toMatchObject({
      markerId: deriveLegacyCustomMarkerId('urineAminoAcids.acetoaceticAcid'),
      futureField: { preserve: true },
    });
  });

  it('preserves valid ids and deterministically repairs duplicates and collisions', () => {
    const collidingLegacyId = deriveLegacyCustomMarkerId('a.first');
    const customMarkers = {
      'a.first': { name: 'First' },
      'b.owner': { markerId: 'custom:shared', name: 'Owner' },
      'c.duplicate': { markerId: 'custom:shared', name: 'Duplicate' },
      'd.invalid': { markerId: 'not a custom id', name: 'Invalid' },
      'z.reserved': { markerId: collidingLegacyId, name: 'Reserved' },
    };

    migrateCustomMarkerIdentities(customMarkers);

    expect(customMarkers['z.reserved'].markerId).toBe(collidingLegacyId);
    expect(customMarkers['a.first'].markerId).toBe(`${collidingLegacyId}_2`);
    expect(customMarkers['b.owner'].markerId).toBe('custom:shared');
    expect(customMarkers['c.duplicate'].markerId)
      .toBe(deriveLegacyCustomMarkerId('c.duplicate'));
    expect(customMarkers['d.invalid'].markerId)
      .toBe(deriveLegacyCustomMarkerId('d.invalid'));
    expect(new Set(Object.values(customMarkers).map(definition => definition.markerId)).size)
      .toBe(Object.keys(customMarkers).length);
  });

  it('resolves both ids and dot keys while preserving identity across a future move', () => {
    const markerId = 'custom:fixed_identity';
    const definition = { markerId, name: 'Acetoacetic Acid' };
    let customMarkers = { 'urineAminoAcids.acetoaceticAcid': definition };

    expect(getCustomMarkerId(customMarkers, 'urineAminoAcids.acetoaceticAcid')).toBe(markerId);
    expect(getCustomMarkerDotKey(customMarkers, markerId))
      .toBe('urineAminoAcids.acetoaceticAcid');
    expect(resolveCustomMarkerDotKey(customMarkers, 'urineAminoAcids.acetoaceticAcid'))
      .toBe('urineAminoAcids.acetoaceticAcid');

    customMarkers = { 'energyMetabolism.acetoaceticAcid': definition };
    migrateCustomMarkerIdentities(customMarkers);

    expect(definition.markerId).toBe(markerId);
    expect(resolveCustomMarkerDotKey(customMarkers, markerId))
      .toBe('energyMetabolism.acetoaceticAcid');
  });

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

  it('keeps identities intact when sync merges independent custom marker maps', () => {
    const local = {
      customMarkers: {
        'localPanel.one': { markerId: 'custom:local_one', name: 'Local' },
      },
    };
    const remote = {
      customMarkers: {
        'remotePanel.two': { markerId: 'custom:remote_two', name: 'Remote' },
      },
    };

    const merged = mergeImportedData(local, remote);

    expect(merged.customMarkers).toEqual({
      'remotePanel.two': { markerId: 'custom:remote_two', name: 'Remote' },
      'localPanel.one': { markerId: 'custom:local_one', name: 'Local' },
    });
    expect(local.customMarkers['localPanel.one'].markerId).toBe('custom:local_one');
    expect(remote.customMarkers['remotePanel.two'].markerId).toBe('custom:remote_two');
  });
});
