// cz/unilabs.js — Unilabs.cz provider adapter.
// Uses the public Unilabs Online configurator product IDs discovered from
// https://cz.unilabs.online/sestavte-si-vlastni-vysetreni. Final booking,
// identity, slot selection, and payment stay user-in-loop.

import { COVERAGE } from '../../lab-standards/standards-types.js';

export const UNILABS_PRODUCTS_BY_MARKER = Object.freeze({
  'vitamins.vitaminB12': {
    providerId: 'cz.unilabs',
    providerProductId: '2885',
    name: 'Vitamín B12',
    priceCzk: 291,
    markerKey: 'vitamins.vitaminB12',
    displayName: 'Vitamin B12',
  },
  'vitamins.folate': {
    providerId: 'cz.unilabs',
    providerProductId: '2886',
    name: 'Kyselina listová (folát, vitamín B9)',
    priceCzk: 290,
    markerKey: 'vitamins.folate',
    displayName: 'Folate',
  },
  'coagulation.homocysteine': {
    providerId: 'cz.unilabs',
    providerProductId: '3082',
    name: 'Homocystein',
    priceCzk: 571,
    markerKey: 'coagulation.homocysteine',
    displayName: 'Homocysteine',
  },
});

export const UNILABS_BLOOD_DRAW_FEE_CZK = 81;

export function findUnilabsOffersForMarkers(markerIntents = []) {
  const requested = markerIntents.filter(intent => intent?.markerKey);
  const matched = requested
    .map(intent => UNILABS_PRODUCTS_BY_MARKER[intent.markerKey])
    .filter(Boolean);
  if (!matched.length) return [];
  const covered = matched.map(product => ({
    markerKey: product.markerKey,
    displayName: product.displayName,
    standard: 'NCLP',
    code: null,
    coverage: COVERAGE.EXACT,
    confidence: 'public_unilabs_online_configurator',
    note: 'Mapped from Unilabs Online custom-test configurator product ID.',
  }));
  return [{
    providerId: 'cz.unilabs',
    providerProductId: 'unilabs-custom-cart',
    name: 'Unilabs custom test cart',
    priceCzk: matched.reduce((sum, product) => sum + product.priceCzk, UNILABS_BLOOD_DRAW_FEE_CZK),
    bloodDrawFeeCzk: UNILABS_BLOOD_DRAW_FEE_CZK,
    coverage: COVERAGE.EXACT,
    covers: covered,
    items: matched,
    checkout: {
      checkoutUrl: 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni',
      cartUrl: 'https://cz.unilabs.online/cart?step=1',
      handoffType: 'server_session_preview_or_browser_user_handoff',
      requiresUserSlotAndPayment: true,
    },
  }];
}
