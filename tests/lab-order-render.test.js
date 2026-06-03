import { describe, expect, it } from 'vitest';

import { renderLabOrderCard } from '../js/lab-order-render.js';

describe('lab order card rendering', () => {
  it('renders action buttons as non-submit buttons to avoid accidental form navigation', () => {
    const html = renderLabOrderCard({
      id: 'draft-1',
      providerId: 'cz.labshop',
      provider: 'cz.labshop',
      status: 'draft',
      products: [{ providerProductId: '20036', name: 'Vitaminy B - Basic', priceCzk: 500, markers: ['vitamins.vitaminB12'] }],
      totalEstimateCzk: 500,
      safetyBoundary: 'final checkout/payment stays user-in-loop',
    }, 3);

    expect(html).toContain('type="button" class="lab-order-primary"');
    expect(html).toContain('type="button" class="lab-order-secondary"');
    expect(html).toContain('data-msg-index="3"');
  });

  it('renders provider selection as a clear single-heading card with spacious lab options', () => {
    const html = renderLabOrderCard({
      id: 'draft-provider-choice',
      provider: 'provider_selection',
      providerId: null,
      status: 'provider_selection',
      providerOptions: [
        { providerId: 'cz.labshop', name: 'Labshop', summary: 'Cart handoff available' },
        { providerId: 'cz.unilabs', name: 'Unilabs.cz', summary: 'Request flow to confirm' },
      ],
      providerComparisons: [
        { providerId: 'cz.labshop', name: 'Labshop', coveredCount: 2, requestedCount: 2, totalEstimateCzk: 500, missingMarkerKeys: [] },
        { providerId: 'cz.unilabs', name: 'Unilabs.cz', coveredCount: 2, requestedCount: 2, totalEstimateCzk: 662, missingMarkerKeys: [] },
      ],
      products: [],
      requestedMarkers: [{ displayName: 'Vitamin B12' }, { displayName: 'Folate' }],
      safetyBoundary: 'Choose a lab first.',
    }, 7);

    expect((html.match(/Choose lab/g) || [])).toHaveLength(1);
    expect(html).toContain('Compare labs');
    expect(html).toContain('lab-provider-option-card');
    expect(html).toContain('lab-provider-option-main');
    expect(html).toContain('lab-provider-option-meta');
    expect(html).toContain('Coverage and price comparison');
    expect(html).toContain('2/2 tests · 500 Kč');
    expect(html).toContain('2/2 tests · 662 Kč');
    expect(html).toContain('data-lab-order-action="select-provider"');
    expect(html).toContain('data-lab-provider-id="cz.labshop"');
    expect(html).toContain('data-lab-provider-id="cz.unilabs"');
    expect(html).not.toContain('lab-order-status">Choose lab');
    expect(html).not.toContain('cz.spadia');
  });

  it('summarizes long requested-test lists instead of flooding the chat with pills', () => {
    const requestedMarkers = Array.from({ length: 60 }, (_, index) => ({
      markerKey: `demo.marker_${index + 1}`,
      displayName: `Marker ${index + 1}`,
    }));
    const html = renderLabOrderCard({
      id: 'draft-many-markers',
      provider: 'provider_selection',
      providerId: null,
      status: 'provider_selection',
      providerOptions: [{ providerId: 'cz.labshop', name: 'Labshop' }],
      providerComparisons: [],
      requestedMarkers,
      safetyBoundary: 'Choose a lab first.',
    }, 7);

    expect(html).toContain('Show all 60 requested tests');
    expect(html).toContain('+48 more');
    expect(html).toContain('Marker 60');
    expect((html.match(/lab-order-marker-overflow/g) || [])).toHaveLength(1);
  });

  it('renders best single-lab and split-order recommendations in provider selection', () => {
    const html = renderLabOrderCard({
      id: 'draft-provider-recommendation',
      provider: 'provider_selection',
      providerId: null,
      status: 'provider_selection',
      providerOptions: [
        { providerId: 'cz.labshop', name: 'Labshop', summary: 'Cart handoff available' },
        { providerId: 'cz.unilabs', name: 'Unilabs.cz', summary: 'Request flow to confirm' },
      ],
      providerComparisons: [
        { providerId: 'cz.unilabs', name: 'Unilabs.cz', coveredCount: 4, requestedCount: 4, totalEstimateCzk: 1541, missingMarkerKeys: [] },
        { providerId: 'cz.labshop', name: 'Labshop', coveredCount: 2, requestedCount: 4, totalEstimateCzk: 500, missingMarkerKeys: ['coagulation.homocysteine', 'vitamins.holotranscobalamin'] },
      ],
      providerRecommendation: {
        bestCoverage: { providerId: 'cz.unilabs', name: 'Unilabs.cz', coveredCount: 4, requestedCount: 4, totalEstimateCzk: 1541 },
        cheapestComplete: { providerId: 'cz.unilabs', name: 'Unilabs.cz', totalEstimateCzk: 1541 },
        cheapestSplit: {
          complete: true,
          totalEstimateCzk: 1460,
          providerCount: 2,
          providers: [
            { providerId: 'cz.labshop', name: 'Labshop', markerKeys: ['vitamins.vitaminB12', 'vitamins.folate'], totalEstimateCzk: 500 },
            { providerId: 'cz.unilabs', name: 'Unilabs.cz', markerKeys: ['coagulation.homocysteine', 'vitamins.holotranscobalamin'], totalEstimateCzk: 960 },
          ],
        },
      },
      products: [],
      requestedMarkers: [
        { markerKey: 'vitamins.vitaminB12', displayName: 'Vitamin B12' },
        { markerKey: 'vitamins.folate', displayName: 'Folate' },
        { markerKey: 'coagulation.homocysteine', displayName: 'Homocysteine' },
        { markerKey: 'vitamins.holotranscobalamin', displayName: 'Active B12' },
      ],
      safetyBoundary: 'Choose a lab first.',
    }, 7);

    expect(html).toContain('Best coverage');
    expect(html).toContain('Unilabs.cz · 4/4 tests · 1 541 Kč');
    expect(html).toContain('Cheapest complete split');
    expect(html).toContain('Labshop: Vitamin B12, Folate · 500 Kč');
    expect(html).toContain('Unilabs.cz: Homocysteine, Active B12 · 960 Kč');
  });

  it('renders a change-lab button after a selected provider draft is cancelled', () => {
    const html = renderLabOrderCard({
      id: 'draft-cancelled-labshop',
      provider: 'cz.labshop',
      providerId: 'cz.labshop',
      providerName: 'Labshop',
      status: 'cancelled',
      products: [{ providerProductId: '20036', name: 'Vitaminy B - Basic', priceCzk: 500, markers: ['Vitamin B12', 'Folate'] }],
      providerOptions: [
        { providerId: 'cz.labshop', name: 'Labshop' },
        { providerId: 'cz.unilabs', name: 'Unilabs.cz' },
      ],
      totalEstimateCzk: 500,
      safetyBoundary: 'final checkout/payment stays user-in-loop',
      result: { ok: true, message: 'Order draft cancelled.' },
    }, 9);

    expect(html).toContain('Order draft cancelled.');
    expect(html).toContain('Change lab');
    expect(html).toContain('data-lab-order-action="change-provider"');
    expect(html).toContain('type="button" class="lab-order-secondary"');
    expect(html).not.toContain('Prepare Labshop cart');
  });

  it('renders selected Unilabs as a cart handoff with a Unilabs prepare button', () => {
    const html = renderLabOrderCard({
      id: 'draft-unilabs',
      provider: 'cz.unilabs',
      providerId: 'cz.unilabs',
      providerName: 'Unilabs.cz',
      status: 'draft',
      products: [{ providerProductId: '2885', name: 'Vitamín B12', priceCzk: 291, markers: ['Vitamin B12'] }],
      totalEstimateCzk: 372,
      safetyBoundary: 'Unilabs cart handoff only.',
    }, 8);

    expect(html).toContain('Unilabs.cz order preview');
    expect(html).toContain('Vitamín B12');
    expect(html).toContain('Vitamin B12');
    expect(html).toContain('Prepare Unilabs cart');
    expect(html).not.toContain('Prepare Labshop cart');
  });
});
