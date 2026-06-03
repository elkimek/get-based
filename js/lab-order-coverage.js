// lab-order-coverage.js — provider coverage matrix and ordering strategy recommendations.

import { getProvidersForLocation } from './lab-providers/provider-registry.js';
import { findLabshopOffersForMarkers } from './lab-providers/cz/labshop.js';
import { findUnilabsOffersForMarkers } from './lab-providers/cz/unilabs.js';

function offersForProvider(providerId, markerIntents) {
  if (providerId === 'cz.labshop') return findLabshopOffersForMarkers(markerIntents);
  if (providerId === 'cz.unilabs') return findUnilabsOffersForMarkers(markerIntents);
  return [];
}

function markerName(marker) {
  return marker.displayName || marker.markerKey?.split('.').pop() || marker.markerKey || 'Marker';
}

function productUnitPrice(offer, markerKey) {
  const item = (offer.items || []).find(i => i.markerKey === markerKey);
  if (item) return item.priceCzk ?? null;
  return offer.priceCzk ?? null;
}

function productIdForMarker(offer, markerKey) {
  const item = (offer.items || []).find(i => i.markerKey === markerKey);
  return item?.providerProductId || offer.providerProductId || null;
}

function productNameForMarker(offer, markerKey) {
  const item = (offer.items || []).find(i => i.markerKey === markerKey);
  return item?.name || offer.name || null;
}

function buildProviderRow(provider, markerIntents) {
  const offers = offersForProvider(provider.id, markerIntents);
  const cells = {};
  const coveredMarkerKeys = [];
  const missingMarkerKeys = [];
  const matchedOffers = new Map();

  for (const marker of markerIntents) {
    const markerKey = marker.markerKey;
    const match = offers.find(offer =>
      (offer.covers || []).some(cover => cover.markerKey === markerKey) ||
      (offer.items || []).some(item => item.markerKey === markerKey)
    );

    if (!match) {
      missingMarkerKeys.push(markerKey);
      cells[markerKey] = {
        markerKey,
        displayName: markerName(marker),
        status: 'missing',
        coverage: 'unavailable',
        providerProductId: null,
        providerProductName: null,
        priceCzk: null,
        confidence: 'not_mapped',
        specimen: null,
      };
      continue;
    }

    matchedOffers.set(match.providerProductId, match);
    coveredMarkerKeys.push(markerKey);
    const cover = (match.covers || []).find(c => c.markerKey === markerKey);
    const item = (match.items || []).find(i => i.markerKey === markerKey);
    cells[markerKey] = {
      markerKey,
      displayName: cover?.displayName || item?.displayName || markerName(marker),
      status: 'covered',
      coverage: cover?.coverage || match.coverage || 'exact',
      providerProductId: productIdForMarker(match, markerKey),
      providerProductName: productNameForMarker(match, markerKey),
      priceCzk: productUnitPrice(match, markerKey),
      confidence: cover?.confidence || match.confidence || 'provider_adapter',
      specimen: cover?.system || null,
    };
  }

  const mandatoryFeesCzk = [...matchedOffers.values()].reduce((sum, offer) => sum + (Number(offer.bloodDrawFeeCzk) || 0), 0);
  const productTotalCzk = [...matchedOffers.values()].reduce((sum, offer) => sum + (Number(offer.priceCzk) || 0), 0);

  return {
    providerId: provider.id,
    name: provider.name,
    capabilities: provider.capabilities || {},
    requestedCount: markerIntents.length,
    coveredCount: coveredMarkerKeys.length,
    coveragePercent: markerIntents.length ? Math.round((coveredMarkerKeys.length / markerIntents.length) * 100) : 0,
    coveredMarkerKeys,
    missingMarkerKeys,
    mandatoryFeesCzk,
    totalEstimateCzk: matchedOffers.size ? productTotalCzk : null,
    offerCount: offers.length,
    offers,
    cells,
  };
}

export function buildProviderCoverageMatrix(markerIntents = [], options = {}) {
  const country = String(options.country || 'CZ').toUpperCase();
  const requestedMarkers = markerIntents.filter(marker => marker?.markerKey).map(marker => ({
    markerKey: marker.markerKey,
    displayName: markerName(marker),
    priority: marker.priority || 'core',
  }));
  const providers = getProvidersForLocation({ country })
    .map(provider => buildProviderRow(provider, requestedMarkers))
    .sort((a, b) => b.coveredCount - a.coveredCount || (a.totalEstimateCzk ?? Infinity) - (b.totalEstimateCzk ?? Infinity));
  return { country, requestedMarkers, providers };
}

function cheapestCompleteProvider(matrix) {
  return matrix.providers
    .filter(provider => provider.coveredCount === matrix.requestedMarkers.length)
    .sort((a, b) => (a.totalEstimateCzk ?? Infinity) - (b.totalEstimateCzk ?? Infinity))[0] || null;
}

function bestCoverageProvider(matrix) {
  return [...matrix.providers]
    .sort((a, b) => b.coveredCount - a.coveredCount || (a.totalEstimateCzk ?? Infinity) - (b.totalEstimateCzk ?? Infinity))[0] || null;
}

function providerSubtotalForMarkers(provider, markerKeys) {
  const offerIds = new Set();
  let itemSubtotal = 0;
  for (const markerKey of markerKeys) {
    const cell = provider.cells[markerKey];
    if (!cell || cell.status !== 'covered') continue;
    const offer = provider.offers.find(o => o.providerProductId === cell.providerProductId || (o.items || []).some(i => i.providerProductId === cell.providerProductId));
    if (offer?.items?.length) {
      itemSubtotal += Number(cell.priceCzk) || 0;
      offerIds.add(offer.providerProductId);
    } else if (offer && !offerIds.has(offer.providerProductId)) {
      itemSubtotal += Number(offer.priceCzk) || 0;
      offerIds.add(offer.providerProductId);
    }
  }
  const fees = [...offerIds].reduce((sum, offerId) => {
    const offer = provider.offers.find(o => o.providerProductId === offerId);
    return sum + (Number(offer?.bloodDrawFeeCzk) || 0);
  }, 0);
  return itemSubtotal + fees;
}

function subsets(values) {
  const out = [];
  const count = 1 << values.length;
  for (let mask = 1; mask < count; mask += 1) {
    out.push(values.filter((_, idx) => mask & (1 << idx)));
  }
  return out;
}

function cheapestSplitOrder(matrix) {
  const requestedKeys = matrix.requestedMarkers.map(m => m.markerKey);
  let best = null;
  for (const provider of matrix.providers) {
    const coverable = requestedKeys.filter(markerKey => provider.cells[markerKey]?.status === 'covered');
    for (const markerKeys of subsets(coverable)) {
      const selected = [{
        providerId: provider.providerId,
        name: provider.name,
        markerKeys,
        totalEstimateCzk: providerSubtotalForMarkers(provider, markerKeys),
      }];
      const covered = new Set(markerKeys);

      for (const markerKey of requestedKeys) {
        if (covered.has(markerKey)) continue;
        const candidates = matrix.providers
          .filter(p => p.providerId !== provider.providerId && p.cells[markerKey]?.status === 'covered')
          .map(p => ({ provider: p, cost: providerSubtotalForMarkers(p, [markerKey]) }))
          .sort((a, b) => a.cost - b.cost);
        if (!candidates.length) continue;
        const chosen = candidates[0].provider;
        let row = selected.find(x => x.providerId === chosen.providerId);
        if (!row) {
          row = { providerId: chosen.providerId, name: chosen.name, markerKeys: [], totalEstimateCzk: 0 };
          selected.push(row);
        }
        row.markerKeys.push(markerKey);
        covered.add(markerKey);
      }

      selected.forEach(row => {
        const p = matrix.providers.find(providerRow => providerRow.providerId === row.providerId);
        row.totalEstimateCzk = providerSubtotalForMarkers(p, row.markerKeys);
      });
      const complete = requestedKeys.every(markerKey => covered.has(markerKey));
      const totalEstimateCzk = selected.reduce((sum, row) => sum + row.totalEstimateCzk, 0);
      const candidate = {
        complete,
        providerCount: selected.length,
        totalEstimateCzk,
        providers: selected.sort((a, b) => requestedKeys.indexOf(a.markerKeys[0]) - requestedKeys.indexOf(b.markerKeys[0])),
        missingMarkerKeys: requestedKeys.filter(markerKey => !covered.has(markerKey)),
      };
      if (!best || (candidate.complete && !best.complete) ||
        (candidate.complete === best.complete && candidate.totalEstimateCzk < best.totalEstimateCzk) ||
        (candidate.complete === best.complete && candidate.totalEstimateCzk === best.totalEstimateCzk && candidate.providerCount < best.providerCount)) {
        best = candidate;
      }
    }
  }
  return best;
}

export function recommendLabOrderStrategy(matrix) {
  const bestCoverage = bestCoverageProvider(matrix);
  const cheapestComplete = cheapestCompleteProvider(matrix);
  const cheapestSplit = cheapestSplitOrder(matrix);
  return { bestCoverage, cheapestComplete, cheapestSplit };
}
