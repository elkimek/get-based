import { describe, expect, it } from 'vitest';

import { buildLabOrderCopyText, renderLabAdjunctCards, renderLabOrderCard, renderLabPlanCard } from '../js/lab-order-render.js';

describe('lab order card rendering', () => {
  it('renders a natural lab plan as a soft conversion card before provider comparison', () => {
    const html = renderLabPlanCard({
      id: 'plan-1',
      title: 'Suggested focused lab plan',
      markers: [
        { markerKey: 'coagulation.homocysteine', displayName: 'Homocysteine', reason: 'Functional methylation marker.' },
        { markerKey: 'vitamins.folate', displayName: 'Folate', reason: 'B9 status.' },
      ],
      safetyBoundary: 'Review first.',
    }, 4);

    expect(html).toContain('Next blood draw');
    expect(html).toContain('Plan first');
    expect(html).toContain('Homocysteine');
    expect(html).toContain('Functional methylation marker.');
    expect(html).toContain('data-lab-order-action="compare-labs-from-plan"');
    expect(html).toContain('data-lab-order-action="dismiss-lab-plan"');
    expect(html).toContain('type="button" class="lab-order-primary"');
  });

  it('renders in-progress lab comparison with a disabled busy button and progress note', () => {
    const html = renderLabPlanCard({
      id: 'plan-busy',
      title: 'Suggested focused lab plan',
      status: 'mapping_nclp',
      statusMessage: 'Checking available lab tests…',
      markers: [{ markerKey: 'vitamins.folate', displayName: 'Folate', reason: 'B9 status.' }],
      safetyBoundary: 'Review first.',
    }, 4);

    expect(html).toContain('Comparing labs…');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
    expect(html).toContain('lab-order-actions-busy');
    expect(html).toContain('Checking available lab tests…');
    expect(html).not.toContain('NČLP');
    expect(html).not.toContain('NCLP');
    expect(html).not.toContain('data-lab-order-action="dismiss-lab-plan"');
  });

  it('warns when provider catalogues are empty instead of silently showing zero coverage', () => {
    const draft = {
      id: 'order-empty-catalogue',
      provider: 'provider_selection',
      status: 'provider_selection',
      requestedMarkers: [{ markerKey: 'thyroid.tsh', displayName: 'TSH' }],
      providerOptions: [{ providerId: 'cz.labshop', name: 'Labshop' }],
      providerComparisons: [{
        providerId: 'cz.labshop',
        name: 'Labshop',
        coveredCount: 0,
        requestedCount: 1,
        totalEstimateCzk: null,
        offerCount: 0,
        catalogueLoaded: false,
        missingMarkerKeys: ['thyroid.tsh'],
        cells: {
          'thyroid.tsh': { diagnosticLabel: 'Provider catalogue not loaded' },
        },
      }],
    };

    const html = renderLabOrderCard(draft, 3);
    const copy = buildLabOrderCopyText(draft);

    expect(html).toContain('Provider catalogue not loaded for Labshop');
    expect(html).toContain('Refresh the private catalogue in local dev');
    expect(copy).toContain('Provider catalogue not loaded for Labshop');
    expect(copy).toContain('Not verified in current online source: TSH');
  });

  it('does not show catalogue-not-loaded warning when a loaded catalogue has zero matching offers', () => {
    const draft = {
      id: 'order-loaded-no-match',
      provider: 'provider_selection',
      status: 'provider_selection',
      requestedMarkers: [{ markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' }],
      providerOptions: [{ providerId: 'cz.unilabs', name: 'Unilabs.cz' }],
      providerComparisons: [{
        providerId: 'cz.unilabs',
        name: 'Unilabs.cz',
        coveredCount: 0,
        requestedCount: 1,
        totalEstimateCzk: null,
        offerCount: 0,
        catalogueLoaded: true,
        missingMarkerKeys: ['vitamins.vitaminD'],
        cells: {
          'vitamins.vitaminD': { diagnosticLabel: 'No verified online offer yet' },
        },
      }],
    };

    const html = renderLabOrderCard(draft, 3);
    const copy = buildLabOrderCopyText(draft);

    expect(html).not.toContain('Provider catalogue not loaded');
    expect(copy).not.toContain('Provider catalogue not loaded');
    expect(copy).toContain('Not verified in current online source: Vitamin D');
  });

  it('uses lab-comparison copy without plan-state wording once providers are compared', () => {
    const copy = buildLabOrderCopyText({
      id: 'order-thyroid-compare',
      provider: 'provider_selection',
      status: 'provider_selection',
      requestedMarkers: [
        { markerKey: 'thyroid.tsh', displayName: 'TSH' },
        { markerKey: 'thyroid.tgAb', displayName: 'Thyroglobulin antibodies / TgAb' },
      ],
      providerOptions: [{ providerId: 'cz.labshop', name: 'Labshop' }],
      providerComparisons: [{
        providerId: 'cz.labshop',
        name: 'Labshop',
        coveredCount: 1,
        requestedCount: 2,
        totalEstimateCzk: 200,
        missingMarkerKeys: ['thyroid.tgAb'],
      }],
      safetyBoundary: 'Final booking/payment stays user-controlled.',
    });

    expect(copy).toContain('Lab comparison');
    expect(copy).toContain('Verified online offer comparison:');
    expect(copy).toContain('- Labshop: 1/2 verified online offers — 200 Kč');
    expect(copy).toContain('Not verified in current online source: Thyroglobulin antibodies / TgAb');
    expect(copy).not.toContain('Lab order — compare labs');
    expect(copy).not.toContain('Review the tests, then compare labs');
  });

  it('renders lab plan or lab order as one progressive card, never stacked together', () => {
    const msg = {
      role: 'assistant',
      content: 'Review the tests, then compare labs when you’re ready.',
      labPlanDraft: {
        id: 'plan-1',
        title: 'Suggested focused lab plan',
        markers: [{ markerKey: 'thyroid.tsh', displayName: 'TSH', reason: 'Baseline thyroid signal.' }],
      },
      labOrderDraft: {
        id: 'order-1',
        provider: 'provider_selection',
        status: 'provider_selection',
        requestedMarkers: [{ markerKey: 'thyroid.tsh', displayName: 'TSH' }],
        providerOptions: [{ providerId: 'cz.labshop', name: 'Labshop' }],
        providerComparisons: [{ providerId: 'cz.labshop', name: 'Labshop', coveredCount: 1, requestedCount: 1, totalEstimateCzk: 200, missingMarkerKeys: [] }],
      },
    };

    const html = renderLabAdjunctCards(msg, 2);

    expect(html).toContain('Lab comparison');
    expect(html).toContain('Choose lab');
    expect(html).not.toContain('Next blood draw');
    expect(html).not.toContain('Suggested focused lab plan');
    expect((html.match(/lab-order-card/g) || [])).toHaveLength(1);
  });

  it('builds clipboard text for selected lab order previews', () => {
    const text = buildLabOrderCopyText({
      id: 'draft-1',
      providerId: 'cz.labshop',
      provider: 'cz.labshop',
      providerName: 'Labshop',
      status: 'draft',
      products: [{ providerProductId: '20036', name: 'Vitaminy B - Basic', priceCzk: 500, markers: ['Vitamin B12', 'Folate'] }],
      totalEstimateCzk: 500,
      safetyBoundary: 'final checkout/payment stays user-in-loop',
    });

    expect(text).toContain('Labshop order preview');
    expect(text).toContain('Status: Draft');
    expect(text).toContain('- Vitaminy B - Basic — 500 Kč');
    expect(text).toContain('  Markers: Vitamin B12, Folate');
    expect(text).toContain('Estimate: 500 Kč');
    expect(text).toContain('final checkout/payment stays user-in-loop');
  });

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
        { providerId: 'cz.unilabs', name: 'Unilabs.cz', coveredCount: 1, requestedCount: 2, totalEstimateCzk: 291, missingMarkerKeys: ['vitamins.vitaminD'], cells: {
          'vitamins.vitaminD': { diagnosticLabel: 'No verified online offer yet' },
        } },
      ],
      products: [],
      requestedMarkers: [{ markerKey: 'vitamins.vitaminB12', displayName: 'Vitamin B12' }, { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' }],
      safetyBoundary: 'Choose a lab first.',
    }, 7);

    expect((html.match(/Choose lab/g) || [])).toHaveLength(1);
    expect(html).toContain('Compare labs');
    expect(html).toContain('lab-provider-option-card');
    expect(html).toContain('lab-provider-option-main');
    expect(html).toContain('lab-provider-option-meta');
    expect(html).toContain('Coverage and price comparison');
    expect(html).toContain('2/2 verified · 500 Kč');
    expect(html).toContain('1/2 verified · 291 Kč');
    expect(html).toContain('Not verified 1: Vitamin D');
    expect(html).toContain('No verified online offer yet');
    expect(html).toContain('data-lab-order-action="select-provider"');
    expect(html).toContain('data-lab-provider-id="cz.labshop"');
    expect(html).toContain('data-lab-provider-id="cz.unilabs"');
    expect(html).not.toContain('lab-order-status">Choose lab');
    expect(html).not.toContain('Missing 1: Vitamin D');
    expect(html).not.toContain('cz.spadia');
  });

  it('renders calculated markers separately from orderable provider coverage', () => {
    const html = renderLabOrderCard({
      id: 'draft-calculated-markers',
      provider: 'provider_selection',
      providerId: null,
      status: 'provider_selection',
      providerOptions: [{ providerId: 'cz.labshop', name: 'Labshop' }],
      providerComparisons: [
        { providerId: 'cz.labshop', name: 'Labshop', coveredCount: 3, requestedCount: 3, totalEstimateCzk: 420, missingMarkerKeys: [], calculatedMarkerKeys: ['metabolism.homaIR', 'kidney.egfr'] },
      ],
      requestedMarkers: [
        { markerKey: 'biochemistry.glucose', displayName: 'Fasting glucose' },
        { markerKey: 'metabolism.insulin', displayName: 'Fasting insulin' },
        { markerKey: 'biochemistry.creatinine', displayName: 'Creatinine' },
      ],
      calculatedMarkers: [
        { markerKey: 'metabolism.homaIR', displayName: 'HOMA-IR' },
        { markerKey: 'kidney.egfr', displayName: 'eGFR' },
      ],
      safetyBoundary: 'Choose a lab first.',
    }, 7);

    expect(html).toContain('Orderable tests');
    expect(html).toContain('Calculated after results');
    expect(html).toContain('HOMA-IR');
    expect(html).toContain('eGFR');
    expect(html).toContain('3/3 verified · 420 Kč');
    expect(html).not.toContain('Requested tests</span>');
    expect(html).not.toContain('5/5 tests');
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

  it('labels partner-lab handoff failures as the boundary rather than an app-ordering dead end', () => {
    const html = renderLabOrderCard({
      id: 'draft-labshop-handoff-failed',
      provider: 'cz.labshop',
      providerId: 'cz.labshop',
      providerName: 'Labshop',
      status: 'failed',
      products: [{ providerProductId: '19312', name: 'Vitamín B12', priceCzk: 300, markers: ['Vitamin B12'] }],
      totalEstimateCzk: 300,
      safetyBoundary: 'Final booking/payment stays user-in-loop.',
      result: {
        ok: false,
        message: 'getbased prepared the order preview, but the partner-lab handoff did not complete. This is the handoff boundary — final booking/payment stays on Labshop.',
        checkoutUrl: 'https://www.labshop.cz/kosik/prehled',
      },
    }, 8);

    expect(html).toContain('Handoff boundary');
    expect(html).toContain('getbased prepared the order preview');
    expect(html).toContain('partner-lab handoff did not complete');
    expect(html).toContain('Continue on Labshop');
    expect(html).toContain('Prepare Labshop cart');
  });
});
