import { afterEach, describe, expect, it } from 'vitest';

import { getMarkerCrosswalk } from '../js/lab-standards/marker-crosswalk.js';
import { buildLabOrderDraftFromMarkers } from '../js/lab-order-intent.js';
import {
  clearProviderCatalogueSourceForTests,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';
import { LABSHOP_FIXTURE_CATALOGUE } from './fixtures/lab-provider-catalogues.js';

const COMMON_BATCH_MARKERS = Object.freeze([
  'enzymes.ldh',
  'metabolism.lactate',
  'pancreas.lipase',
  'pancreas.amylase',
  'pancreas.pancreaticAmylase',
  'muscle.ck',
  'liver.bilirubinConjugated',
  'electrolytes.sodium',
  'electrolytes.potassium',
  'electrolytes.chloride',
  'minerals.magnesiumSerum',
  'iron.iron',
  'iron.transferrin',
  'iron.tibc',
  'iron.solubleTransferrinReceptor',
  'hematology.erythropoietin',
  'coagulation.fibrinogen',
  'coagulation.dDimer',
  'coagulation.ptInr',
  'coagulation.aptt',
]);

describe('Labshop common catalogue ontology expansion batch', () => {
  afterEach(() => clearProviderCatalogueSourceForTests());

  it('adds stable crosswalk entries for common non-personal Labshop catalogue rows', () => {
    for (const markerKey of COMMON_BATCH_MARKERS) {
      expect(getMarkerCrosswalk(markerKey)).toEqual(expect.objectContaining({ markerKey }));
    }
  });

  it('maps the common expansion batch to verified Labshop catalogue rows', () => {
    setProviderCatalogueItemsForTests('cz.labshop', LABSHOP_FIXTURE_CATALOGUE);
    const markers = COMMON_BATCH_MARKERS.map(markerKey => ({
      markerKey,
      displayName: getMarkerCrosswalk(markerKey)?.canonicalName || markerKey,
      priority: 'core',
    }));
    const draft = buildLabOrderDraftFromMarkers(markers, {
      country: 'CZ',
      userRequest: 'common Labshop catalogue expansion coverage test',
    });
    const labshop = draft.providerComparisons.find(row => row.providerId === 'cz.labshop');

    expect(labshop.coveredCount).toBe(COMMON_BATCH_MARKERS.length);
    expect(labshop.missingMarkerKeys).toEqual([]);
    expect(labshop.offerCount).toBe(COMMON_BATCH_MARKERS.length);
  });
});
