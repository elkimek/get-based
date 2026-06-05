import { afterEach, describe, expect, it } from 'vitest';

import { getMarkerCrosswalk } from '../js/lab-standards/marker-crosswalk.js';
import { buildLabOrderDraftFromMarkers } from '../js/lab-order-intent.js';
import {
  clearProviderCatalogueSourceForTests,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';
import { LABSHOP_FIXTURE_CATALOGUE } from './fixtures/lab-provider-catalogues.js';

const BATCH3_MARKERS = Object.freeze([
  // Infectious serology / immunity
  'infectious.ebvVcaIggIgmEbnaIgg',
  'infectious.ebvVcaIggAvidity',
  'infectious.ebvEbnaIgmEaIgg',
  'infectious.vzvIgm',
  'infectious.vzvIgg',
  'infectious.vzvIga',
  'infectious.hhv6Igg',
  'infectious.rubellaIgg',
  'infectious.borreliaIgm',
  'infectious.borreliaIgg',
  'infectious.helicobacterPyloriIgaIgg',
  'infectious.chlamydiaPneumoniaeIgaIggIgm',
  'infectious.hsv12IggIgm',
  'infectious.hsv12IggIgmWb',
  'infectious.toxoplasmaIggIgm',
  'infectious.cmvIgmIgg',
  'infectious.mycoplasmaPneumoniaeIgaIggIgm',
  'infectious.imdTest',
  'infectious.tetanusIgg',
  'infectious.tickBorneEncephalitisIgg',
  'infectious.measlesIgg',
  'infectious.pertussisToxinIgg',

  // Hepatitis / STI
  'infectious.havTotal',
  'infectious.hbcIgm',
  'infectious.hbcTotal',
  'infectious.hbeAg',
  'infectious.antiHbe',
  'infectious.hbsAg',
  'infectious.antiHbsQuant',
  'infectious.antiHcv',
  'infectious.hiv12P24',
  'infectious.syphilisTpRpr',

  // Food intolerance / celiac serology
  'celiac.ttgIgg',
  'celiac.ttgIga',
  'celiac.emaIga',
  'celiac.emaIgg',
  'celiac.dgpGliadinIga',
  'celiac.dgpGliadinIgg',
  'foodIntolerance.milkIgaIggIgm',

  // Allergy and transfusion basics
  'allergy.totalIge',
  'allergy.ecp',
  'transfusion.bloodGroupRh',
  'transfusion.rhPhenotype',
  'transfusion.bloodSubgroup',
  'transfusion.directCoombsPat',
]);

describe('Labshop batch 3 ontology expansion', () => {
  afterEach(() => clearProviderCatalogueSourceForTests());

  it('adds stable crosswalk entries for infectious, celiac, allergy, and transfusion catalogue rows', () => {
    for (const markerKey of BATCH3_MARKERS) {
      expect(getMarkerCrosswalk(markerKey)).toEqual(expect.objectContaining({ markerKey }));
    }
  });

  it('maps the batch 3 expansion to verified Labshop catalogue offers', () => {
    setProviderCatalogueItemsForTests('cz.labshop', LABSHOP_FIXTURE_CATALOGUE);
    const markers = BATCH3_MARKERS.map(markerKey => ({
      markerKey,
      displayName: getMarkerCrosswalk(markerKey)?.canonicalName || markerKey,
      priority: 'core',
    }));
    const draft = buildLabOrderDraftFromMarkers(markers, {
      country: 'CZ',
      userRequest: 'Labshop batch 3 ontology expansion coverage test',
    });
    const labshop = draft.providerComparisons.find(row => row.providerId === 'cz.labshop');

    expect(labshop.coveredCount).toBe(BATCH3_MARKERS.length);
    expect(labshop.missingMarkerKeys).toEqual([]);
    expect(labshop.offerCount).toBe(BATCH3_MARKERS.length);
  });
});
