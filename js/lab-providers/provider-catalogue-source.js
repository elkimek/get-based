// provider-catalogue-source.js — runtime/private provider catalogue boundary.
//
// Core lab-ordering code should consume normalized catalogue rows through this
// boundary rather than assuming real lab catalogues are baked into the public
// frontend bundle. Production can inject rows from a private/server-side source
// (for example window.__GETBASED_LAB_PROVIDER_CATALOGUES__), while tests can
// register deterministic fixtures.

const testCatalogueItemsByProvider = new Map();

function runtimeCatalogueContainer() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.__GETBASED_LAB_PROVIDER_CATALOGUES__ || globalThis.GETBASED_LAB_PROVIDER_CATALOGUES || null;
}

function rowsFromContainer(container, providerId) {
  if (!container || !providerId) return [];
  if (container instanceof Map) return Array.isArray(container.get(providerId)) ? container.get(providerId) : [];
  const value = container[providerId];
  const rows = Array.isArray(value) ? value : value?.catalogueItems;
  return Array.isArray(rows) ? rows : [];
}

function offersFromContainer(container, providerId) {
  if (!container || !providerId) return [];
  if (container instanceof Map) return [];
  const value = container[providerId];
  const offers = value?.offers || value?.supplementalOffers;
  return Array.isArray(offers) ? offers : [];
}

export function getProviderCatalogueItems(providerId, options = {}) {
  const key = String(providerId || '');
  if (!key) return [];
  if (testCatalogueItemsByProvider.has(key)) return testCatalogueItemsByProvider.get(key);
  const runtimeRows = rowsFromContainer(runtimeCatalogueContainer(), key);
  if (runtimeRows.length) return runtimeRows;
  return Array.isArray(options.fallback) ? options.fallback : [];
}

export function getProviderSupplementalOffers(providerId, options = {}) {
  const key = String(providerId || '');
  if (!key) return [];
  if (testCatalogueItemsByProvider.has(key)) return [];
  const runtimeOffers = offersFromContainer(runtimeCatalogueContainer(), key);
  if (runtimeOffers.length) return runtimeOffers;
  return Array.isArray(options.fallback) ? options.fallback : [];
}

export function setProviderCatalogueItemsForTests(providerId, rows = []) {
  testCatalogueItemsByProvider.set(String(providerId), Array.isArray(rows) ? rows : []);
}

export function clearProviderCatalogueSourceForTests() {
  testCatalogueItemsByProvider.clear();
}
