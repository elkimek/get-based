import { afterEach, describe, expect, it } from 'vitest';

import { getMarkerCrosswalk } from '../js/lab-standards/marker-crosswalk.js';
import { buildLabOrderDraftFromMarkers } from '../js/lab-order-intent.js';
import {
  clearProviderCatalogueSourceForTests,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';
import { LABSHOP_FIXTURE_CATALOGUE } from './fixtures/lab-provider-catalogues.js';

const BATCH2_MARKERS = Object.freeze([
  // Proteins / immune basics
  'immunology.igg',
  'immunology.iga',
  'immunology.igm',
  'proteins.haptoglobin',
  'inflammation.crp',
  'proteins.beta2Microglobulin',
  'immunology.c3Complement',
  'immunology.c4Complement',
  'immunology.ch50',
  'immunology.aslo',
  'proteins.prealbumin',
  'proteins.orosomucoid',
  'proteins.totalProtein',
  'rheumatology.rf',
  'proteins.alpha1Antitrypsin',
  'immunology.cikC1q',
  'immunology.cikPeg',

  // Hormones
  'hormones.calcitonin',
  'hormones.renin',
  'hormones.oh17Progesterone',
  'inflammation.procalcitonin',
  'hormones.gastrin',
  'hormones.progesterone',
  'hormones.dhea',
  'neurotransmitters.serotonin',
  'hormones.aldosterone',
  'hormones.amh',
  'hormones.acth',
  'hormones.androstenedione',
  'hormones.hcgTotal',
  'hormones.igfbp3',
  'hormones.growthHormone',

  // Vitamins
  'vitamins.vitaminB6',
  'mitochondria.coq10',
  'vitamins.vitaminC',
  'vitamins.vitaminB1',
  'vitamins.vitaminE',
  'vitamins.vitaminB2',
  'vitamins.vitaminD2',
  'vitamins.vitaminD3',
  'vitamins.vitaminA',
  'vitamins.vitaminB3',
  'vitamins.vitaminB5',
  'vitamins.biotin',

  // Bone turnover
  'bone.osteocalcin',
  'bone.ictp',
  'bone.betaCrosslaps',
  'bone.p1np',
  'bone.boneAlp',
]);

describe('Labshop batch 2 ontology expansion', () => {
  afterEach(() => clearProviderCatalogueSourceForTests());

  it('adds stable crosswalk entries for protein, hormone, vitamin, and bone catalogue rows', () => {
    for (const markerKey of BATCH2_MARKERS) {
      expect(getMarkerCrosswalk(markerKey)).toEqual(expect.objectContaining({ markerKey }));
    }
  });

  it('maps the batch 2 expansion to verified Labshop catalogue rows', () => {
    setProviderCatalogueItemsForTests('cz.labshop', LABSHOP_FIXTURE_CATALOGUE);
    const markers = BATCH2_MARKERS.map(markerKey => ({
      markerKey,
      displayName: getMarkerCrosswalk(markerKey)?.canonicalName || markerKey,
      priority: 'core',
    }));
    const draft = buildLabOrderDraftFromMarkers(markers, {
      country: 'CZ',
      userRequest: 'Labshop batch 2 ontology expansion coverage test',
    });
    const labshop = draft.providerComparisons.find(row => row.providerId === 'cz.labshop');

    expect(labshop.coveredCount).toBe(BATCH2_MARKERS.length);
    expect(labshop.missingMarkerKeys).toEqual([]);
    expect(labshop.offerCount).toBe(BATCH2_MARKERS.length);
  });
});
