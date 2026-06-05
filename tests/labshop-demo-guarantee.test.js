import { afterEach, describe, expect, it } from 'vitest';

import {
  clearProviderCatalogueSourceForTests,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';
import { LABSHOP_FIXTURE_CATALOGUE } from './fixtures/lab-provider-catalogues.js';
import {
  LABSHOP_DEMO_SCENARIOS,
  buildLabshopDemoGuaranteeReport,
} from '../js/lab-providers/cz/labshop-demo-guarantee.js';

describe('Labshop demo guarantee', () => {
  afterEach(() => clearProviderCatalogueSourceForTests());

  it('defines a bounded Labshop-facing demo set for the provider conversation', () => {
    expect(LABSHOP_DEMO_SCENARIOS.map(s => s.id)).toEqual([
      'methylation-fatigue',
      'thyroid-complete',
      'male-hormone-metabolic',
      'metabolic-lipids',
      'liver-kidney-biochemistry',
      'inflammation-hematology',
      'bone-mineral-vitamin-d',
      'preventive-broad-panel',
    ]);
    for (const scenario of LABSHOP_DEMO_SCENARIOS) {
      expect(scenario.title).toMatch(/\S/);
      expect(scenario.userPrompt).toMatch(/\S/);
      expect(scenario.assistantText).toMatch(/\S/);
      expect(scenario.expectedMarkerKeys.length).toBeGreaterThan(2);
      expect(scenario.expectedLabshopProductIds.length).toBeGreaterThan(2);
    }
  });

  it('turns each demo prompt into stable markers, complete Labshop coverage, selected products, and a preview-safe payload', () => {
    setProviderCatalogueItemsForTests('cz.labshop', LABSHOP_FIXTURE_CATALOGUE);
    const report = buildLabshopDemoGuaranteeReport();

    expect(report.providerId).toBe('cz.labshop');
    expect(report.scenarioCount).toBe(8);
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);

    for (const scenario of report.scenarios) {
      expect(scenario.ok).toBe(true);
      expect(scenario.unmappedMarkerKeys).toEqual([]);
      expect(scenario.missingMarkerKeys).toEqual([]);
      expect(scenario.coveredCount).toBe(scenario.requestedCount);
      expect(scenario.coveragePercent).toBe(100);
      expect(scenario.previewPayload).toEqual(expect.objectContaining({
        action: 'create_cart_preview',
        products: expect.any(Array),
      }));
      expect(scenario.previewPayload.products.length).toBeGreaterThan(0);
      expect(scenario.previewPayload.products.every(p => p.idProduct && p.quantity === 1)).toBe(true);
      expect(scenario.expectedMarkerKeys.every(key => scenario.markerKeys.includes(key))).toBe(true);
      expect(scenario.expectedLabshopProductIds.every(id => scenario.productIds.includes(id))).toBe(true);
    }
  });
});
