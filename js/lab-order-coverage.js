// lab-order-coverage.js — provider coverage matrix and ordering strategy recommendations.

import { getProvidersForLocation } from './lab-providers/provider-registry.js';
import { getProviderCatalogueItems, getProviderSupplementalOffers } from './lab-providers/provider-catalogue-source.js';
import { findLabshopOffersForMarkers } from './lab-providers/cz/labshop.js';
import { findUnilabsOffersForMarkers } from './lab-providers/cz/unilabs.js';

function offersForProvider(providerId, markerIntents) {
  if (providerId === 'cz.labshop') return findLabshopOffersForMarkers(markerIntents);
  if (providerId === 'cz.unilabs') return findUnilabsOffersForMarkers(markerIntents);
  return [];
}

function catalogueLoadedForProvider(providerId) {
  return getProviderCatalogueItems(providerId).length > 0 || getProviderSupplementalOffers(providerId).length > 0;
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

function findOfferCoveringMarker(offers, markerKey) {
  return offers.find(offer =>
    (offer.covers || []).some(cover => cover.markerKey === markerKey) ||
    (offer.items || []).some(item => item.markerKey === markerKey)
  ) || null;
}

const PROVIDER_CATALOGUE_SOURCES = Object.freeze({
  'cz.labshop': 'labshop_embedded_data_source_products',
  'cz.unilabs': 'unilabs_online_configurator_html',
});

function diagnosticLabel(reasonCode) {
  return {
    verified_exact: 'Verified exact offer',
    verified_panel_contains: 'Verified in panel',
    verified_derived: 'Calculated from ordered dependencies',
    approximate_manual_review: 'Approximate — manual review',
    unmapped_marker: 'Unmapped marker',
    provider_catalogue_empty: 'Provider catalogue not loaded',
    no_verified_provider_offer: 'No verified online offer yet',
  }[reasonCode] || 'Coverage status unknown';
}

function reasonCodeForCoverage(coverage) {
  if (coverage === 'calculated_from_dependencies' || coverage === 'derived') return 'verified_derived';
  if (coverage === 'panel_contains') return 'verified_panel_contains';
  if (coverage === 'approximate') return 'approximate_manual_review';
  return 'verified_exact';
}

const CALCULATED_MARKER_DEFINITIONS = Object.freeze({
  'metabolism.homaIR': {
    markerKey: 'metabolism.homaIR',
    displayName: 'HOMA-IR',
    dependencies: [
      { markerKey: 'biochemistry.glucose', displayName: 'Fasting glucose' },
      { markerKey: 'metabolism.insulin', displayName: 'Fasting insulin' },
    ],
    providerProductName: 'Calculated by getbased from fasting glucose + fasting insulin',
    confidence: 'calculated_from_ordered_glucose_and_insulin',
  },
  'kidney.egfr': {
    markerKey: 'kidney.egfr',
    displayName: 'eGFR',
    dependencies: [
      { markerKey: 'biochemistry.creatinine', displayName: 'Creatinine' },
    ],
    providerProductName: 'Calculated by getbased/lab from creatinine',
    confidence: 'calculated_from_ordered_creatinine',
  },
});

function missingDiagnostic(providerId, markerKey, catalogueLoaded = true) {
  const markerResolved = Boolean(markerKey) && !String(markerKey).startsWith('unmapped.');
  const reasonCode = !catalogueLoaded
    ? 'provider_catalogue_empty'
    : markerResolved ? 'no_verified_provider_offer' : 'unmapped_marker';
  return {
    reasonCode,
    diagnosticLabel: diagnosticLabel(reasonCode),
    markerResolved,
    catalogueSearched: Boolean(catalogueLoaded && markerResolved),
    catalogueSource: markerResolved ? (PROVIDER_CATALOGUE_SOURCES[providerId] || null) : null,
    candidateProviderRows: [],
  };
}

function coveredDiagnostic(providerId, coverage, match, cover, item) {
  const reasonCode = reasonCodeForCoverage(coverage);
  return {
    reasonCode,
    diagnosticLabel: diagnosticLabel(reasonCode),
    markerResolved: true,
    catalogueSearched: true,
    catalogueSource: match?.catalogueSource || item?.source || PROVIDER_CATALOGUE_SOURCES[providerId] || null,
    candidateProviderRows: [],
    matchType: cover?.matchType || item?.matchType || match?.matchType || null,
  };
}

export function markerIntentsWithDerivedDependencies(markerIntents) {
  const out = [...markerIntents];
  const keys = new Set(out.map(marker => marker.markerKey));
  for (const marker of markerIntents) {
    const definition = CALCULATED_MARKER_DEFINITIONS[marker.markerKey];
    if (!definition) continue;
    for (const dependency of definition.dependencies) {
      if (keys.has(dependency.markerKey)) continue;
      out.push({ ...dependency, priority: 'dependency' });
      keys.add(dependency.markerKey);
    }
  }
  return out;
}

function splitOrderableAndCalculatedMarkers(markerIntents) {
  const orderableByKey = new Map();
  const calculatedByKey = new Map();
  for (const marker of markerIntents) {
    if (!marker?.markerKey) continue;
    const normalized = {
      markerKey: marker.markerKey,
      displayName: markerName(marker),
      priority: marker.priority || 'core',
      nclpStatus: marker.nclpStatus || null,
      nclpSource: marker.nclpSource || null,
      nclpCandidates: Array.isArray(marker.nclpCandidates) ? marker.nclpCandidates : [],
    };
    const definition = CALCULATED_MARKER_DEFINITIONS[normalized.markerKey];
    if (definition) {
      calculatedByKey.set(normalized.markerKey, {
        ...normalized,
        displayName: normalized.displayName || definition.displayName,
        dependencies: definition.dependencies,
        calculated: true,
      });
      for (const dependency of definition.dependencies) {
        if (!orderableByKey.has(dependency.markerKey)) {
          orderableByKey.set(dependency.markerKey, {
            ...dependency,
            priority: 'dependency',
            nclpStatus: null,
            nclpSource: null,
            nclpCandidates: [],
          });
        }
      }
      continue;
    }
    orderableByKey.set(normalized.markerKey, normalized);
  }
  return {
    requestedMarkers: [...orderableByKey.values()],
    calculatedMarkers: [...calculatedByKey.values()],
  };
}

function buildCalculatedCell(providerId, marker, cells) {
  const definition = CALCULATED_MARKER_DEFINITIONS[marker.markerKey];
  const dependencyKeys = definition?.dependencies?.map(dep => dep.markerKey) || [];
  const dependenciesCovered = dependencyKeys.every(key => cells[key]?.status === 'covered');
  const coverage = 'calculated_from_dependencies';
  return {
    markerKey: marker.markerKey,
    displayName: marker.displayName || definition?.displayName || markerName(marker),
    status: 'calculated',
    coverage,
    providerProductId: null,
    providerProductName: definition?.providerProductName || 'Calculated by getbased from ordered dependencies',
    priceCzk: 0,
    confidence: dependenciesCovered ? (definition?.confidence || 'calculated_from_ordered_dependencies') : 'calculated_dependencies_not_fully_covered',
    standard: null,
    nclpCode: null,
    specimen: null,
    dependencyMarkerKeys: dependencyKeys,
    dependenciesCovered,
    ...coveredDiagnostic(providerId, coverage, null, null, null),
  };
}

function buildProviderRow(provider, markerIntents, calculatedMarkers = []) {
  const offerLookupIntents = markerIntentsWithDerivedDependencies(markerIntents);
  const offers = offersForProvider(provider.id, offerLookupIntents);
  const catalogueLoaded = catalogueLoadedForProvider(provider.id);
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
        nclpStatus: marker.nclpStatus || null,
        nclpCandidates: Array.isArray(marker.nclpCandidates) ? marker.nclpCandidates : [],
        specimen: null,
        ...missingDiagnostic(provider.id, markerKey, catalogueLoaded),
      };
      continue;
    }

    matchedOffers.set(match.providerProductId, match);
    coveredMarkerKeys.push(markerKey);
    const cover = (match.covers || []).find(c => c.markerKey === markerKey);
    const item = (match.items || []).find(i => i.markerKey === markerKey);
    const coverage = cover?.coverage || item?.coverage || match.coverage || 'exact';
    cells[markerKey] = {
      markerKey,
      displayName: cover?.displayName || item?.displayName || markerName(marker),
      status: 'covered',
      coverage,
      providerProductId: productIdForMarker(match, markerKey),
      providerProductName: productNameForMarker(match, markerKey),
      priceCzk: productUnitPrice(match, markerKey),
      confidence: cover?.confidence || item?.confidence || match.confidence || 'provider_adapter',
      standard: cover?.standard || item?.standard || null,
      nclpCode: (cover?.standard || item?.standard) === 'NCLP' ? (cover?.code || item?.code || null) : null,
      specimen: cover?.system || item?.system || null,
      ...coveredDiagnostic(provider.id, coverage, match, cover, item),
    };
  }

  const calculatedMarkerKeys = [];
  for (const marker of calculatedMarkers) {
    calculatedMarkerKeys.push(marker.markerKey);
    cells[marker.markerKey] = buildCalculatedCell(provider.id, marker, cells);
  }

  const mandatoryFeesCzk = [...matchedOffers.values()].reduce((sum, offer) => sum + (Number(offer.bloodDrawFeeCzk) || 0), 0);
  const productTotalCzk = [...matchedOffers.values()].reduce((sum, offer) => sum + (Number(offer.priceCzk) || 0), 0);
  const totalWithFeesCzk = productTotalCzk + mandatoryFeesCzk;

  return {
    providerId: provider.id,
    name: provider.name,
    capabilities: provider.capabilities || {},
    requestedCount: markerIntents.length,
    coveredCount: coveredMarkerKeys.length,
    coveragePercent: markerIntents.length ? Math.round((coveredMarkerKeys.length / markerIntents.length) * 100) : 0,
    coveredMarkerKeys,
    missingMarkerKeys,
    calculatedMarkerKeys,
    mandatoryFeesCzk,
    totalEstimateCzk: matchedOffers.size ? totalWithFeesCzk : null,
    offerCount: offers.length,
    catalogueLoaded,
    offers,
    cells,
  };
}

export function buildProviderCoverageMatrix(markerIntents = [], options = {}) {
  const country = String(options.country || 'CZ').toUpperCase();
  const { requestedMarkers, calculatedMarkers } = splitOrderableAndCalculatedMarkers(markerIntents);
  const providers = getProvidersForLocation({ country })
    .map(provider => buildProviderRow(provider, requestedMarkers, calculatedMarkers))
    .sort((a, b) => b.coveredCount - a.coveredCount || (a.totalEstimateCzk ?? Infinity) - (b.totalEstimateCzk ?? Infinity));
  return { country, requestedMarkers, calculatedMarkers, providers };
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

function addSplitMarker(row, markerKey) {
  if (!row.markerKeys.includes(markerKey)) row.markerKeys.push(markerKey);
}

function splitCandidateFromBaseProvider(matrix, baseProvider) {
  const requestedKeys = matrix.requestedMarkers.map(m => m.markerKey);
  const selected = [];
  const baseCoverable = requestedKeys.filter(markerKey => baseProvider.cells[markerKey]?.status === 'covered');
  if (baseCoverable.length) {
    selected.push({
      providerId: baseProvider.providerId,
      name: baseProvider.name,
      markerKeys: [...baseCoverable],
      totalEstimateCzk: 0,
    });
  }
  const covered = new Set(baseCoverable);

  for (const markerKey of requestedKeys) {
    if (covered.has(markerKey)) continue;
    const candidates = matrix.providers
      .filter(provider => provider.cells[markerKey]?.status === 'covered')
      .map(provider => ({ provider, cost: providerSubtotalForMarkers(provider, [markerKey]) }))
      .sort((a, b) => a.cost - b.cost || b.provider.coveredCount - a.provider.coveredCount);
    if (!candidates.length) continue;
    const chosen = candidates[0].provider;
    let row = selected.find(x => x.providerId === chosen.providerId);
    if (!row) {
      row = { providerId: chosen.providerId, name: chosen.name, markerKeys: [], totalEstimateCzk: 0 };
      selected.push(row);
    }
    addSplitMarker(row, markerKey);
    covered.add(markerKey);
  }

  selected.forEach(row => {
    const provider = matrix.providers.find(providerRow => providerRow.providerId === row.providerId);
    row.totalEstimateCzk = providerSubtotalForMarkers(provider, row.markerKeys);
  });
  const complete = requestedKeys.every(markerKey => covered.has(markerKey));
  return {
    complete,
    providerCount: selected.length,
    totalEstimateCzk: selected.reduce((sum, row) => sum + row.totalEstimateCzk, 0),
    providers: selected.sort((a, b) => requestedKeys.indexOf(a.markerKeys[0]) - requestedKeys.indexOf(b.markerKeys[0])),
    missingMarkerKeys: requestedKeys.filter(markerKey => !covered.has(markerKey)),
  };
}

function cheapestSplitOrder(matrix) {
  let best = null;
  for (const provider of matrix.providers) {
    const candidate = splitCandidateFromBaseProvider(matrix, provider);
    if (!best || (candidate.complete && !best.complete) ||
      (candidate.complete === best.complete && candidate.totalEstimateCzk < best.totalEstimateCzk) ||
      (candidate.complete === best.complete && candidate.totalEstimateCzk === best.totalEstimateCzk && candidate.providerCount < best.providerCount)) {
      best = candidate;
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
