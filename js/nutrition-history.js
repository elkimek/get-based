// @ts-check
// nutrition-history.js — on-demand, local-only nutrition history controller.

import { getErrorMessage } from './caught-error.js';
import { openDashboardChatPrompt } from './dashboard-widget-runtime.js';
import { isNutritionContextEnabled } from './lab-context-settings.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { closeNutritionEditor } from './nutrition-modal-controller.js';
import { hasSuspendedNutritionEditor } from './nutrition-editor-navigation.js';
import { HISTORY_MEAL_PAGE_SIZE, renderNutritionHistoryModal, ensureNutritionStylesheet } from './nutrition-render.js';
import { buildNutritionHistoryAnalysisPrompt } from './nutrition-summary-context.js';
import { computeNutritionHistory, NUTRITION_HISTORY_RANGES } from './nutrition-summary.js';
import { listActiveProfileMeals } from './nutrition-store.js';
import { showNotification } from './utils.js';

const NUTRITION_HISTORY_RANGE_KEY = 'nutrition-history-range';
const NUTRITION_HISTORY_VIEW_KEY = 'nutrition-history-view';
let historyRequestGeneration = 0;
let visibleMealCount = HISTORY_MEAL_PAGE_SIZE;
let historyReturnTo = '';

export function getNutritionHistoryRange() {
  let stored = '';
  try { stored = localStorage.getItem(NUTRITION_HISTORY_RANGE_KEY) || ''; }
  catch {}
  return NUTRITION_HISTORY_RANGES.some(range => range.key === stored) ? stored : '30d';
}

export function setNutritionHistoryRange(rangeKey) {
  const valid = NUTRITION_HISTORY_RANGES.some(range => range.key === rangeKey) ? rangeKey : '30d';
  try { localStorage.setItem(NUTRITION_HISTORY_RANGE_KEY, valid); }
  catch {}
  return valid;
}

export function getNutritionHistoryView() {
  let stored = '';
  try { stored = localStorage.getItem(NUTRITION_HISTORY_VIEW_KEY) || ''; }
  catch {}
  return stored === 'trends' ? 'trends' : 'meals';
}

export function setNutritionHistoryView(view) {
  const valid = view === 'trends' ? 'trends' : 'meals';
  try { localStorage.setItem(NUTRITION_HISTORY_VIEW_KEY, valid); }
  catch {}
  return valid;
}

/**
 * @param {string} [rangeKey]
 * @param {{view?: string, focus?: string, resetMeals?: boolean, preserveScroll?: boolean, returnTo?: string}} [options]
 */
export async function openNutritionHistory(rangeKey = getNutritionHistoryRange(), options = {}) {
  const { view = getNutritionHistoryView(), focus = '', resetMeals = false, preserveScroll = false } = options;
  const generation = ++historyRequestGeneration;
  const previousScrollTop = preserveScroll ? Number(document.getElementById('detail-modal')?.scrollTop || 0) : 0;
  const selectedRange = setNutritionHistoryRange(rangeKey);
  const selectedView = setNutritionHistoryView(view);
  if (resetMeals) visibleMealCount = HISTORY_MEAL_PAGE_SIZE;
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  const replacingOpenNutrition = overlay.classList.contains('show') && modal.classList.contains('nutrition-modal');
  if (Object.hasOwn(options, 'returnTo')) historyReturnTo = options.returnTo === 'editor' ? 'editor' : '';
  else if (!replacingOpenNutrition) historyReturnTo = '';
  let meals = [];
  let storageError = '';
  try {
    meals = await listActiveProfileMeals({ limit: 10000 });
  } catch (error) {
    storageError = getErrorMessage(error, 'Nutrition history could not be read from encrypted storage.');
  }
  if (generation !== historyRequestGeneration
      || (replacingOpenNutrition
        ? !overlay.classList.contains('show') || !modal.classList.contains('nutrition-modal')
        : overlay.classList.contains('show'))) return false;
  const history = {
    ...computeNutritionHistory(meals, { rangeKey: selectedRange }),
    view: selectedView,
    visibleMealCount,
  };
  modal.innerHTML = renderNutritionHistoryModal(history, { storageError, returnTo: historyReturnTo });
  modal.scrollTop = preserveScroll ? previousScrollTop : 0;
  modal.classList.remove('nutrition-targets-modal', 'nutrition-fluid-modal', 'nutrition-manual-mode');
  modal.classList.add('nutrition-modal', 'nutrition-history-modal');
  if (historyReturnTo === 'editor' && hasSuspendedNutritionEditor()) overlay.setAttribute('data-modal-dismiss-protected', '');
  else overlay.removeAttribute('data-modal-dismiss-protected');
  openModalOverlay(overlay, {
    initialFocus: `[data-nutrition-action="set-history-view"][data-nutrition-view="${selectedView}"]`,
    focusDelay: 30,
  });
  if (preserveScroll) {
    setTimeout(() => {
      modal.scrollTop = previousScrollTop;
      /** @type {HTMLElement | null} */ (modal.querySelector('.nutrition-history-more'))?.focus({ preventScroll: true });
    }, 40);
  }
  if (focus === 'timing') {
    setTimeout(() => document.querySelector('.nutrition-history-timing')?.scrollIntoView({ block: 'start' }), 40);
  }
  return true;
}

export function openNutritionHistoryView(view, { focus = '' } = {}) {
  visibleMealCount = HISTORY_MEAL_PAGE_SIZE;
  return openNutritionHistory(getNutritionHistoryRange(), { view, focus });
}

export function showMoreNutritionHistoryMeals() {
  visibleMealCount += HISTORY_MEAL_PAGE_SIZE;
  return openNutritionHistory(getNutritionHistoryRange(), { view: 'meals', preserveScroll: true });
}

export async function askAIAboutNutritionHistory(rangeKey) {
  if (!isNutritionContextEnabled()) {
    showNotification('Enable Meals & Nutrition in Manage → Context before sharing this aggregate with AI.', 'info');
    return false;
  }
  try {
    const history = computeNutritionHistory(await listActiveProfileMeals({ limit: 10000 }), { rangeKey });
    const prompt = buildNutritionHistoryAnalysisPrompt(history);
    if (!prompt) {
      showNotification('There are no logged meals in this timeframe to analyze.', 'info');
      return false;
    }
    closeNutritionEditor();
    await openDashboardChatPrompt(prompt);
    return true;
  } catch (error) {
    console.error('Nutrition history could not be prepared for chat', error);
    showNotification(getErrorMessage(error, 'Nutrition history could not be prepared for chat.'), 'error');
    return false;
  }
}
