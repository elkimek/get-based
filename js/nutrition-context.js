// @ts-check
// nutrition-context.js — compact summary-only context for chat and source controls.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { getNutritionContextDays, isNutritionContextEnabled } from './lab-context-settings.js';

export { isNutritionContextEnabled, setNutritionContextEnabled } from './lab-context-settings.js';
export { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';

export function buildNutritionContext(importedData = state, { ignoreContextToggles = false } = {}) {
  if (!ignoreContextToggles && !isNutritionContextEnabled()) return '';
  const summary = importedData?.nutritionSummary;
  const profileData = importedData === state ? state.importedData : importedData?.importedData;
  return summary?.contextByDays?.[`d${getNutritionContextDays(profileData || state.importedData)}`] || '';
}

export function nutritionHistoryRequestFromQuery(queryText = '') {
  const match = String(queryText).match(/^Nutrition history range:\s*(30D|3M|6M|1Y|All)\s*\(([^\n)]+)\)\.\s*$/mi);
  return match ? { label: match[1], description: match[2].trim() } : null;
}

export function buildNutritionHistoryReceiptContext(queryText = '') {
  const request = nutritionHistoryRequestFromQuery(queryText);
  if (!request) return '';
  return `[section:nutritionHistory]\n## Meals & Nutrition — ${request.label} one-off history\nOne-off aggregate is in the editable user message; automatic nutrition summary is omitted. Individual meals, names, notes, ingredients, and photos are not included.\n[/section:nutritionHistory]\n\n`;
}

export async function hydrateNutritionSummary(...args) {
  const store = await import('./nutrition-store.js');
  return store.hydrateNutritionSummary(...args);
}

const STYLESHEET_URL = new URL('../css/nutrition.css', import.meta.url).href;
let stylesheetPromise = null;
let stylesheetLoaded = false;
let modulePromise = null;
let moduleValue = null;
let retryStylesheet = false;
let syncHydrationPromise = Promise.resolve();

// Pull refresh replaces state.importedData in place. Reconcile its synced meal
// rows into the encrypted local thumbnail cache before the widget is rendered.
addUtilsRuntimeListener('labcharts-sync-applied', () => {
  const profileId = state.currentProfile;
  syncHydrationPromise = syncHydrationPromise
    .catch(() => undefined)
    .then(() => hydrateNutritionSummary(profileId))
    .catch(error => console.warn('[nutrition] Synced meals could not be hydrated:', error));
});

function existingStylesheet() {
  if (typeof document === 'undefined') return null;
  return /** @type {HTMLLinkElement | null} */ (
    document.querySelector('link[data-nutrition-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find(link => {
      try { return new URL(/** @type {HTMLLinkElement} */ (link).href).pathname === '/css/nutrition.css'; }
      catch { return false; }
    })
    || null
  );
}

export function isNutritionStylesheetLoaded() {
  return stylesheetLoaded || !!existingStylesheet()?.sheet;
}

export function loadNutritionStylesheet() {
  const existing = existingStylesheet();
  if (existing?.sheet) {
    stylesheetLoaded = true;
    return Promise.resolve(existing);
  }
  if (!stylesheetPromise) {
    if (typeof document === 'undefined') return Promise.reject(new Error('Nutrition stylesheet requires a document.'));
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = retryStylesheet ? `${STYLESHEET_URL}?lazy-retry=1` : STYLESHEET_URL;
    link.dataset.nutritionStylesheet = '';
    stylesheetPromise = new Promise((resolve, reject) => {
      link.addEventListener('load', () => { stylesheetLoaded = true; resolve(link); }, { once: true });
      link.addEventListener('error', () => reject(new Error('Nutrition presentation could not be loaded.')), { once: true });
      if (!link.isConnected) {
        const anchor = document.querySelector('[data-nutrition-stylesheet-anchor]');
        (anchor?.parentNode || document.head).insertBefore(link, anchor || null);
      }
    }).catch(error => {
      link.remove();
      stylesheetPromise = null;
      stylesheetLoaded = false;
      retryStylesheet = true;
      throw error;
    });
  }
  return stylesheetPromise;
}

export function loadNutritionModule() {
  if (!modulePromise) {
    modulePromise = import('./nutrition.js').then(module => {
      moduleValue = module;
      return module;
    }).catch(error => {
      modulePromise = null;
      moduleValue = null;
      throw error;
    });
  }
  return modulePromise;
}

export async function loadNutritionFeature() {
  const [module] = await Promise.all([loadNutritionModule(), loadNutritionStylesheet()]);
  return module;
}

export function isNutritionFeatureReady() {
  return moduleValue !== null && isNutritionStylesheetLoaded();
}

export function renderNutritionWidget() {
  return moduleValue?.renderNutritionWidget?.() || '';
}

export function renderFuelWidget() {
  return moduleValue?.renderNutritionFuelWidget?.() || '';
}

/** @param {((category: string) => void) | null} [navigate] */
export async function openNutritionModule(navigate = null) {
  try {
    const module = await loadNutritionFeature();
    if (typeof navigate === 'function') navigate('body');
    setTimeout(() => { void module.openNutritionEditor?.(); }, 0);
    return true;
  } catch (error) {
    console.error('Meals & Nutrition could not be loaded', error);
    showNotification('Meals & Nutrition could not be loaded. Try again.', 'error');
    return false;
  }
}

/** @param {{view?: string, focus?: string}} [options] @param {((category: string) => void) | null} [navigate] */
export async function openNutritionHistoryModule({ view = 'meals', focus = '' } = {}, navigate = null) {
  try {
    const module = await loadNutritionFeature();
    if (typeof navigate === 'function') navigate('body');
    setTimeout(() => { void module.openNutritionHistoryView?.(view, { focus }); }, 0);
    return true;
  } catch (error) {
    console.error('Meals & Nutrition history could not be loaded', error);
    showNotification('Meals & Nutrition history could not be loaded. Try again.', 'error');
    return false;
  }
}
