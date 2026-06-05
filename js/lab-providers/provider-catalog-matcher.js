// provider-catalog-matcher.js — shared marker → provider catalogue matching.
//
// Provider adapters own catalogue parsing and provider-specific synonym maps.
// This module owns the common matching semantics so every new lab does not
// reimplement alias scoring, unmapped guards, and generic-token pitfalls.

import { getMarkerCrosswalk } from '../lab-standards/marker-crosswalk.js';

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

export function normalizeSearchText(value) {
  return stripTags(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenSet(value) {
  return new Set(normalizeSearchText(value).split(' ').filter(Boolean));
}

function hasTerm(haystack, term) {
  if (!haystack || !term) return false;
  if (haystack === term) return true;
  if (term.includes(' ')) return ` ${haystack} `.includes(` ${term} `);
  if (term.length <= 3) return tokenSet(haystack).has(term);
  return haystack.includes(term);
}

export function markerCatalogueTerms(marker, synonymMap = {}) {
  const row = getMarkerCrosswalk(marker.markerKey);
  const terms = [
    marker.markerKey,
    row?.canonicalName,
    ...(row?.aliases || []),
    ...(synonymMap[marker.markerKey] || []),
  ].filter(Boolean);
  return [...new Set(terms.map(normalizeSearchText).filter(term => term.length >= 2))];
}

export function scoreCatalogueProductForMarker(marker, product, options = {}) {
  const synonymMap = options.synonymMap || {};
  const name = normalizeSearchText(product?.name || '');
  const shortcut = normalizeSearchText(product?.shortcut || '');
  const search = product?.searchableText || normalizeSearchText([
    product?.name,
    product?.shortcut,
    product?.description,
    product?.groupName,
    product?.preview,
  ].filter(Boolean).join(' '));
  const display = normalizeSearchText(marker.displayName || '');
  const terms = markerCatalogueTerms(marker, synonymMap);

  if (terms.some(term => name === term || shortcut === term || name === `test na ${term}`)) {
    return { score: 100, matchType: 'alias_or_name' };
  }
  if (display && (name === display || shortcut === display || name === `test na ${display}`)) {
    return { score: 95, matchType: 'display_name' };
  }
  if (terms.some(term => hasTerm(search, term))) {
    return { score: 80, matchType: 'alias_or_name' };
  }
  if (display && hasTerm(search, display)) {
    return { score: 70, matchType: 'display_name' };
  }
  return { score: 0, matchType: null };
}

export function findProviderCatalogueMatches(markerIntents = [], catalogueItems = [], options = {}) {
  const products = Array.isArray(catalogueItems) ? catalogueItems.filter(Boolean) : [];
  const matches = [];
  for (const marker of markerIntents.filter(intent => intent?.markerKey && !String(intent.markerKey).startsWith('unmapped.'))) {
    const ranked = products
      .map(product => ({ product, markerKey: marker.markerKey, ...scoreCatalogueProductForMarker(marker, product, options) }))
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score || (a.product.priceCzk ?? Infinity) - (b.product.priceCzk ?? Infinity) || String(a.product.name || '').localeCompare(String(b.product.name || ''), 'cs'));
    if (ranked[0]) matches.push(ranked[0]);
  }
  return matches;
}
