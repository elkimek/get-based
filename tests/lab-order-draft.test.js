import { describe, expect, it } from 'vitest';

import {
  buildLabOrderDraft,
  buildLabOrderDraftFromMarkers,
  detectLabOrderIntent,
  selectProviderForDraft,
  shouldDeferLabOrderDraftForRecommendation,
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

  it('expands common panel names into many requested markers for visual/provider comparison testing', () => {
    const draft = buildLabOrderDraft('Order complete metabolic panel');

    expect(draft.status).toBe('provider_selection');
    expect(draft.requestedMarkers).toHaveLength(14);
    expect(draft.requestedMarkers.map(m => m.displayName)).toEqual(expect.arrayContaining([
      'Glucose',
      'Creatinine',
      'Sodium',
      'Potassium',
      'Albumin',
      'ALT',
      'AST',
      'Total bilirubin',
    ]));
    expect(draft.providerComparisons.every(row => row.requestedCount === 14)).toBe(true);
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

  it('defers recommendation-plus-order prompts so the LLM can generate the full marker plan first', () => {
    const prompt = 'Based on my CMT2A and fatigue, what blood tests would you recommend next? Include ceruloplasmin, RBC magnesium, omega-3 index, neurofilament light chain, GDF15, FGF21, lactate, pyruvate, CoQ10, copper, zinc, homocysteine, B12, folate, ferritin, hs-CRP, TSH, free T3, free T4, testosterone, SHBG, LH, FSH, and vitamin D. Then create a lab order draft and compare Labshop vs Unilabs coverage.';

    expect(shouldDeferLabOrderDraftForRecommendation(prompt)).toBe(true);
    expect(buildLabOrderDraft(prompt)).toBeNull();
  });

  it('can build provider comparison from a rich post-LLM plan without dropping unmapped recommendations', () => {
    const markerIntents = [
      { markerKey: 'vitamins.vitaminB12', displayName: 'Vitamin B12' },
      { markerKey: 'vitamins.folate', displayName: 'Folate' },
      { markerKey: 'iron.ferritin', displayName: 'Ferritin' },
      { markerKey: 'unmapped.neurofilament_light_chain', displayName: 'Neurofilament light chain', confidence: 'llm_recommended_unmapped' },
      { markerKey: 'unmapped.gdf15', displayName: 'GDF15', confidence: 'llm_recommended_unmapped' },
    ];
    const draft = buildLabOrderDraftFromMarkers(markerIntents, { userRequest: 'compare Labshop vs Unilabs' });

    expect(draft.status).toBe('provider_selection');
    expect(draft.requestedMarkers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'vitamins.vitaminB12',
      'vitamins.folate',
      'iron.ferritin',
      'unmapped.neurofilament_light_chain',
      'unmapped.gdf15',
    ]));
    expect(draft.providerComparisons.every(row => row.requestedCount === 5)).toBe(true);
    expect(draft.providerComparisons.some(row => row.missingMarkerKeys.includes('unmapped.neurofilament_light_chain'))).toBe(true);
  });
});
