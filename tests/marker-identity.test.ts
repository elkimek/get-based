import type { BuiltinMarkerIdentity } from '../js/marker-schema.js';
import type { MarkerCategory } from '../js/marker-schema/types.js';
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
import * as schemaFacade from '../js/schema.js';

function markerDotKeys(schema: Record<string, MarkerCategory>) {
  return Object.entries(schema).flatMap(([categoryKey, category]) =>
    Object.keys(category.markers || {}).map(markerKey => `${categoryKey}.${markerKey}`));
}

describe('stable built-in marker identity contract', () => {
  it('covers every current schema marker exactly once', () => {
    const schemaDotKeys = markerDotKeys(MARKER_SCHEMA);
    const identityDotKeys = BUILTIN_MARKER_IDENTITIES.map(identity => identity.currentDotKey);
    const ids = BUILTIN_MARKER_IDENTITIES.map(identity => identity.id);

    expect(BUILTIN_MARKER_IDENTITIES).toHaveLength(198);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(identityDotKeys).size).toBe(identityDotKeys.length);
    expect(new Set(identityDotKeys)).toEqual(new Set(schemaDotKeys));
    expect(ids.every(id => /^gb:marker:[A-Za-z][A-Za-z0-9_]*$/.test(id))).toBe(true);
  });

  it('keeps the initial built-in ids immutable as a reviewed contract', () => {
    const checksum = createHash('sha256')
      .update(JSON.stringify(BUILTIN_MARKER_IDENTITIES.map(identity => identity.id).sort()))
      .digest('hex');

    // Adding combined eGFR extends the identity set; existing ids are unchanged.
    // A marker move changes currentDotKey, not this checksum or its marker id.
    expect(checksum).toBe('80f03ee8f254682428f44ec6417e80b5e4782793fcf52da5d16889e3327fe04c');
  });

  it('keeps authored and generated identity catalogs aligned and immutable at runtime', () => {
    const byId = (identities: readonly BuiltinMarkerIdentity[]) => [...identities].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(BUILTIN_MARKER_IDENTITIES)).toEqual(byId(BUILTIN_MARKER_IDENTITY_DEFINITIONS));
    expect(Object.isFrozen(BUILTIN_MARKER_IDENTITIES)).toBe(true);
    expect(BUILTIN_MARKER_IDENTITIES.every(identity =>
      Object.isFrozen(identity)
      && Object.isFrozen(identity.legacyDotKeys)
      && Object.isFrozen(identity.legacyIds))).toBe(true);
  });

  it('resolves ids, current dotKeys, and historical aliases bidirectionally', () => {
    expect(BUILTIN_MARKER_DOT_KEY_ALIASES).toEqual({
      'biochemistry.egfrCreatinineCystatinC': 'biochemistry.egfrCombined',
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

  it('reserves a separate opaque identity namespace for future custom-marker adoption', () => {
    expect(CUSTOM_MARKER_ID_PREFIX).toBe('custom:');
    expect(isCustomMarkerId('custom:550e8400e29b41d4a716446655440000')).toBe(true);
    expect(isCustomMarkerId('custom:local_01HX9Z')).toBe(true);
    expect(isCustomMarkerId('custom:')).toBe(false);
    expect(isCustomMarkerId('custom.existingDotKey')).toBe(false);
    expect(isCustomMarkerId('gb:marker:glucose')).toBe(false);
  });
});
