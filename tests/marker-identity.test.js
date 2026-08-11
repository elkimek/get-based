import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  BUILTIN_MARKER_DOT_KEY_ALIASES,
  BUILTIN_MARKER_IDENTITIES,
  CUSTOM_MARKER_ID_PREFIX,
  getBuiltinMarkerDotKey,
  getBuiltinMarkerId,
  isCustomMarkerId,
  MARKER_SCHEMA,
  resolveBuiltinMarkerDotKey,
} from '../js/marker-schema.js';
import { BUILTIN_MARKER_IDENTITY_DEFINITIONS } from '../js/marker-schema/index.js';
import { migrateProfileData } from '../js/profile-data-migrations.js';
import * as schemaFacade from '../js/schema.js';

function markerDotKeys(schema) {
  return Object.entries(schema).flatMap(([categoryKey, category]) =>
    Object.keys(category.markers || {}).map(markerKey => `${categoryKey}.${markerKey}`));
}

describe('stable built-in marker identity contract', () => {
  it('covers every current schema marker exactly once', () => {
    const schemaDotKeys = markerDotKeys(MARKER_SCHEMA);
    const identityDotKeys = BUILTIN_MARKER_IDENTITIES.map(identity => identity.currentDotKey);
    const ids = BUILTIN_MARKER_IDENTITIES.map(identity => identity.id);

    expect(BUILTIN_MARKER_IDENTITIES).toHaveLength(149);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(identityDotKeys).size).toBe(identityDotKeys.length);
    expect(new Set(identityDotKeys)).toEqual(new Set(schemaDotKeys));
    expect(ids.every(id => /^gb:marker:[A-Za-z][A-Za-z0-9_]*$/.test(id))).toBe(true);
  });

  it('keeps the initial built-in ids immutable as a reviewed contract', () => {
    const checksum = createHash('sha256')
      .update(JSON.stringify(BUILTIN_MARKER_IDENTITIES.map(identity => identity.id).sort()))
      .digest('hex');

    // A marker move changes currentDotKey, not this checksum or its marker id.
    expect(checksum).toBe('5b50c5d092e043b7aa9ed11e3d5acfc8491ca677a8a0a00886906af060a867d7');
  });

  it('keeps authored and generated identity catalogs aligned and immutable at runtime', () => {
    const byId = identities => [...identities].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(BUILTIN_MARKER_IDENTITIES)).toEqual(byId(BUILTIN_MARKER_IDENTITY_DEFINITIONS));
    expect(Object.isFrozen(BUILTIN_MARKER_IDENTITIES)).toBe(true);
    expect(BUILTIN_MARKER_IDENTITIES.every(identity =>
      Object.isFrozen(identity) && Object.isFrozen(identity.legacyDotKeys))).toBe(true);
  });

  it('resolves ids, current dotKeys, and historical aliases bidirectionally', () => {
    expect(BUILTIN_MARKER_DOT_KEY_ALIASES).toEqual({
      'lipids.totalCholesterol': 'lipids.cholesterol',
      'lipids.cholesterolTotal': 'lipids.cholesterol',
      'lipids.total_cholesterol': 'lipids.cholesterol',
      'lipids.totalChol': 'lipids.cholesterol',
      'lipids.hdlCholesterol': 'lipids.hdl',
      'lipids.hdl_cholesterol': 'lipids.hdl',
      'lipids.lpa': 'lipids.lpA',
      'lipids.lp_a': 'lipids.lpA',
      'lipids.lipoproteinA': 'lipids.lpA',
      'lipids.lipoproteina': 'lipids.lpA',
      'hormones.cPeptide': 'diabetes.cPeptide',
      'lipids.cholHdlRatio': 'calculatedRatios.cholHdlRatio',
    });
    expect(getBuiltinMarkerId('biochemistry.glucose')).toBe('gb:marker:glucose');
    expect(getBuiltinMarkerDotKey('gb:marker:glucose')).toBe('biochemistry.glucose');
    expect(resolveBuiltinMarkerDotKey('gb:marker:glucose')).toBe('biochemistry.glucose');
    expect(resolveBuiltinMarkerDotKey('biochemistry.glucose')).toBe('biochemistry.glucose');

    for (const [legacyDotKey, currentDotKey] of Object.entries(BUILTIN_MARKER_DOT_KEY_ALIASES)) {
      const markerId = getBuiltinMarkerId(legacyDotKey);
      expect(markerId).not.toBeNull();
      expect(getBuiltinMarkerDotKey(markerId)).toBe(currentDotKey);
      expect(resolveBuiltinMarkerDotKey(legacyDotKey)).toBe(currentDotKey);
    }

    expect(getBuiltinMarkerId('missing.marker')).toBeNull();
    expect(getBuiltinMarkerDotKey('gb:marker:missing')).toBeNull();
    expect(resolveBuiltinMarkerDotKey(null)).toBeNull();
  });

  it('exposes the same identity contract through the schema compatibility facade', () => {
    expect(schemaFacade.BUILTIN_MARKER_IDENTITIES).toBe(BUILTIN_MARKER_IDENTITIES);
    expect(schemaFacade.BUILTIN_MARKER_DOT_KEY_ALIASES).toBe(BUILTIN_MARKER_DOT_KEY_ALIASES);
    expect(schemaFacade.getBuiltinMarkerId).toBe(getBuiltinMarkerId);
    expect(schemaFacade.getBuiltinMarkerDotKey).toBe(getBuiltinMarkerDotKey);
    expect(schemaFacade.resolveBuiltinMarkerDotKey).toBe(resolveBuiltinMarkerDotKey);
  });

  it('keeps existing legacy dotKey migration behavior on the shared alias table', () => {
    const legacyProfile = {
      entries: [{
        date: '2026-01-15',
        markers: {
          'hormones.cPeptide': 1.1,
          'lipids.lpa': 42,
          'lipids.totalCholesterol': 4.8,
          'lipids.hdlCholesterol': 1.4,
          'lipids.cholHdlRatio': 3.4,
        },
      }],
      customMarkers: {
        'hormones.cPeptide': { name: 'C-peptide' },
        'lipids.lpa': { name: 'Lp(a)' },
      },
      markerNotes: { 'lipids.lpa': 'Inherited note' },
      markerLabels: { 'lipids.totalCholesterol': 'Total cholesterol' },
      refOverrides: { 'lipids.hdlCholesterol': { refMin: 1 } },
      manualValues: { 'hormones.cPeptide:2026-01-15': true },
      markerValueNotes: { 'lipids.cholHdlRatio:2026-01-15': 'Calculated by lab' },
    };

    const migrated = migrateProfileData(structuredClone(legacyProfile));
    const markers = migrated.entries[0].markers;

    expect(markers).toMatchObject({
      'diabetes.cPeptide': 1.1,
      'lipids.lpA': 42,
      'lipids.cholesterol': 4.8,
      'lipids.hdl': 1.4,
      'calculatedRatios.cholHdlRatio': 3.4,
    });
    expect(Object.keys(markers).some(key => key in BUILTIN_MARKER_DOT_KEY_ALIASES)).toBe(false);
    expect(migrated.customMarkers['hormones.cPeptide']).toBeUndefined();
    expect(migrated.customMarkers['lipids.lpa']).toBeUndefined();
    expect(migrated.markerNotes['lipids.lpA']).toBe('Inherited note');
    expect(migrated.markerLabels['lipids.cholesterol']).toBe('Total cholesterol');
    expect(migrated.refOverrides['lipids.hdl']).toEqual({ refMin: 1 });
    expect(migrated.manualValues['diabetes.cPeptide:2026-01-15']).toBe(true);
    expect(migrated.markerValueNotes['calculatedRatios.cholHdlRatio:2026-01-15'])
      .toBe('Calculated by lab');
  });

  it('reserves a separate opaque identity namespace for future custom-marker adoption', () => {
    expect(CUSTOM_MARKER_ID_PREFIX).toBe('custom:');
    expect(isCustomMarkerId('custom:550e8400e29b41d4a716446655440000')).toBe(true);
    expect(isCustomMarkerId('custom:local_01HX9Z')).toBe(true);
    expect(isCustomMarkerId('custom:')).toBe(false);
    expect(isCustomMarkerId('custom.existingDotKey')).toBe(false);
    expect(isCustomMarkerId('gb:marker:glucose')).toBe(false);
  });
});
