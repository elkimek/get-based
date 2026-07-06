// @ts-check
// category-page-runtime.js - Browser runtime adapters for category page hooks.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function getCategoryPageCatalogSlots() {
  const runtime = getRuntimeWindow();
  return runtime?._cachedCatalog?.slots || null;
}

export function primeCategoryPageCatalogCache() {
  const runtime = getRuntimeWindow();
  if (!runtime || runtime._cachedCatalog || typeof runtime.loadCatalog !== 'function') return null;
  const catalogPromise = runtime.loadCatalog();
  if (!catalogPromise || typeof catalogPromise.then !== 'function') return null;
  return catalogPromise.then(catalog => {
    runtime._cachedCatalog = catalog;
    return catalog;
  });
}
