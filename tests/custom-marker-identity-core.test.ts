import type { CustomMarkerDefinition, CustomMarkerMap } from '../js/custom-marker-identity.js';
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
    const customMarkers: Record<string, CustomMarkerDefinition> = {
      'a.first': { name: 'First' },
      'b.owner': { markerId: 'custom:shared', name: 'Owner' },
      'c.duplicate': { markerId: 'custom:shared', name: 'Duplicate' },
      'd.invalid': { markerId: 'not a custom id', name: 'Invalid' },
      'z.reserved': { markerId: collidingLegacyId, name: 'Reserved' },
    };

    migrateCustomMarkerIdentities(customMarkers);

    expect(customMarkers['z.reserved']!.markerId).toBe(collidingLegacyId);
    expect(customMarkers['a.first']!.markerId).toBe(`${collidingLegacyId}_2`);
    expect(customMarkers['b.owner']!.markerId).toBe('custom:shared');
    expect(customMarkers['c.duplicate']!.markerId)
      .toBe(deriveLegacyCustomMarkerId('c.duplicate'));
    expect(customMarkers['d.invalid']!.markerId)
      .toBe(deriveLegacyCustomMarkerId('d.invalid'));
    expect(new Set(Object.values(customMarkers).map(definition => definition.markerId)).size)
      .toBe(Object.keys(customMarkers).length);
  });

  it('resolves both ids and dot keys while preserving identity across a future move', () => {
    const markerId = 'custom:fixed_identity';
    const definition = { markerId, name: 'Acetoacetic Acid' };
    let customMarkers: CustomMarkerMap = { 'urineAminoAcids.acetoaceticAcid': definition };

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

  it('keeps identities intact when sync merges independent custom marker maps', () => {
    const local: {customMarkers: Record<string, {markerId: string; name: string}>} = {
      customMarkers: {
        'localPanel.one': { markerId: 'custom:local_one', name: 'Local' },
      },
    };
    const remote: {customMarkers: Record<string, {markerId: string; name: string}>} = {
      customMarkers: {
        'remotePanel.two': { markerId: 'custom:remote_two', name: 'Remote' },
      },
    };

    const merged = mergeImportedData(local, remote);

    expect(merged.customMarkers).toEqual({
      'remotePanel.two': { markerId: 'custom:remote_two', name: 'Remote' },
      'localPanel.one': { markerId: 'custom:local_one', name: 'Local' },
    });
    expect(local.customMarkers['localPanel.one']!.markerId).toBe('custom:local_one');
    expect(remote.customMarkers['remotePanel.two']!.markerId).toBe('custom:remote_two');
  });
});
