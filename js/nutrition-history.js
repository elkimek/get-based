// @ts-check
// nutrition-history.js — on-demand, local-only nutrition history controller.

import { getErrorMessage } from './caught-error.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { renderNutritionHistoryModal, ensureNutritionStylesheet } from './nutrition-render.js';
import { computeNutritionHistory, NUTRITION_HISTORY_RANGES } from './nutrition-summary.js';
import { listActiveProfileMeals } from './nutrition-store.js';

const NUTRITION_HISTORY_RANGE_KEY = 'nutrition-history-range';
let historyRequestGeneration = 0;

export function getNutritionHistoryRange() {
  let stored = '';
  try { stored = localStorage.getItem(NUTRITION_HISTORY_RANGE_KEY) || ''; }
  catch {}
  return NUTRITION_HISTORY_RANGES.some(range => range.key === stored) ? stored : '3m';
}

export function setNutritionHistoryRange(rangeKey) {
  const valid = NUTRITION_HISTORY_RANGES.some(range => range.key === rangeKey) ? rangeKey : '3m';
  try { localStorage.setItem(NUTRITION_HISTORY_RANGE_KEY, valid); }
  catch {}
  return valid;
}

export async function openNutritionHistory(rangeKey = getNutritionHistoryRange()) {
  const generation = ++historyRequestGeneration;
  const selectedRange = setNutritionHistoryRange(rangeKey);
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  const replacingHistory = modal.classList.contains('nutrition-history-modal');
  let meals = [];
  let storageError = '';
  try {
    meals = await listActiveProfileMeals({ limit: 10000 });
  } catch (error) {
    storageError = getErrorMessage(error, 'Nutrition history could not be read from encrypted storage.');
  }
  if (generation !== historyRequestGeneration
      || (replacingHistory ? !modal.classList.contains('nutrition-history-modal') : overlay.classList.contains('show'))) return false;
  const history = computeNutritionHistory(meals, { rangeKey: selectedRange });
  modal.innerHTML = renderNutritionHistoryModal(history, { storageError });
  modal.scrollTop = 0;
  modal.classList.remove('nutrition-targets-modal', 'nutrition-fluid-modal');
  modal.classList.add('nutrition-modal', 'nutrition-history-modal');
  overlay.removeAttribute('data-modal-dismiss-protected');
  openModalOverlay(overlay, {
    initialFocus: `[data-nutrition-action="set-history-range"][data-nutrition-range="${selectedRange}"]`,
    focusDelay: 30,
  });
  return true;
}
