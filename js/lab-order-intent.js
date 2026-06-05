// lab-order-intent.js — safe deterministic lab order draft preview.
// Explicit order/prep requests become marker intents, then provider options,
// then provider-specific offers only after the user chooses a lab.

import { getMarkerCrosswalk, resolveMarkerAliases } from './lab-standards/marker-crosswalk.js';
import { findLabshopOffersForMarkers } from './lab-providers/cz/labshop.js';
import { findUnilabsOffersForMarkers } from './lab-providers/cz/unilabs.js';
import { getProviderById, getProvidersForLocation } from './lab-providers/provider-registry.js';
import { buildProviderCoverageMatrix, markerIntentsWithDerivedDependencies, recommendLabOrderStrategy } from './lab-order-coverage.js';

const ORDER_TERMS = [
  'order', 'objedn', 'koupit', 'buy', 'prepare', 'připrav', 'make cart',
  'cart', 'košík', 'kosik', 'labshop', 'unilabs', 'samoplátce', 'samoplatce'
];

const SOFT_ORDER_TERMS = ['i want', 'i need', 'can we check', 'check', 'panel', 'bloodwork', 'blood work', 'tests', 'labs'];

const DIRECT_MARKER_OVERRIDES = Object.freeze([
  { pattern: /\b(?:vitamin\s*d|25\s*oh\s*d|25\(oh\)d)\b/i, markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' },
  { pattern: /\bferritin\b/i, markerKey: 'iron.ferritin', displayName: 'Ferritin' },
  { pattern: /\b(?:mma|methylmalonic\s+acid)\b/i, markerKey: 'unmapped.mma', displayName: 'MMA' },
]);

const RECOMMENDATION_TERMS = [
  'recommend', 'doporuč', 'doporuc', 'what blood tests', 'what tests',
  'what should i test', 'what should i get tested', 'what labs', 'what markers',
  'which markers', 'test next', 'check next', 'next blood draw', 'next labs'
];

const PROVIDER_SUMMARIES = {
  'cz.labshop': 'Cart handoff available · prices known for mapped panels',
  'cz.unilabs': 'Second lab option · request/catalog flow to confirm',
};

const PANEL_INTENTS = [
  {
    terms: ['complete metabolic panel', 'cmp', 'comprehensive metabolic panel'],
    markers: [
      ['biochemistry.glucose', 'Glucose'],
      ['kidney.urea', 'Urea / BUN'],
      ['kidney.creatinine', 'Creatinine'],
      ['electrolytes.sodium', 'Sodium'],
      ['electrolytes.potassium', 'Potassium'],
      ['electrolytes.chloride', 'Chloride'],
      ['electrolytes.co2', 'CO₂ / bicarbonate'],
      ['minerals.calcium', 'Calcium'],
      ['proteins.albumin', 'Albumin'],
      ['proteins.totalProtein', 'Total protein'],
      ['liver.alp', 'ALP'],
      ['liver.alt', 'ALT'],
      ['liver.ast', 'AST'],
      ['liver.bilirubinTotal', 'Total bilirubin'],
    ],
  },
];

function providerFromText(lower) {
  if (lower.includes('labshop') || lower.includes('lab shop')) return 'cz.labshop';
  if (lower.includes('unilabs') || lower.includes('uni labs')) return 'cz.unilabs';
  return null;
}

function markerDisplayName(markerKey) {
  return getMarkerCrosswalk(markerKey)?.canonicalName || markerKey.split('.').pop() || markerKey;
}

function addPanelMarkers(raw, markerKeys, displayNameByKey) {
  const normalized = raw.toLowerCase();
  for (const panel of PANEL_INTENTS) {
    if (!panel.terms.some(term => normalized.includes(term))) continue;
    for (const [markerKey, displayName] of panel.markers) {
      markerKeys.add(markerKey);
      displayNameByKey.set(markerKey, displayName);
    }
  }
}

function addDirectMarkerOverrides(raw, markerKeys, displayNameByKey) {
  for (const override of DIRECT_MARKER_OVERRIDES) {
    if (!override.pattern.test(raw)) continue;
    markerKeys.add(override.markerKey);
    displayNameByKey.set(override.markerKey, override.displayName);
  }
}

export function shouldDeferLabOrderDraftForRecommendation(text) {
  const lower = String(text || '').toLowerCase();
  const hasOrderVerb = ORDER_TERMS.some(term => lower.includes(term));
  const asksForRecommendation = RECOMMENDATION_TERMS.some(term => lower.includes(term));
  return hasOrderVerb && asksForRecommendation;
}

function buildProviderOptions(country = 'CZ') {
  return getProvidersForLocation({ country }).map(provider => ({
    providerId: provider.id,
    name: provider.name,
    summary: PROVIDER_SUMMARIES[provider.id] || 'Provider available',
    capabilities: provider.capabilities || {},
  }));
}

function offersForProvider(providerId, markerIntents) {
  const lookupIntents = markerIntentsWithDerivedDependencies(markerIntents);
  if (providerId === 'cz.labshop') return findLabshopOffersForMarkers(lookupIntents);
  if (providerId === 'cz.unilabs') return findUnilabsOffersForMarkers(lookupIntents);
  return [];
}

function providerComparisonFromRow(provider) {
  return {
    providerId: provider.providerId,
    name: provider.name,
    summary: PROVIDER_SUMMARIES[provider.providerId] || 'Provider available',
    capabilities: provider.capabilities || {},
    requestedCount: provider.requestedCount,
    coveredCount: provider.coveredCount,
    coveragePercent: provider.coveragePercent,
    coveredMarkerKeys: provider.coveredMarkerKeys,
    missingMarkerKeys: provider.missingMarkerKeys,
    calculatedMarkerKeys: provider.calculatedMarkerKeys || [],
    coverageByMarker: Object.fromEntries(Object.entries(provider.cells).map(([markerKey, cell]) => [markerKey, cell.coverage])),
    cells: provider.cells,
    mandatoryFeesCzk: provider.mandatoryFeesCzk,
    totalEstimateCzk: provider.totalEstimateCzk,
    offerCount: provider.offerCount,
    catalogueLoaded: provider.catalogueLoaded,
    products: productsFromOffers(provider.providerId, provider.offers, provider.requestedMarkers || []),
  };
}

function buildProviderComparisonsFromMatrix(matrix) {
  return matrix.providers.map(provider => providerComparisonFromRow({ ...provider, requestedMarkers: matrix.requestedMarkers }));
}

function buildProviderComparisons(markerIntents = [], country = 'CZ') {
  return buildProviderComparisonsFromMatrix(buildProviderCoverageMatrix(markerIntents, { country }));
}

function productsFromOffers(providerId, offers, markerIntents) {
  const markerNameByKey = new Map(markerIntents.map(intent => [intent.markerKey, intent.displayName]));
  if (providerId === 'cz.unilabs') {
    return offers.flatMap(offer => {
      if (offer.items?.length) {
        return offer.items.map(item => ({
          providerProductId: item.providerProductId,
          name: item.name,
          priceCzk: item.priceCzk,
          url: offer.checkout?.checkoutUrl || 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni',
          markers: [item.displayName || markerNameByKey.get(item.markerKey) || item.markerKey],
          note: 'Unilabs Online configurator product mapped from requested marker.',
        }));
      }
      return [{
        providerProductId: offer.providerProductId,
        name: offer.name,
        priceCzk: offer.priceCzk,
        url: offer.checkout?.checkoutUrl || 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni',
        markers: (offer.covers || []).map(cover => cover.displayName || markerNameByKey.get(cover.markerKey) || cover.markerKey),
        note: 'Unilabs Online panel mapped from requested markers.',
      }];
    });
  }
  return offers.map(offer => ({
    providerProductId: offer.providerProductId,
    name: offer.name,
    priceCzk: offer.priceCzk,
    url: offer.checkout?.checkoutUrl || (providerId === 'cz.labshop' ? 'https://www.labshop.cz/kosik/prehled' : 'https://www.unilabs.cz/'),
    markers: (offer.covers || []).map(cover => cover.displayName || markerNameByKey.get(cover.markerKey) || cover.markerKey),
    note: providerId === 'cz.unilabs'
      ? 'Unilabs request-form/catalog flow still needs reconnaissance.'
      : 'Provider offer mapped from lab-order provider layer.',
  }));
}

function safetyBoundaryForProvider(providerId) {
  if (providerId === 'cz.unilabs') {
    return 'Unilabs cart handoff only: getbased can prepare the selected Unilabs Online configurator tests, then you choose collection site/slot and handle identity/payment yourself.';
  }
  return 'Demo preview only: this drafts a provider cart plan. Real cart filling needs browser-side automation or a provider-supported cart/session transfer; final checkout/payment stays user-in-loop.';
}

export function detectLabOrderIntent(text) {
  const raw = String(text || '').trim();
  if (!raw) return { isOrderIntent: false, markerIntents: [], offers: [], providerOptions: [] };
  const lower = raw.toLowerCase();
  const hasOrderVerb = ORDER_TERMS.some(term => lower.includes(term));
  const markerKeys = new Set();
  const displayNameByKey = new Map();
  for (const term of raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    resolveMarkerAliases(term).forEach(key => markerKeys.add(key));
  }
  resolveMarkerAliases(raw).forEach(key => markerKeys.add(key));
  addPanelMarkers(raw, markerKeys, displayNameByKey);
  addDirectMarkerOverrides(raw, markerKeys, displayNameByKey);
  const markerIntents = [...markerKeys].map(markerKey => ({
    markerKey,
    displayName: displayNameByKey.get(markerKey) || markerDisplayName(markerKey),
    reason: 'Requested by user for lab ordering',
    priority: 'core',
  }));
  const providerId = providerFromText(lower);
  const offers = providerId ? offersForProvider(providerId, markerIntents) : [];
  const providerOptions = providerId ? [] : buildProviderOptions('CZ');
  const coverageMatrix = providerId ? null : buildProviderCoverageMatrix(markerIntents, { country: 'CZ' });
  const providerComparisons = coverageMatrix ? buildProviderComparisonsFromMatrix(coverageMatrix) : [];
  const providerRecommendation = coverageMatrix ? recommendLabOrderStrategy(coverageMatrix) : null;
  const hasSoftOrderIntent = SOFT_ORDER_TERMS.some(term => lower.includes(term));
  const isOrderIntent = (hasOrderVerb || hasSoftOrderIntent) && markerIntents.length > 0 && (!providerId || offers.length > 0);
  return {
    isOrderIntent,
    confidence: isOrderIntent ? 'preview' : 'none',
    country: 'CZ',
    providerId,
    providerOptions,
    providerComparisons,
    providerRecommendation,
    markerIntents,
    offers,
    matchedTerms: markerIntents.map(intent => intent.markerKey),
    products: offers,
  };
}

export function selectProviderForDraft(draft, providerId) {
  const provider = getProviderById(providerId);
  if (!draft || !provider) return draft;
  const markerIntents = draft.requestedMarkers || [];
  const offers = offersForProvider(providerId, markerIntents);
  const products = productsFromOffers(providerId, offers, markerIntents);
  const totalEstimateCzk = providerId === 'cz.unilabs'
    ? offers.reduce((sum, offer) => sum + (Number(offer.priceCzk) || 0) + (Number(offer.bloodDrawFeeCzk) || 0), 0)
    : products.reduce((sum, p) => sum + (Number(p.priceCzk) || 0), 0);
  return {
    ...draft,
    provider: providerId,
    providerId,
    providerName: provider.name,
    status: 'draft',
    offers,
    products,
    totalEstimateCzk: products.some(p => p.priceCzk != null) ? totalEstimateCzk : null,
    safetyBoundary: safetyBoundaryForProvider(providerId),
  };
}

export function buildLabOrderDraftFromMarkers(markerIntents = [], options = {}) {
  const providerId = options.providerId || null;
  const country = options.country || 'CZ';
  const providerOptions = providerId ? [] : buildProviderOptions(country);
  const coverageMatrix = buildProviderCoverageMatrix(markerIntents, { country });
  const providerComparisons = providerId ? [] : buildProviderComparisonsFromMatrix(coverageMatrix);
  const providerRecommendation = providerId ? null : recommendLabOrderStrategy(coverageMatrix);
  const requestedMarkers = coverageMatrix.requestedMarkers;
  const calculatedMarkers = coverageMatrix.calculatedMarkers || [];
  const base = {
    id: `laborder_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    country,
    provider: providerId || 'provider_selection',
    providerId,
    providerName: providerId ? getProviderById(providerId)?.name : null,
    status: providerId ? 'draft' : 'provider_selection',
    createdAt: new Date().toISOString(),
    userRequest: String(options.userRequest || ''),
    matchedTerms: markerIntents.map(intent => intent.markerKey),
    requestedMarkers,
    calculatedMarkers,
    originalRequestedMarkers: markerIntents,
    nationalItems: [],
    providerOptions,
    providerComparisons,
    providerRecommendation,
    offers: [],
    products: [],
    totalEstimateCzk: null,
    safetyBoundary: providerId ? safetyBoundaryForProvider(providerId) : 'Choose a lab first. getbased will show tests/offers for the selected lab and keep booking/payment user-in-loop.',
  };
  return providerId ? selectProviderForDraft(base, providerId) : base;
}

export function buildLabOrderDraft(userText) {
  if (shouldDeferLabOrderDraftForRecommendation(userText)) return null;
  const intent = detectLabOrderIntent(userText);
  if (!intent.isOrderIntent) return null;
  return buildLabOrderDraftFromMarkers(intent.markerIntents, {
    country: intent.country,
    providerId: intent.providerId,
    userRequest: userText,
  });
}

export function buildLabOrderAssistantText(draft) {
  if (!draft) return '';
  if (draft.status === 'provider_selection') {
    const markers = (draft.requestedMarkers || []).map(m => m.displayName).join(', ');
    return `I found the requested tests: ${markers}. Choose a lab and I’ll show the matching tests/offers.`;
  }
  const productLines = draft.products
    .map(p => `- ${p.name}${p.priceCzk != null ? ` — ${p.priceCzk} Kč` : ''}`)
    .join('\n');
  const providerName = draft.providerName || (draft.providerId === 'cz.unilabs' ? 'Unilabs.cz' : 'Labshop');
  return `I can prepare a ${providerName} order draft for this.\n\n${productLines}\n\nI’ll stop at handoff — no silent booking, checkout, or payment.`;
}
