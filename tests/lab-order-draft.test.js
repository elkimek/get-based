import { describe, expect, it } from 'vitest';

import {
  buildLabOrderDraft,
  detectLabOrderIntent,
  selectProviderForDraft,
} from '../js/lab-order-intent.js';

describe('lab order draft uses architecture layers', () => {
  it('turns explicit Labshop text into marker intents plus provider offers', () => {
    const intent = detectLabOrderIntent('Order B12 and folate from Labshop');

    expect(intent.isOrderIntent).toBe(true);
    expect(intent.markerIntents.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'vitamins.vitaminB12',
      'vitamins.folate',
    ]));
    expect(intent.markerIntents.map(m => m.markerKey)).not.toContain('vitamins.holotranscobalamin');
    expect(intent.providerId).toBe('cz.labshop');
  });

  it('builds a draft with requested markers, provider offers, and safety boundary separated', () => {
    const draft = buildLabOrderDraft('Order B12 and folate from Labshop');

    expect(draft.country).toBe('CZ');
    expect(draft.providerId).toBe('cz.labshop');
    expect(draft.requestedMarkers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'vitamins.vitaminB12',
      'vitamins.folate',
    ]));
    expect(draft.offers[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      providerProductId: '20036',
      coverage: 'panel_contains',
    }));
    expect(draft.products[0].providerProductId).toBe('20036');
    expect(draft.safetyBoundary).toMatch(/final checkout\/payment stays user-in-loop/i);
  });

  it('builds a provider-selection draft when no lab is specified', () => {
    const draft = buildLabOrderDraft('Order B12 and folate tests for me');

    expect(draft.status).toBe('provider_selection');
    expect(draft.providerId).toBeNull();
    expect(draft.providerOptions.map(p => p.providerId)).toEqual(['cz.labshop', 'cz.unilabs']);
    expect(draft.providerOptions.map(p => p.providerId)).not.toContain('cz.spadia');
    expect(draft.requestedMarkers.map(m => m.displayName)).toEqual(expect.arrayContaining(['Vitamin B12', 'Folate']));
    expect(draft.products).toEqual([]);
    expect(draft.providerComparisons.map(p => p.providerId)).toEqual(['cz.labshop', 'cz.unilabs']);
    expect(draft.providerComparisons[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      coveredCount: 2,
      requestedCount: 2,
      totalEstimateCzk: 500,
    }));
    expect(draft.providerComparisons[1]).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      coveredCount: 2,
      requestedCount: 2,
      totalEstimateCzk: 662,
    }));
  });

  it('selects Labshop from a provider-selection draft and shows provider offers/tests', () => {
    const draft = buildLabOrderDraft('Order B12 and folate tests for me');
    const selected = selectProviderForDraft(draft, 'cz.labshop');

    expect(selected.status).toBe('draft');
    expect(selected.providerId).toBe('cz.labshop');
    expect(selected.offers[0]).toEqual(expect.objectContaining({ providerProductId: '20036' }));
    expect(selected.products[0]).toEqual(expect.objectContaining({ name: 'Vitaminy B - Basic' }));
  });

  it('selects Unilabs as the second lab and shows a request-form test list', () => {
    const draft = buildLabOrderDraft('Order B12 and folate tests for me');
    const selected = selectProviderForDraft(draft, 'cz.unilabs');

    expect(selected.status).toBe('draft');
    expect(selected.providerId).toBe('cz.unilabs');
    expect(selected.offers[0]).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      providerProductId: 'unilabs-custom-cart',
      coverage: 'exact',
    }));
    expect(selected.products.map(p => p.providerProductId)).toEqual(expect.arrayContaining(['2885', '2886']));
    expect(selected.products[0].markers).toEqual(expect.arrayContaining(['Vitamin B12']));
    expect(selected.safetyBoundary).toMatch(/Unilabs.*cart/i);
  });
});
