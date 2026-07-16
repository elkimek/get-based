// @ts-check
// category-page-runtime.js - Browser runtime adapters for category page hooks.

import {
  getRecommendationModuleFunction,
  getRecommendationsCatalogCache,
  setRecommendationsCatalogCache,
} from './recommendations-runtime.js';

export function getCategoryPageCatalogSlots() {
  return getRecommendationsCatalogCache()?.slots || null;
}

export function primeCategoryPageCatalogCache() {
  if (getRecommendationsCatalogCache()) return null;
  const loadCatalog = getRecommendationModuleFunction('loadCatalog');
  if (!loadCatalog) return null;
  const catalogPromise = loadCatalog();
  if (!catalogPromise || typeof catalogPromise.then !== 'function') return null;
  return catalogPromise.then(catalog => {
    setRecommendationsCatalogCache(catalog);
    return catalog;
  });
}
