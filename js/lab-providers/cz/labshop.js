// cz/labshop.js — Labshop provider offer adapter.
//
// Code owns adapter/matching logic; real provider catalogue rows are
// runtime/private data injected through provider-catalogue-source or
// options.catalogueItems.

import { COVERAGE } from '../../lab-standards/standards-types.js';
import { getExternalIdsForMarker } from '../../lab-standards/marker-crosswalk.js';
import {
  LABSHOP_CATALOGUE_SOURCE,
  findLabshopCatalogueMatches,
} from './labshop-catalog.js';
import { getProviderCatalogueItems } from '../provider-catalogue-source.js';

const LABSHOP_CHECKOUT = Object.freeze({
  addToCartEndpoint: '/kosik/pridat-do-kosiku',
  requiresAntiforgeryToken: true,
  checkoutUrl: 'https://www.labshop.cz/kosik/prehled',
});



function preferredNclpForMarker(marker) {
  const fromIntent = (marker.nclpCandidates || []).find(candidate => candidate?.standard === 'NCLP' && candidate.code);
  if (fromIntent) return fromIntent;
  return getExternalIdsForMarker(marker.markerKey, 'nclp')
    .find(candidate => candidate?.code && (!candidate.relation || candidate.relation === 'exact')) || null;
}

function makeCatalogOffer(marker, product, match = {}) {
  const nclp = preferredNclpForMarker(marker);
  return {
    providerId: 'cz.labshop',
    providerProductId: product.providerProductId,
    name: product.name,
    priceCzk: product.priceCzk,
    coverage: COVERAGE.EXACT,
    confidence: 'public_labshop_embedded_catalogue',
    covers: [{
      markerKey: marker.markerKey,
      displayName: marker.displayName || product.name,
      standard: nclp ? 'NCLP' : null,
      code: nclp?.code || null,
      system: nclp?.system || null,
      coverage: COVERAGE.EXACT,
      confidence: 'public_labshop_embedded_catalogue',
      matchType: match.matchType || 'catalogue_match',
      note: `Mapped from Labshop /produkty/vysetreni embedded catalogue (${product.shortcut || product.name}).`,
    }],
    matchedMarkerKeys: [marker.markerKey],
    catalogueSource: product.source || LABSHOP_CATALOGUE_SOURCE,
    shortcut: product.shortcut || null,
    groupName: product.groupName || null,
    checkout: {
      ...LABSHOP_CHECKOUT,
      productUrl: product.url ? `https://www.labshop.cz${product.url}` : null,
    },
  };
}

export function getLabshopProduct(productId, options = {}) {
  const fallback = [];
  const catalogueItems = options.catalogueItems || getProviderCatalogueItems('cz.labshop', { fallback });
  return catalogueItems.find(product => product.providerProductId === String(productId)) || null;
}


export function findLabshopOffersForMarkers(markerIntents = [], options = {}) {
  const requestedMarkers = markerIntents.filter(intent => intent?.markerKey);
  if (!requestedMarkers.length) return [];

  const fallback = [];
  const catalogueItems = Array.isArray(options.catalogueItems)
    ? options.catalogueItems
    : getProviderCatalogueItems('cz.labshop', { fallback });
  const matchesByKey = new Map(findLabshopCatalogueMatches(requestedMarkers, catalogueItems)
    .map(match => [match.markerKey, match]));

  const catalogOffers = requestedMarkers
    .map(marker => {
      const match = matchesByKey.get(marker.markerKey);
      return match ? makeCatalogOffer(marker, match.product, match) : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.priceCzk ?? Infinity) - (b.priceCzk ?? Infinity) || a.name.localeCompare(b.name, 'cs'));

  return catalogOffers;
}
