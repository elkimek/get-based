import { describe, expect, it } from 'vitest';
import { migrateProfileData } from '../js/profile-data-migrations.js';
import { MARKER_SCHEMA as facadeMarkerSchema, BUILTIN_MARKER_DOT_KEY_ALIASES } from '../js/schema.js';

describe("stable built-in marker identity contract", () => {
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
});

describe("marker schema compatibility contract", () => {
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
});
