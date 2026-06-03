// lab-order-intent.js — safe deterministic lab order draft preview.
// Explicit order/prep requests become marker intents, then provider options,
// then provider-specific offers only after the user chooses a lab.

import { getMarkerCrosswalk, resolveMarkerAliases } from './lab-standards/marker-crosswalk.js';
import { findLabshopOffersForMarkers } from './lab-providers/cz/labshop.js';
import { findUnilabsOffersForMarkers } from './lab-providers/cz/unilabs.js';
import { getProviderById, getProvidersForLocation } from './lab-providers/provider-registry.js';

const ORDER_TERMS = [
  'order', 'objedn', 'koupit', 'buy', 'prepare', 'připrav', 'make cart',
  'cart', 'košík', 'kosik', 'labshop', 'unilabs', 'samoplátce', 'samoplatce'
];

const PROVIDER_SUMMARIES = {
  'cz.labshop': 'Cart handoff available · prices known for mapped panels',
  'cz.unilabs': 'Second lab option · request/catalog flow to confirm',
};

function providerFromText(lower) {
  if (lower.includes('labshop') || lower.includes('lab shop')) return 'cz.labshop';
  if (lower.includes('unilabs') || lower.includes('uni labs')) return 'cz.unilabs';
  return null;
}

function markerDisplayName(markerKey) {
  return getMarkerCrosswalk(markerKey)?.canonicalName || markerKey.split('.').pop() || markerKey;
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
  if (providerId === 'cz.labshop') return findLabshopOffersForMarkers(markerIntents);
  if (providerId === 'cz.unilabs') return findUnilabsOffersForMarkers(markerIntents);
  return [];
}

function coverageFromOffers(offers = [], markerIntents = []) {
  const requestedKeys = markerIntents.map(intent => intent.markerKey).filter(Boolean);
  const coveredKeys = new Set();
  const coverageByMarker = {};
  for (const offer of offers) {
    for (const cover of offer.covers || []) {
      if (!requestedKeys.includes(cover.markerKey)) continue;
      coveredKeys.add(cover.markerKey);
      coverageByMarker[cover.markerKey] = cover.coverage || offer.coverage || 'available';
    }
    for (const item of offer.items || []) {
      if (!requestedKeys.includes(item.markerKey)) continue;
      coveredKeys.add(item.markerKey);
      coverageByMarker[item.markerKey] = offer.coverage || 'exact';
    }
  }
  const missingMarkerKeys = requestedKeys.filter(markerKey => !coveredKeys.has(markerKey));
  return {
    requestedCount: requestedKeys.length,
    coveredCount: coveredKeys.size,
    coveragePercent: requestedKeys.length ? Math.round((coveredKeys.size / requestedKeys.length) * 100) : 0,
    coveredMarkerKeys: [...coveredKeys],
    missingMarkerKeys,
    coverageByMarker,
  };
}

function buildProviderComparisons(markerIntents = [], country = 'CZ') {
  return getProvidersForLocation({ country }).map(provider => {
    const offers = offersForProvider(provider.id, markerIntents);
    const products = productsFromOffers(provider.id, offers, markerIntents);
    const totalEstimateCzk = provider.id === 'cz.unilabs'
      ? offers.reduce((sum, offer) => sum + (Number(offer.priceCzk) || 0), 0)
      : products.reduce((sum, p) => sum + (Number(p.priceCzk) || 0), 0);
    const coverage = coverageFromOffers(offers, markerIntents);
    return {
      providerId: provider.id,
      name: provider.name,
      summary: PROVIDER_SUMMARIES[provider.id] || 'Provider available',
      capabilities: provider.capabilities || {},
      requestedCount: coverage.requestedCount,
      coveredCount: coverage.coveredCount,
      coveragePercent: coverage.coveragePercent,
      coveredMarkerKeys: coverage.coveredMarkerKeys,
      missingMarkerKeys: coverage.missingMarkerKeys,
      coverageByMarker: coverage.coverageByMarker,
      totalEstimateCzk: products.some(p => p.priceCzk != null) || offers.some(o => o.priceCzk != null) ? totalEstimateCzk : null,
      offerCount: offers.length,
      products,
    };
  }).sort((a, b) => b.coveredCount - a.coveredCount || (a.totalEstimateCzk ?? Infinity) - (b.totalEstimateCzk ?? Infinity));
}

function productsFromOffers(providerId, offers, markerIntents) {
  const markerNameByKey = new Map(markerIntents.map(intent => [intent.markerKey, intent.displayName]));
  if (providerId === 'cz.unilabs') {
    return offers.flatMap(offer => (offer.items || []).map(item => ({
      providerProductId: item.providerProductId,
      name: item.name,
      priceCzk: item.priceCzk,
      url: offer.checkout?.checkoutUrl || 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni',
      markers: [item.displayName || markerNameByKey.get(item.markerKey) || item.markerKey],
      note: 'Unilabs Online configurator product mapped from requested marker.',
    })));
  }
  return offers.map(offer => ({
    providerProductId: offer.providerProductId,
    name: offer.name,
    priceCzk: offer.priceCzk,
    url: offer.checkout?.checkoutUrl || (providerId === 'cz.labshop' ? 'https://www.labshop.cz/kosik/prehled' : 'https://www.unilabs.cz/'),
    markers: offer.covers.map(cover => cover.displayName || markerNameByKey.get(cover.markerKey) || cover.markerKey),
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
  for (const term of raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    resolveMarkerAliases(term).forEach(key => markerKeys.add(key));
  }
  resolveMarkerAliases(raw).forEach(key => markerKeys.add(key));
  const markerIntents = [...markerKeys].map(markerKey => ({
    markerKey,
    displayName: markerDisplayName(markerKey),
    reason: 'Requested by user for lab ordering',
    priority: 'core',
  }));
  const providerId = providerFromText(lower);
  const offers = providerId ? offersForProvider(providerId, markerIntents) : [];
  const providerOptions = providerId ? [] : buildProviderOptions('CZ');
  const providerComparisons = providerId ? [] : buildProviderComparisons(markerIntents, 'CZ');
  const isOrderIntent = hasOrderVerb && markerIntents.length > 0 && (!providerId || offers.length > 0);
  return {
    isOrderIntent,
    confidence: isOrderIntent ? 'preview' : 'none',
    country: 'CZ',
    providerId,
    providerOptions,
    providerComparisons,
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
    ? offers.reduce((sum, offer) => sum + (Number(offer.priceCzk) || 0), 0)
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

export function buildLabOrderDraft(userText) {
  const intent = detectLabOrderIntent(userText);
  if (!intent.isOrderIntent) return null;
  const base = {
    id: `laborder_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    country: intent.country,
    provider: intent.providerId || 'provider_selection',
    providerId: intent.providerId,
    providerName: intent.providerId ? getProviderById(intent.providerId)?.name : null,
    status: intent.providerId ? 'draft' : 'provider_selection',
    createdAt: new Date().toISOString(),
    userRequest: String(userText || ''),
    matchedTerms: intent.matchedTerms,
    requestedMarkers: intent.markerIntents,
    nationalItems: [],
    providerOptions: intent.providerOptions,
    providerComparisons: intent.providerComparisons,
    offers: [],
    products: [],
    totalEstimateCzk: null,
    safetyBoundary: intent.providerId ? safetyBoundaryForProvider(intent.providerId) : 'Choose a lab first. getbased will show tests/offers for the selected lab and keep booking/payment user-in-loop.',
  };
  return intent.providerId ? selectProviderForDraft(base, intent.providerId) : base;
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
