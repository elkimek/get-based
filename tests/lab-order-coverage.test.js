import { describe, expect, it } from 'vitest';

import {
  buildProviderCoverageMatrix,
  recommendLabOrderStrategy,
} from '../js/lab-order-coverage.js';

const MARKERS = [
  { markerKey: 'vitamins.vitaminB12', displayName: 'Vitamin B12' },
  { markerKey: 'vitamins.folate', displayName: 'Folate' },
  { markerKey: 'coagulation.homocysteine', displayName: 'Homocysteine' },
  { markerKey: 'vitamins.holotranscobalamin', displayName: 'Active B12' },
];

describe('provider coverage matrix and recommendations', () => {
  it('builds per-provider marker cells with coverage, price, fees, confidence, and missing markers', () => {
    const matrix = buildProviderCoverageMatrix(MARKERS, { country: 'CZ' });

    expect(matrix.requestedMarkers.map(m => m.markerKey)).toEqual(MARKERS.map(m => m.markerKey));
    expect(matrix.providers.map(p => p.providerId)).toEqual(['cz.unilabs', 'cz.labshop']);

    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');
    expect(unilabs).toEqual(expect.objectContaining({
      coveredCount: 4,
      requestedCount: 4,
      coveragePercent: 100,
      mandatoryFeesCzk: 81,
      totalEstimateCzk: 1541,
    }));
    expect(unilabs.cells['vitamins.holotranscobalamin']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'exact',
      priceCzk: 308,
      providerProductId: '3543',
      confidence: 'public_unilabs_online_configurator',
    }));

    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    expect(labshop).toEqual(expect.objectContaining({
      coveredCount: 2,
      requestedCount: 4,
      coveragePercent: 50,
      totalEstimateCzk: 500,
      missingMarkerKeys: ['coagulation.homocysteine', 'vitamins.holotranscobalamin'],
    }));
    expect(labshop.cells['vitamins.vitaminB12']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'panel_contains',
      providerProductId: '20036',
      priceCzk: 500,
    }));
    expect(labshop.cells['coagulation.homocysteine']).toEqual(expect.objectContaining({
      status: 'missing',
      coverage: 'unavailable',
      priceCzk: null,
    }));
  });

  it('recommends best coverage, cheapest complete single lab, and cheapest split order', () => {
    const matrix = buildProviderCoverageMatrix(MARKERS, { country: 'CZ' });
    const recommendation = recommendLabOrderStrategy(matrix);

    expect(recommendation.bestCoverage.providerId).toBe('cz.unilabs');
    expect(recommendation.cheapestComplete.providerId).toBe('cz.unilabs');
    expect(recommendation.cheapestComplete.totalEstimateCzk).toBe(1541);

    expect(recommendation.cheapestSplit).toEqual(expect.objectContaining({
      complete: true,
      totalEstimateCzk: 1460,
      providerCount: 2,
    }));
    expect(recommendation.cheapestSplit.providers.map(p => p.providerId)).toEqual(['cz.labshop', 'cz.unilabs']);
    expect(recommendation.cheapestSplit.providers[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      markerKeys: ['vitamins.vitaminB12', 'vitamins.folate'],
      totalEstimateCzk: 500,
    }));
    expect(recommendation.cheapestSplit.providers[1]).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      markerKeys: ['coagulation.homocysteine', 'vitamins.holotranscobalamin'],
      totalEstimateCzk: 960,
    }));
  });
});
