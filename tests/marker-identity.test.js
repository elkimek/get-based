import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  BUILTIN_MARKER_DOT_KEY_ALIASES,
  BUILTIN_MARKER_ID_ALIASES,
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

    expect(BUILTIN_MARKER_IDENTITIES).toHaveLength(196);
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
    expect(checksum).toBe('50a763e0b84b47918d26e9e7f2864515162b92e0a93e2d26e7f7178a395468f9');
  });

  it('keeps authored and generated identity catalogs aligned and immutable at runtime', () => {
    const byId = identities => [...identities].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(BUILTIN_MARKER_IDENTITIES)).toEqual(byId(BUILTIN_MARKER_IDENTITY_DEFINITIONS));
    expect(Object.isFrozen(BUILTIN_MARKER_IDENTITIES)).toBe(true);
    expect(BUILTIN_MARKER_IDENTITIES.every(identity =>
      Object.isFrozen(identity)
      && Object.isFrozen(identity.legacyDotKeys)
      && Object.isFrozen(identity.legacyIds))).toBe(true);
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
      'hormones.insulin': 'diabetes.insulin',
      'diabetes.insulin_d': 'diabetes.insulin',
      'hormones.cPeptide': 'diabetes.cPeptide',
      'lipids.cholHdlRatio': 'calculatedRatios.cholHdlRatio',
    });
    expect(BUILTIN_MARKER_ID_ALIASES).toEqual({
      'gb:marker:insulin_d': 'gb:marker:insulin',
    });
    expect(getBuiltinMarkerId('biochemistry.glucose')).toBe('gb:marker:glucose');
    expect(getBuiltinMarkerDotKey('gb:marker:glucose')).toBe('biochemistry.glucose');
    expect(resolveBuiltinMarkerDotKey('gb:marker:glucose')).toBe('biochemistry.glucose');
    expect(resolveBuiltinMarkerDotKey('biochemistry.glucose')).toBe('biochemistry.glucose');
    expect(getBuiltinMarkerId('hormones.insulin')).toBe('gb:marker:insulin');
    expect(getBuiltinMarkerDotKey('gb:marker:insulin_d')).toBe('diabetes.insulin');
    expect(resolveBuiltinMarkerDotKey('gb:marker:insulin_d')).toBe('diabetes.insulin');

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
    expect(schemaFacade.BUILTIN_MARKER_ID_ALIASES).toBe(BUILTIN_MARKER_ID_ALIASES);
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
          'hormones.insulin': 7.2,
          'diabetes.insulin_d': 7.2,
        },
      }],
      customMarkers: {
        'hormones.cPeptide': { name: 'C-peptide' },
        'lipids.lpa': { name: 'Lp(a)' },
      },
      markerNotes: { 'lipids.lpa': 'Inherited note' },
      markerLabels: {
        'lipids.totalCholesterol': 'Total cholesterol',
        'hormones.insulin:2026-01-15': 'Fasting insulin',
      },
      refOverrides: {
        'lipids.hdlCholesterol': { refMin: 1 },
        'hormones.insulin:2026-01-15': { refMin: 2.6, refMax: 24.9, refSource: 'import' },
      },
      manualValues: { 'hormones.cPeptide:2026-01-15': true },
      markerValueNotes: { 'lipids.cholHdlRatio:2026-01-15': 'Calculated by lab' },
      markerPlacements: { 'gb:marker:insulin_d': { categoryKey: 'biochemistry' } },
      importSnapshots: [{
        id: 'legacy-alias-snapshot',
        date: '2026-01-15',
        markers: [
          { mappedKey: 'hormones.insulin', suggestedKey: null, matched: true },
          { mappedKey: null, suggestedKey: 'lipids.cholHdlRatio', matched: false },
        ],
      }],
    };

    const migrated = migrateProfileData(structuredClone(legacyProfile));
    const markers = migrated.entries[0].markers;

    expect(markers).toMatchObject({
      'diabetes.cPeptide': 1.1,
      'lipids.lpA': 42,
      'lipids.cholesterol': 4.8,
      'lipids.hdl': 1.4,
      'calculatedRatios.cholHdlRatio': 3.4,
      'diabetes.insulin': 7.2,
    });
    expect(Object.keys(markers).some(key => key in BUILTIN_MARKER_DOT_KEY_ALIASES)).toBe(false);
    expect(migrated.customMarkers['hormones.cPeptide']).toBeUndefined();
    expect(migrated.customMarkers['lipids.lpa']).toBeUndefined();
    expect(migrated.markerNotes['lipids.lpA']).toBe('Inherited note');
    expect(migrated.markerLabels['lipids.cholesterol']).toBe('Total cholesterol');
    expect(migrated.markerLabels['diabetes.insulin:2026-01-15']).toBe('Fasting insulin');
    expect(migrated.markerLabels['hormones.insulin:2026-01-15']).toBeUndefined();
    expect(migrated.refOverrides['lipids.hdl']).toEqual({ refMin: 1 });
    expect(migrated.refOverrides['diabetes.insulin:2026-01-15'])
      .toEqual({ refMin: 2.6, refMax: 24.9, refSource: 'import' });
    expect(migrated.refOverrides['hormones.insulin:2026-01-15']).toBeUndefined();
    expect(migrated.manualValues['diabetes.cPeptide:2026-01-15']).toBe(true);
    expect(migrated.markerValueNotes['calculatedRatios.cholHdlRatio:2026-01-15'])
      .toBe('Calculated by lab');
    expect(migrated.markerPlacements).toEqual({
      'gb:marker:insulin': { categoryKey: 'biochemistry' },
    });
    expect(migrated.importSnapshots[0].markers).toMatchObject([
      { mappedKey: 'diabetes.insulin', suggestedKey: null, matched: true },
      { mappedKey: 'calculatedRatios.cholHdlRatio', suggestedKey: null, matched: true },
    ]);
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
