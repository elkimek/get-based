// @ts-check
// category-page-runtime.js - Browser runtime adapters for category page hooks.

import {
  getRecommendationModuleFunction,
  getRecommendationsCatalogCache,
  setRecommendationsCatalogCache,
} from './recommendations-runtime.js';

const CATEGORY_VIEWS_STYLESHEET_URL = new URL('../css/category-views.css', import.meta.url).href;

/** @type {Promise<HTMLLinkElement> | null} */
let categoryViewsStylesheetPromise = null;
let categoryViewsStylesheetLoaded = false;
let useCategoryViewsStylesheetRetryUrl = false;

function categoryViewsStylesheetUrl() {
  if (!useCategoryViewsStylesheetRetryUrl) return CATEGORY_VIEWS_STYLESHEET_URL;
  const retryUrl = new URL(CATEGORY_VIEWS_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isCategoryViewsStylesheetLoaded() {
  return categoryViewsStylesheetLoaded;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadCategoryViewsStylesheet() {
  if (!categoryViewsStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Category views stylesheet requires a document'));
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = categoryViewsStylesheetUrl();
    link.dataset.categoryViewsStylesheet = '';
    categoryViewsStylesheetPromise = new Promise((resolve, reject) => {
      link.addEventListener('load', () => {
        categoryViewsStylesheetLoaded = true;
        resolve(link);
      }, { once: true });
      link.addEventListener('error', () => {
        reject(new Error('Category views stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-category-views-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }).catch(err => {
      link.remove();
      categoryViewsStylesheetPromise = null;
      categoryViewsStylesheetLoaded = false;
      useCategoryViewsStylesheetRetryUrl = true;
      throw err;
    });
  }
  return categoryViewsStylesheetPromise;
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
