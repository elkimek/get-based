// cz/labshop.js — Labshop provider offer mapping.
// Provider products live here, not in MARKER_SCHEMA and not in the standards
// crosswalk. Coverage is explicit because panels are not marker-equivalent.

import { COVERAGE } from '../../lab-standards/standards-types.js';

export const LABSHOP_PRODUCTS = Object.freeze({
  '20036': {
    providerId: 'cz.labshop',
    providerProductId: '20036',
    name: 'Vitaminy B - Basic',
    priceCzk: 500,
    coverage: COVERAGE.PANEL_CONTAINS,
    covers: [
      { markerKey: 'vitamins.vitaminB12', standard: 'NCLP', code: null, coverage: COVERAGE.PANEL_CONTAINS, confidence: 'manual', note: 'Labshop public product/card data has no confirmed NČLP code.' },
      { markerKey: 'vitamins.folate', standard: 'NCLP', code: '07322', coverage: COVERAGE.PANEL_CONTAINS, confidence: 'manual', note: 'Panel coverage inferred from product name; verify detail text before production.' },
    ],
    checkout: {
      addToCartEndpoint: '/kosik/pridat-do-kosiku',
      requiresAntiforgeryToken: true,
      checkoutUrl: 'https://www.labshop.cz/kosik/prehled',
    },
  },
  '20037': {
    providerId: 'cz.labshop',
    providerProductId: '20037',
    name: 'Vitaminy B - Complete',
    priceCzk: 3900,
    coverage: COVERAGE.PANEL_CONTAINS,
    covers: [
      { markerKey: 'vitamins.vitaminB12', standard: 'NCLP', code: null, coverage: COVERAGE.PANEL_CONTAINS, confidence: 'manual' },
      { markerKey: 'vitamins.folate', standard: 'NCLP', code: '07322', coverage: COVERAGE.PANEL_CONTAINS, confidence: 'manual' },
    ],
    checkout: {
      addToCartEndpoint: '/kosik/pridat-do-kosiku',
      requiresAntiforgeryToken: true,
      checkoutUrl: 'https://www.labshop.cz/kosik/prehled',
    },
  },
});

export function getLabshopProduct(productId) {
  return LABSHOP_PRODUCTS[String(productId)] || null;
}

export function findLabshopOffersForMarkers(markerIntents = []) {
  const requested = new Set(markerIntents.map(intent => intent.markerKey).filter(Boolean));
  if (!requested.size) return [];
  const offers = Object.values(LABSHOP_PRODUCTS)
    .map(product => {
      const matchingCovers = product.covers.filter(cover => requested.has(cover.markerKey));
      if (!matchingCovers.length) return null;
      return {
        ...product,
        covers: matchingCovers,
        matchedMarkerKeys: matchingCovers.map(cover => cover.markerKey),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.matchedMarkerKeys.length - a.matchedMarkerKeys.length || a.priceCzk - b.priceCzk);
  const bestCoverage = offers[0]?.matchedMarkerKeys.length || 0;
  return offers.filter(offer => offer.matchedMarkerKeys.length === bestCoverage && offer.priceCzk === offers[0].priceCzk);
}
