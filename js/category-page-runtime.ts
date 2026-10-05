import { createRetryingStylesheetLoader } from './retrying-module-loader.js';
// category-page-runtime.js - Browser runtime adapters for category page hooks.

import {
  getRecommendationModuleFunction,
  getRecommendationsCatalogCache,
  setRecommendationsCatalogCache,
} from './recommendations-runtime.js';

const CATEGORY_VIEWS_STYLESHEET_URL = new URL('../css/category-views.css', import.meta.url).href;
const categoryViewsStylesheetPromiseCache = createRetryingStylesheetLoader({
  createLink: () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = categoryViewsStylesheetUrl();
    link.dataset.categoryViewsStylesheet = '';
    return link;
  },
  insertLink: link => {
    const anchor = document.querySelector('[data-category-views-stylesheet-anchor]');
    const parent = anchor?.parentNode || document.head;
    parent.insertBefore(link, anchor || null);
  },
  requireDocument: "Category views stylesheet requires a document",
  failedLoad: "Category views stylesheet could not be loaded",
});

function categoryViewsStylesheetUrl() {
  if (!categoryViewsStylesheetPromiseCache.retry) return CATEGORY_VIEWS_STYLESHEET_URL;
  const retryUrl = new URL(CATEGORY_VIEWS_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isCategoryViewsStylesheetLoaded() {
  return categoryViewsStylesheetPromiseCache.loaded;
}

export function loadCategoryViewsStylesheet() {
  return categoryViewsStylesheetPromiseCache.load();
}

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
