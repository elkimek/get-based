// cz/unilabs.js — Unilabs.cz provider offer adapter.
//
// Code owns adapter/matching logic; real provider catalogue rows are
// runtime/private data injected through provider-catalogue-source or
// options.catalogueItems. Final booking, identity, slot selection, and payment
// stay user-in-loop.

import { COVERAGE } from '../../lab-standards/standards-types.js';
import { getExternalIdsForMarker } from '../../lab-standards/marker-crosswalk.js';
import {
  UNILABS_CONFIGURATOR_SOURCE,
  findUnilabsCatalogueMatches,
} from './unilabs-catalog.js';
import { getProviderCatalogueItems, getProviderSupplementalOffers } from '../provider-catalogue-source.js';

export const UNILABS_BLOOD_DRAW_FEE_CZK = 81;

const UNILABS_CHECKOUT = Object.freeze({
  checkoutUrl: 'https://cz.unilabs.online/sestavte-si-vlastni-vysetreni',
  cartUrl: 'https://cz.unilabs.online/cart?step=1',
  handoffType: 'server_session_preview_or_browser_user_handoff',
  requiresUserSlotAndPayment: true,
});


function preferredNclpForMarker(marker) {
  const fromIntent = (marker.nclpCandidates || []).find(candidate => candidate?.standard === 'NCLP' && candidate.code);
  if (fromIntent) return fromIntent;
  return getExternalIdsForMarker(marker.markerKey, 'nclp')
    .find(candidate => candidate?.code && (!candidate.relation || candidate.relation === 'exact')) || null;
}

function findBestSupplementalOffer(requested, offers = []) {
  const requestedKeys = new Set(requested.map(intent => intent.markerKey).filter(Boolean));
  return offers
    .map(offer => {
      const covers = (offer.covers || []).filter(cover => requestedKeys.has(cover.markerKey));
      if (!covers.length) return null;
      return { ...offer, covers, matchedMarkerKeys: covers.map(cover => cover.markerKey) };
    })
    .filter(Boolean)
    .sort((a, b) => b.matchedMarkerKeys.length - a.matchedMarkerKeys.length || (a.priceCzk ?? Infinity) - (b.priceCzk ?? Infinity))[0] || null;
}

function makeCatalogueItem(marker, product, match = {}) {
  const nclp = preferredNclpForMarker(marker);
  const approximateCrp = marker.markerKey === 'inflammation.hsCRP' && !/hs/i.test(product.name || '');
  return {
    providerId: 'cz.unilabs',
    providerProductId: product.providerProductId,
    name: product.name,
    priceCzk: product.priceCzk,
    markerKey: marker.markerKey,
    displayName: marker.displayName || product.name,
    standard: nclp ? 'NCLP' : null,
    code: nclp?.code || null,
    system: nclp?.system || null,
    coverage: approximateCrp ? COVERAGE.APPROXIMATE : COVERAGE.EXACT,
    confidence: 'public_unilabs_online_configurator',
    matchType: match.matchType || 'catalogue_match',
    addProductPath: product.addProductPath || `/sestavte-si-vlastni-vysetreni?productId=${product.providerProductId}&do=AddProduct`,
    source: product.source || UNILABS_CONFIGURATOR_SOURCE,
    note: approximateCrp
      ? `Unilabs configurator row is CRP, not explicitly high-sensitivity CRP (${product.name}); verify before ordering if hs-CRP is required.`
      : `Mapped from Unilabs Online custom-test configurator (${product.name}).`,
  };
}

function makeCustomCartOffer(items) {
  const covered = items.map(item => ({
    markerKey: item.markerKey,
    displayName: item.displayName,
    standard: item.standard,
    code: item.code,
    system: item.system,
    coverage: item.coverage || COVERAGE.EXACT,
    confidence: item.confidence,
    matchType: item.matchType,
    note: item.note,
  }));
  return {
    providerId: 'cz.unilabs',
    providerProductId: 'unilabs-custom-cart',
    name: 'Unilabs custom test cart',
    priceCzk: items.reduce((sum, product) => sum + (Number(product.priceCzk) || 0), 0),
    bloodDrawFeeCzk: UNILABS_BLOOD_DRAW_FEE_CZK,
    coverage: COVERAGE.EXACT,
    confidence: 'public_unilabs_online_configurator',
    covers: covered,
    items,
    checkout: UNILABS_CHECKOUT,
  };
}

export function findUnilabsOffersForMarkers(markerIntents = [], options = {}) {
  const requested = markerIntents.filter(intent => intent?.markerKey);
  const supplementalOffers = Array.isArray(options.supplementalOffers)
    ? options.supplementalOffers
    : getProviderSupplementalOffers('cz.unilabs');
  const packageOffer = findBestSupplementalOffer(requested, supplementalOffers);
  const requestedCoveredByPackage = new Set((packageOffer?.covers || []).map(cover => cover.markerKey));
  const remaining = requested.filter(intent => !requestedCoveredByPackage.has(intent.markerKey));

  const fallback = [];
  const catalogueItems = Array.isArray(options.catalogueItems)
    ? options.catalogueItems
    : getProviderCatalogueItems('cz.unilabs', { fallback });
  const matchesByKey = new Map(findUnilabsCatalogueMatches(remaining, catalogueItems)
    .map(match => [match.markerKey, match]));
  const items = remaining
    .map(marker => {
      const match = matchesByKey.get(marker.markerKey);
      return match ? makeCatalogueItem(marker, match.product, match) : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.priceCzk ?? Infinity) - (b.priceCzk ?? Infinity) || a.name.localeCompare(b.name, 'cs'));

  const offers = [];
  if (packageOffer) {
    offers.push(items.length ? packageOffer : { ...packageOffer, bloodDrawFeeCzk: packageOffer.bloodDrawFeeCzk ?? UNILABS_BLOOD_DRAW_FEE_CZK });
  }
  if (items.length) offers.push(makeCustomCartOffer(items));
  return offers;
}
