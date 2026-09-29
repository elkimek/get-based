import { describe, expect, it } from 'vitest';

import { normalizeToSI, reconcileImportMarkerMappings } from '../js/pdf-import-marker-mapping.js';
import { MARKER_SCHEMA } from '../js/schema.js';

function reconcile(markers, testType = 'blood', options = {}) {
  reconcileImportMarkerMappings(markers, { ...options, testType });
  return markers;
}

describe('percent-marker sibling mapping', () => {
  // A report that lists the relative share and the absolute count as separate
  // rows must not collapse both onto the absolute-count marker, even when the
  // extracted mappedKey points at the absolute marker for both rows.
  it('splits the relative and absolute rows onto their own markers', () => {
    const markers = reconcile([
      { rawName: 'Immature Granulocytes', value: 0.3, unit: '%', mappedKey: 'hematology.immatureGranulocytes', matched: true, refMin: 0, refMax: 2 },
      { rawName: 'Immature Granulocytes (abs)', value: 0.04, unit: '10^9/l', mappedKey: 'hematology.immatureGranulocytes', matched: true, refMin: 0, refMax: 0.2 },
    ]);

    expect(markers[0].mappedKey).toBe('hematology.immatureGranulocytesPct');
    expect(markers[1].mappedKey).toBe('hematology.immatureGranulocytes');
  });

  it('keeps the absolute row on the absolute count marker', () => {
    const [, absolute] = reconcile([
      { rawName: 'Immature Granulocytes', value: 0.3, unit: '%', mappedKey: null, matched: false },
      { rawName: 'Immature Granulocytes (abs)', value: 0.04, unit: '10^9/l', mappedKey: 'hematology.immatureGranulocytes', matched: true },
    ]);

    expect(absolute.mappedKey).toBe('hematology.immatureGranulocytes');
  });

  it('does not treat a percent-hinted row as the absolute marker for English labels', () => {
    const [pct] = reconcile([
      { rawName: 'Immature Granulocytes %', value: 0.3, unit: '%', mappedKey: null, matched: false, refMin: 0, refMax: 2 },
    ]);

    expect(pct.mappedKey).toBe('hematology.immatureGranulocytesPct');
  });

  it('prefers the percent sibling of other count markers too (reticulocytes)', () => {
    const [pct] = reconcile([
      { rawName: 'Reticulocytes %', value: 1.4, unit: '%', mappedKey: null, matched: false, refMin: 0.5, refMax: 2.5 },
    ]);

    expect(pct.mappedKey).toBe('hematology.reticulocytesPct');
  });

  it('keeps an explicit absolute hint authoritative over a percent hint', () => {
    const [absolute] = reconcile([
      { rawName: 'Neutrophils #', value: 3.2, unit: '%', mappedKey: null, matched: false },
    ]);

    expect(absolute.mappedKey).toBe('differential.neutrophils');
  });

  it('keeps a %-unit marker that has no Pct sibling on its own key', () => {
    // Precondition: hematocrit is intrinsically a percentage, so it has no
    // absolute-count sibling and therefore no `hematocritPct`. A `%` unit alone
    // must not trigger the sibling remap that only applies to count pairs.
    expect(MARKER_SCHEMA.hematology.markers.hematocrit.unit).toBe('%');
    expect(MARKER_SCHEMA.hematology.markers.hematocritPct).toBeUndefined();

    const [hematocrit] = reconcile([
      { rawName: 'Hematocrit', value: 45, unit: '%', mappedKey: null, matched: false },
    ]);

    expect(hematocrit.mappedKey).toBe('hematology.hematocrit');
  });

  it('maps an aliased percentage label through the existing alias table', () => {
    const [pct] = reconcile([
      { rawName: 'Nezralé granulocyty', value: 0.3, unit: '%', mappedKey: null, matched: false },
    ]);

    expect(pct.mappedKey).toBe('hematology.immatureGranulocytesPct');
  });

  it('remaps onto a fraction-stored Pct marker and converts % to fraction downstream', () => {
    const [pct] = reconcile([
      { rawName: 'Polymorphs', value: 45, unit: '%', mappedKey: 'differential.neutrophils', matched: true },
    ]);

    expect(pct.mappedKey).toBe('differential.neutrophilsPct');
    expect(normalizeToSI(pct.mappedKey, pct.value, pct.unit, pct)).toBeCloseTo(0.45, 6);
  });

  it('maps a spelled-out percent label through the alias table', () => {
    const [pct] = reconcile([
      { rawName: 'Immature Granulocytes percent', value: 0.3, unit: '', mappedKey: null, matched: false },
    ]);

    expect(pct.mappedKey).toBe('hematology.immatureGranulocytesPct');
  });

  it('does not remap percent rows for non-blood standard-key imports', () => {
    const [absolute] = reconcile(
      [{ rawName: 'Immature Granulocytes', value: 0.3, unit: '%', mappedKey: 'hematology.immatureGranulocytes', matched: true }],
      'biostarks',
    );

    expect(absolute.mappedKey).toBe('hematology.immatureGranulocytes');
  });

  it('does not remap when a product adapter owns the suggested key', () => {
    const markers = reconcile(
      [{ rawName: 'Immature Granulocytes', value: 0.3, unit: '%', suggestedKey: 'customThing.ig', mappedKey: null, matched: false }],
      'blood',
      {
        preferSuggestedKeys: true,
        refLookup: {
          'customThing.ig': { name: 'IG', unit: '10^9/l' },
          'customThing.igPct': { name: 'IG %', unit: '%' },
        },
      },
    );

    expect(markers[0].mappedKey).toBe('customThing.ig');
  });

  it('accepts an existing custom Pct sibling supplied through existingKeys', () => {
    const [pct] = reconcile(
      [{ rawName: 'Immature Granulocytes', value: 0.3, unit: '%', mappedKey: 'customThing.ig', matched: true }],
      'blood',
      { refLookup: {}, existingKeys: new Set(['customThing.ig', 'customThing.igPct']) },
    );

    expect(pct.mappedKey).toBe('customThing.igPct');
  });

  it('keeps an explicit absolute unit on the base count marker despite a percent label', () => {
    const markers = reconcile([
      { rawName: 'Immature Granulocytes percent (abs)', value: 0.04, unit: '10^9/l', mappedKey: null, matched: false },
      { rawName: 'Immature Granulocytes percent', value: 0.04, unit: '10^9/l', mappedKey: null, matched: false },
    ]);

    expect(markers[0].mappedKey).toBe('hematology.immatureGranulocytes');
    expect(markers[1].mappedKey).toBe('hematology.immatureGranulocytes');
  });

  it('applies the absolute-unit precedence to existing sibling aliases too', () => {
    const [absolute] = reconcile([
      { rawName: 'Reticulocytes percent (abs)', value: 0.05, unit: '10^9/l', mappedKey: null, matched: false },
    ]);

    expect(absolute.mappedKey).toBe('hematology.reticulocytes');
  });
});
