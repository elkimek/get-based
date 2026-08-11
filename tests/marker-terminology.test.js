import { describe, expect, it } from 'vitest';

import {
  findMarkerTerminologyMapping,
  getMarkerTerminologyMappings,
  MARKER_TERMINOLOGY_REGISTRY,
  TERMINOLOGY_CATALOGS,
} from '../js/marker-terminology.js';
import {
  MARKER_TERMINOLOGY_DEFINITIONS,
  TERMINOLOGY_CATALOG_DEFINITIONS,
} from '../js/marker-terminology/index.js';
import { BUILTIN_MARKER_IDENTITIES, MARKER_SCHEMA } from '../js/marker-schema.js';

function authoredRegistry() {
  return Object.groupBy(MARKER_TERMINOLOGY_DEFINITIONS, mapping => mapping.markerId);
}

function terminologyCodes(markerId) {
  return getMarkerTerminologyMappings(markerId)
    .map(mapping => `${mapping.terminology}:${mapping.code}`);
}

function expectDeepFrozen(value) {
  expect(Object.isFrozen(value)).toBe(true);
  if (!value || typeof value !== 'object') return;
  for (const nested of Object.values(value)) expectDeepFrozen(nested);
}

describe('marker terminology registry', () => {
  it('keeps the generated registry aligned with reviewed authoring sources', () => {
    expect(MARKER_TERMINOLOGY_REGISTRY).toEqual(authoredRegistry());
    expect(TERMINOLOGY_CATALOGS).toEqual(TERMINOLOGY_CATALOG_DEFINITIONS);
  });

  it('keys mappings only by stable built-in marker ids', () => {
    const knownIds = new Set(BUILTIN_MARKER_IDENTITIES.map(identity => identity.id));

    expect(Object.keys(MARKER_TERMINOLOGY_REGISTRY)).toEqual([
      'gb:marker:glucose',
      'gb:marker:sodium',
    ]);
    expect(MARKER_TERMINOLOGY_DEFINITIONS.every(mapping => knownIds.has(mapping.markerId)))
      .toBe(true);
  });

  it('preserves the reviewed pilot codes and specimen distinctions', () => {
    expect(terminologyCodes('gb:marker:glucose')).toEqual([
      'loinc:14749-6',
      'npu:NPU02192',
      'nclp:01896',
      'nclp:01898',
    ]);
    expect(terminologyCodes('gb:marker:sodium')).toEqual([
      'loinc:2951-2',
      'npu:NPU03429',
      'nclp:02500',
      'nclp:02503',
    ]);

    const nclpGlucose = getMarkerTerminologyMappings('gb:marker:glucose', 'nclp');
    expect(nclpGlucose.map(mapping => mapping.context.system)).toEqual(['P', 'S']);
    expect(nclpGlucose.every(mapping => mapping.context.method === '*')).toBe(true);
  });

  it('keeps UCUM units and native term context on individual mappings', () => {
    for (const mapping of MARKER_TERMINOLOGY_DEFINITIONS) {
      expect(mapping.ucumUnits).toEqual(['mmol/L']);
      expect(mapping.context.component).toBeTruthy();
      expect(mapping.context.property).toBeTruthy();
      expect(mapping.context.system).toBeTruthy();
      expect(mapping.source.url).toMatch(/^https:\/\//);
      expect(mapping.source.verifiedOn).toBe('2026-08-11');
    }
  });

  it('supports safe forward and reverse lookups without coercing codes', () => {
    expect(findMarkerTerminologyMapping('loinc', '14749-6')).toMatchObject({
      markerId: 'gb:marker:glucose',
      code: '14749-6',
    });
    expect(findMarkerTerminologyMapping('nclp', '01896')).toMatchObject({
      markerId: 'gb:marker:glucose',
      context: { system: 'P' },
    });
    expect(findMarkerTerminologyMapping('nclp', 1896)).toBeNull();
    expect(findMarkerTerminologyMapping('missing', '01896')).toBeNull();
    expect(getMarkerTerminologyMappings('gb:marker:missing')).toEqual([]);
    expect(getMarkerTerminologyMappings(null)).toEqual([]);
  });

  it('publishes immutable runtime metadata', () => {
    expectDeepFrozen(TERMINOLOGY_CATALOGS);
    expectDeepFrozen(MARKER_TERMINOLOGY_REGISTRY);
    expect(Object.isFrozen(getMarkerTerminologyMappings('gb:marker:glucose', 'loinc'))).toBe(true);
  });

  it('does not alter schema fields or stored marker locations', () => {
    expect(MARKER_SCHEMA.biochemistry.markers.glucose).not.toHaveProperty('terminology');
    expect(MARKER_SCHEMA.electrolytes.markers.sodium).not.toHaveProperty('terminology');
    expect(BUILTIN_MARKER_IDENTITIES.find(identity => identity.id === 'gb:marker:glucose'))
      .toMatchObject({ currentDotKey: 'biochemistry.glucose' });
    expect(BUILTIN_MARKER_IDENTITIES.find(identity => identity.id === 'gb:marker:sodium'))
      .toMatchObject({ currentDotKey: 'electrolytes.sodium' });
  });
});
