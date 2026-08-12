import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { MARKER_SCHEMA as directMarkerSchema } from '../js/marker-schema.js';
import { MARKER_SCHEMA as authoredMarkerSchema } from '../js/marker-schema/index.js';
import { migrateProfileData } from '../js/profile-data-migrations.js';
import { MARKER_SCHEMA as facadeMarkerSchema, OPTIMAL_RANGES } from '../js/schema.js';

const EXPECTED_CATEGORIES = [
  'biochemistry',
  'hormones',
  'electrolytes',
  'lipids',
  'iron',
  'proteins',
  'thyroid',
  'vitamins',
  'diabetes',
  'tumorMarkers',
  'coagulation',
  'hematology',
  'differential',
  'boneMetabolism',
  'urinalysis',
  'cardiac',
  'bodyComposition',
  'boneDensity',
  'calculatedRatios',
];

const CATEGORY_MODULES = {
  biochemistry: '../js/marker-schema/biochemistry.js',
  hormones: '../js/marker-schema/hormones.js',
  electrolytes: '../js/marker-schema/electrolytes.js',
  lipids: '../js/marker-schema/lipids.js',
  iron: '../js/marker-schema/iron.js',
  proteins: '../js/marker-schema/proteins.js',
  thyroid: '../js/marker-schema/thyroid.js',
  vitamins: '../js/marker-schema/vitamins.js',
  diabetes: '../js/marker-schema/diabetes.js',
  tumorMarkers: '../js/marker-schema/tumor-markers.js',
  coagulation: '../js/marker-schema/coagulation.js',
  hematology: '../js/marker-schema/hematology.js',
  differential: '../js/marker-schema/differential.js',
  boneMetabolism: '../js/marker-schema/bone-metabolism.js',
  urinalysis: '../js/marker-schema/urinalysis.js',
  cardiac: '../js/marker-schema/cardiac.js',
  bodyComposition: '../js/marker-schema/body-composition.js',
  boneDensity: '../js/marker-schema/bone-density.js',
  calculatedRatios: '../js/marker-schema/calculated-ratios.js',
};

function markerDotKeys(schema) {
  return Object.entries(schema).flatMap(([categoryKey, category]) =>
    Object.keys(category.markers || {}).map(markerKey => `${categoryKey}.${markerKey}`));
}

function markerEntries(schema) {
  return Object.entries(schema).flatMap(([categoryKey, category]) =>
    Object.entries(category.markers || {}).map(([markerKey, marker]) => [
      `${categoryKey}.${markerKey}`,
      marker,
    ]));
}

function hasStaticRange(marker) {
  return marker.refMin != null || marker.refMax != null;
}

describe('marker schema compatibility contract', () => {
  it('keeps schema.js as the stable compatibility facade', () => {
    expect(facadeMarkerSchema).toBe(directMarkerSchema);
  });

  it('keeps the generated runtime catalog aligned with category sources', () => {
    expect(directMarkerSchema).toEqual(authoredMarkerSchema);
  });

  it('composes every category module without cloning its definitions', async () => {
    for (const [categoryKey, modulePath] of Object.entries(CATEGORY_MODULES)) {
      const categoryExports = Object.values(await import(modulePath));
      expect(categoryExports).toHaveLength(1);
      expect(authoredMarkerSchema[categoryKey]).toBe(categoryExports[0]);
    }
  });

  it('preserves the existing built-in catalog exactly', () => {
    const dotKeys = markerDotKeys(facadeMarkerSchema);
    // Intentional catalog edits must update this checksum in the same reviewed change.
    // A file move or structural refactor must not update it.
    const checksum = createHash('sha256')
      .update(JSON.stringify(facadeMarkerSchema))
      .digest('hex');

    expect(Object.keys(facadeMarkerSchema)).toEqual(EXPECTED_CATEGORIES);
    expect(dotKeys).toHaveLength(196);
    expect(new Set(dotKeys).size).toBe(dotKeys.length);
    expect(checksum).toBe('85de177aa4d31760f2ebc26582a03f780c1e7fc5791e7b329c32d778c608d4b6');
  });

  it('leaves canonical stored dotKeys intact across existing profile migration', () => {
    const existingProfile = {
      entries: [{
        date: '2026-01-15',
        markers: {
          'biochemistry.glucose': 5.2,
          'lipids.apoB': 0.82,
        },
        markerSources: {
          'biochemistry.glucose': { file: 'existing-lab.pdf', at: 1736899200000 },
        },
      }],
      refOverrides: {
        'biochemistry.glucose': { refMin: 4, refMax: 6 },
      },
      markerLabels: {
        'lipids.apoB': 'Apolipoprotein B',
      },
      markerNotes: {
        'lipids.apoB': 'Existing profile note',
      },
      manualValues: {
        'biochemistry.glucose:2026-01-15': true,
      },
      markerValueNotes: {
        'biochemistry.glucose:2026-01-15': 'Fasting sample',
      },
    };
    const expectedMarkerData = structuredClone({
      entries: existingProfile.entries,
      refOverrides: existingProfile.refOverrides,
      markerLabels: existingProfile.markerLabels,
      markerNotes: existingProfile.markerNotes,
      manualValues: existingProfile.manualValues,
      markerValueNotes: existingProfile.markerValueNotes,
    });

    const migrated = migrateProfileData(structuredClone(existingProfile));

    expect({
      entries: migrated.entries,
      refOverrides: migrated.refOverrides,
      markerLabels: migrated.markerLabels,
      markerNotes: migrated.markerNotes,
      manualValues: migrated.manualValues,
      markerValueNotes: migrated.markerValueNotes,
    }).toEqual(expectedMarkerData);
    expect(facadeMarkerSchema.biochemistry.markers.glucose).toBeDefined();
    expect(facadeMarkerSchema.lipids.markers.apoB).toBeDefined();
  });

  it('accounts for reference-range coverage across every built-in marker', () => {
    const entries = markerEntries(facadeMarkerSchema);
    const unaccounted = entries
      .filter(([, marker]) => !hasStaticRange(marker) && marker.rangePolicy !== 'contextual')
      .map(([dotKey]) => dotKey);
    const contextual = entries
      .filter(([, marker]) => marker.rangePolicy === 'contextual')
      .map(([dotKey]) => dotKey);

    expect(unaccounted).toEqual([]);
    expect(contextual).toEqual([
      'bodyComposition.leanMass',
      'bodyComposition.fatMass',
      'bodyComposition.androidFatPct',
      'bodyComposition.gynoidFatPct',
      'boneDensity.bmdSpine',
      'boneDensity.bmdFemurTotal',
      'boneDensity.bmdFemurNeck',
      'calculatedRatios.phenoAge',
      'calculatedRatios.bortzAge',
      'calculatedRatios.biologicalAge',
    ]);
    for (const [, marker] of entries.filter(([, marker]) => marker.rangePolicy === 'contextual')) {
      expect(marker.refMin).toBeNull();
      expect(marker.refMax).toBeNull();
      expect(marker.desc).toMatch(/no universal|rather than a fixed|vary by population|cutoff|laboratory|analyzer/i);
    }

    const calculatedGuidance = entries
      .filter(([dotKey, marker]) => dotKey.startsWith('calculatedRatios.') && marker.rangePolicy === 'guidance')
      .map(([dotKey]) => dotKey);
    expect(calculatedGuidance).toEqual([
      'calculatedRatios.nlr',
      'calculatedRatios.plr',
      'calculatedRatios.mlr',
      'calculatedRatios.crpHdlRatio',
      'calculatedRatios.atherogenicIndexPlasma',
      'calculatedRatios.tygIndex',
      'calculatedRatios.albuminGlobulinRatio',
      'calculatedRatios.fib4Index',
      'calculatedRatios.systemicImmuneInflammationIndex',
      'calculatedRatios.anionGap',
    ]);
  });

  it('gives every built-in marker an explicit optimal range, reference fallback, or contextual policy', () => {
    const unaccounted = markerEntries(facadeMarkerSchema)
      .filter(([dotKey, marker]) => !OPTIMAL_RANGES[dotKey]
        && !hasStaticRange(marker)
        && marker.rangePolicy !== 'contextual')
      .map(([dotKey]) => dotKey);

    expect(unaccounted).toEqual([]);
  });
});
