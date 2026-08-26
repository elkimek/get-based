// @ts-check
// nutrition-context.js — compact summary-only context for chat and source controls.

import { state } from './state.js';
import { isNutritionContextEnabled } from './lab-context-settings.js';
import { escapeHTML, showNotification } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';

export { isNutritionContextEnabled, setNutritionContextEnabled } from './lab-context-settings.js';

/** @param {any} [summary] */
export function doesNutritionContextOverrideTypicalMeals(summary = state.nutritionSummary) {
  return summary?.totalMeals > 0 && isNutritionContextEnabled();
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

export function buildNutritionContext(importedData = state, { ignoreContextToggles = false } = {}) {
  if (!ignoreContextToggles && !isNutritionContextEnabled()) return '';
  const summary = importedData?.nutritionSummary;
  return summary?.contextText || '';
}

export function renderNutritionDietExtension(actionAttributes) {
  const summary = state.nutritionSummary;
  const period = summary?.windows?.d7;
  const logged = period?.loggedDays || 0;
  const foodMeals = period?.foodMeals ?? period?.meals ?? 0;
  const hasDetailedMeals = summary?.totalMeals > 0;
  const overridesTypicalMeals = doesNutritionContextOverrideTypicalMeals(summary);
  const title = overridesTypicalMeals ? 'Detailed meal log active' : 'Meals & Nutrition';
  let detail = 'Add variable meals and photo estimates';
  if (hasDetailedMeals && !overridesTypicalMeals) {
    detail = 'AI source off · Typical meals active';
  } else if (period?.meals) {
    detail = `Replaces Typical meals · ${foodMeals} logged meal${foodMeals === 1 ? '' : 's'} · ${logged}/7 days`;
  } else if (overridesTypicalMeals) {
    detail = 'Replaces Typical meals · no entries in 7 days';
  }
  return `<button type="button" class="diet-nutrition-extension" ${actionAttributes('open-nutrition')}><span class="diet-nutrition-extension-title">${title}</span><span>${escapeHTML(detail)}</span><span aria-hidden="true">→</span></button>`;
}

export function renderNutritionCircadianExtension(actionAttributes) {
  const period = state.nutritionSummary?.windows?.d7;
  const timing = period?.timing;
  if (!period?.meals || !timing?.mealsWithTiming) return '';
  const first = timing.averageFirstMealLocalTime || '';
  const last = timing.averageLastMealLocalTime || '';
  const beforeSleep = timing.sleepRelative?.averageLastMealToSleepMinutes;
  const afterWake = timing.sleepRelative?.averageWakeToFirstMealMinutes;
  const duration = minutes => {
    const value = Number(minutes);
    if (!Number.isFinite(value)) return '';
    return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
  };
  const detail = [first && `first ${first}`, last && `last ${last}`, beforeSleep !== null && beforeSleep !== undefined && Number.isFinite(Number(beforeSleep)) && `${duration(beforeSleep)} before sleep`, afterWake !== null && afterWake !== undefined && Number.isFinite(Number(afterWake)) && `${duration(afterWake)} after wake`].filter(Boolean).join(' · ');
  if (!detail) return '';
  return `<button type="button" class="diet-nutrition-extension" ${actionAttributes('open-nutrition')}><span class="diet-nutrition-extension-title">Logged meal timing</span><span>7-day average · ${escapeHTML(detail)}</span><span aria-hidden="true">→</span></button>`;
}
