import { describe, expect, it } from 'vitest';

import {
  buildLabOrderDraft,
  buildLabOrderDraftFromMarkers,
  detectLabOrderIntent,
  selectProviderForDraft,
  shouldDeferLabOrderDraftForRecommendation,
} from '../js/lab-order-intent.js';
import {
  clearProviderCatalogueSourceForTests,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';
import { LABSHOP_FIXTURE_CATALOGUE } from './fixtures/lab-provider-catalogues.js';

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
    expect(draft.offers.map(offer => offer.providerProductId)).toEqual(['19711', '19312']);
    expect(draft.offers[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      providerProductId: '19711',
      coverage: 'exact',
    }));
    expect(draft.products.map(product => product.providerProductId)).toEqual(['19711', '19312']);
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
      totalEstimateCzk: 490,
    }));
    expect(draft.providerComparisons[1]).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      coveredCount: 2,
      requestedCount: 2,
      totalEstimateCzk: 581,
      mandatoryFeesCzk: 81,
    }));
  });

  it('treats a broad named panel request as actionable ordering intent', () => {
    const draft = buildLabOrderDraft('I want a broad methylation panel: B12, active B12, folate, homocysteine, MMA, vitamin D and ferritin.');

    expect(draft).not.toBeNull();
    expect(draft.status).toBe('provider_selection');
    expect(draft.requestedMarkers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'vitamins.vitaminB12',
      'vitamins.holotranscobalamin',
      'vitamins.folate',
      'coagulation.homocysteine',
      'vitamins.vitaminD',
      'iron.ferritin',
    ]));
    expect(draft.requestedMarkers.some(m => m.displayName === 'MMA')).toBe(true);
    expect(draft.providerComparisons.every(row => row.requestedCount === draft.requestedMarkers.length)).toBe(true);
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
    expect(selected.offers.map(offer => offer.providerProductId)).toEqual(['19711', '19312']);
    expect(selected.products.map(product => product.name)).toEqual(['Kyselina listová (Foláty)', 'Vitamin B12']);
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
    expect(selected.products.find(p => p.providerProductId === '2885')?.markers).toEqual(expect.arrayContaining(['Vitamin B12']));
    expect(selected.products.find(p => p.providerProductId === '2886')?.markers).toEqual(expect.arrayContaining(['Folate']));
    expect(selected.safetyBoundary).toMatch(/Unilabs.*cart/i);
  });

  it('covers Labshop TSH, free testosterone, vitamin D3, HbA1c, and liver enzymes from Czech catalogue aliases', () => {
    const draft = buildLabOrderDraftFromMarkers([
      { markerKey: 'thyroid.tsh', displayName: 'TSH' },
      { markerKey: 'hormones.freeTestosterone', displayName: 'Free testosterone' },
      { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D3' },
      { markerKey: 'diabetes.hba1c', displayName: 'HbA1c' },
      { markerKey: 'liver.alt', displayName: 'ALT' },
      { markerKey: 'liver.ggt', displayName: 'GGT' },
      { markerKey: 'liver.ast', displayName: 'AST' },
    ]);

    const labshop = draft.providerComparisons.find(row => row.providerId === 'cz.labshop');
    expect(labshop).toEqual(expect.objectContaining({
      coveredCount: 7,
      requestedCount: 7,
      totalEstimateCzk: 1218,
      missingMarkerKeys: [],
    }));
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

  it('direct provider drafts expand eGFR into the creatinine orderable dependency', () => {
    setProviderCatalogueItemsForTests('cz.labshop', LABSHOP_FIXTURE_CATALOGUE);
    try {
      const draft = buildLabOrderDraftFromMarkers([
        { markerKey: 'kidney.egfr', displayName: 'eGFR' },
      ], { providerId: 'cz.labshop', userRequest: 'Order eGFR from Labshop' });

      expect(draft.calculatedMarkers.map(m => m.markerKey)).toEqual(['kidney.egfr']);
      expect(draft.requestedMarkers.map(m => m.markerKey)).toEqual(['biochemistry.creatinine']);
      expect(draft.products.map(p => p.providerProductId)).toEqual(['19267']);
    } finally {
      clearProviderCatalogueSourceForTests();
    }
  });
});
