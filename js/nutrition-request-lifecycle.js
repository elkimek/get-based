// @ts-check
// Long-running meal requests and their background modal workspace.

import { analyzeMealPhoto, mealAnalysisFiles } from './nutrition-analysis.js';
import { getErrorMessage } from './caught-error.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { state } from './state.js';
import { showNotification } from './utils.js';

let activeAnalysisController = null;
let activeAnalysisProfileId = '';
const activeComparisonControllers = new Set();
let backgroundNutritionSession = false;
let backgroundNutritionProfileId = '';
/** @type {{host: HTMLElement, modalClassName: string, scrollTop: number}|null} */
let backgroundNutritionWorkspace = null;
/** @type {any} */
let requestDeps = {
  selectedPhotos: () => [],
  getExistingImages: () => [],
  getAnalysisKind: () => 'meal-photo',
  getConsumption: () => ({ amount: 1, unit: 'servings' }),
  getUserContext: () => '',
  getCorrectionContext: () => '',
  applyAnalysis: () => {},
  focusReview: () => {},
  setStatus: () => {},
  startProgress: () => '',
  updateProgress: () => {},
  finishProgress: () => {},
  isAnalysisRunning: () => false,
  isComparisonRunning: () => false,
  hasPendingAnalysis: () => false,
};

export function configureNutritionRequestLifecycle(deps = {}) {
  requestDeps = { ...requestDeps, ...deps };
}

function updateBackgroundDismissalState() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  if (activeAnalysisController || activeComparisonControllers.size) overlay.setAttribute('data-modal-background-dismissible', '');
  else overlay.removeAttribute('data-modal-background-dismissible');
}

function startNutritionAnalysisRequest() {
  activeAnalysisController?.abort(new DOMException('Replaced by a new meal request.', 'AbortError'));
  activeAnalysisController = new AbortController();
  activeAnalysisProfileId = state.currentProfile;
  updateBackgroundDismissalState();
  return activeAnalysisController;
}

export function startNutritionComparisonRequest() {
  const controller = new AbortController();
  activeComparisonControllers.add(controller);
  updateBackgroundDismissalState();
  return controller;
}

export function isNutritionComparisonRequestActive(controller) {
  return activeComparisonControllers.has(controller);
}

export function finishNutritionComparisonRequest(controller) {
  activeComparisonControllers.delete(controller);
  updateBackgroundDismissalState();
}

function parkNutritionWorkspace() {
  if (backgroundNutritionWorkspace) return true;
  const modal = document.getElementById('detail-modal');
  if (!modal || !modal.classList.contains('nutrition-modal')) return false;
  const host = document.createElement('div');
  host.id = 'nutrition-background-workspace';
  host.hidden = true;
  host.setAttribute('aria-hidden', 'true');
  host.replaceChildren(...Array.from(modal.childNodes));
  document.body.append(host);
  backgroundNutritionWorkspace = { host, modalClassName: modal.className, scrollTop: modal.scrollTop };
  modal.className = 'modal';
  modal.scrollTop = 0;
  return true;
}

function restoreBackgroundNutritionWorkspace(modal) {
  if (!backgroundNutritionWorkspace) return false;
  const { host, modalClassName, scrollTop } = backgroundNutritionWorkspace;
  modal.replaceChildren(...Array.from(host.childNodes));
  modal.className = modalClassName;
  modal.scrollTop = scrollTop;
  host.remove();
  backgroundNutritionWorkspace = null;
  return true;
}

export function beginNutritionBackgroundSession() {
  backgroundNutritionSession = true;
  backgroundNutritionProfileId = state.currentProfile;
  return parkNutritionWorkspace();
}

export function isNutritionBackgroundSession() {
  return backgroundNutritionSession;
}

export function resumeNutritionBackgroundSession(modal, overlay) {
  if (backgroundNutritionSession && backgroundNutritionProfileId !== state.currentProfile) {
    resetNutritionRequestLifecycle();
    showNotification('The background meal request was closed because the active profile changed.', 'info');
    return false;
  }
  if (!backgroundNutritionSession || !(restoreBackgroundNutritionWorkspace(modal) || modal.classList.contains('nutrition-modal'))) return false;
  backgroundNutritionSession = false;
  backgroundNutritionProfileId = '';
  overlay.setAttribute('data-modal-dismiss-protected', '');
  if (requestDeps.isAnalysisRunning() || requestDeps.isComparisonRunning()) overlay.setAttribute('data-modal-background-dismissible', '');
  const initialFocus = document.querySelector('[data-nutrition-action="cancel-comparison-run"]')
    ? '[data-nutrition-action="cancel-comparison-run"]'
    : document.querySelector('[data-nutrition-action="cancel-analysis"]')
      ? '[data-nutrition-action="cancel-analysis"]'
      : modal.classList.contains('nutrition-benchmark-modal')
        ? '[data-nutrition-action="return-editor"]'
        : requestDeps.hasPendingAnalysis() ? '#nutrition-meal-name' : '#nutrition-photo-input';
  openModalOverlay(overlay, { initialFocus, focusDelay: 30 });
  return true;
}

export function resetNutritionRequestLifecycle() {
  activeAnalysisController?.abort(new DOMException('Meal editor closed.', 'AbortError'));
  activeAnalysisController = null;
  activeAnalysisProfileId = '';
  for (const controller of activeComparisonControllers) controller.abort(new DOMException('Meal editor closed.', 'AbortError'));
  activeComparisonControllers.clear();
  backgroundNutritionSession = false;
  backgroundNutritionProfileId = '';
  backgroundNutritionWorkspace?.host.remove();
  backgroundNutritionWorkspace = null;
  document.getElementById('modal-overlay')?.removeAttribute('data-modal-background-dismissible');
}

/** @param {{correctedMealName?: string, previousMealName?: string, button?: HTMLButtonElement | null}} [options] */
export async function runNutritionMealAnalysis({ correctedMealName = '', previousMealName = '', button = null } = {}) {
  const files = await mealAnalysisFiles(requestDeps.selectedPhotos(), requestDeps.getExistingImages());
  if (!files.length) {
    showNotification('Choose at least one meal or label photo first.', 'info');
    return;
  }
  const comparisonReturn = document.getElementById('nutrition-comparison-return');
  if (comparisonReturn) comparisonReturn.hidden = true;
  const analysisKind = requestDeps.getAnalysisKind();
  const consumption = requestDeps.getConsumption();
  const progressId = requestDeps.startProgress(button, correctedMealName ? 'Recalculating…' : analysisKind === 'nutrition-label' ? 'Scanning…' : 'Analyzing…');
  const controller = startNutritionAnalysisRequest();
  let completed = false;
  requestDeps.setStatus('');
  try {
    const userContext = [requestDeps.getUserContext(), requestDeps.getCorrectionContext()].filter(Boolean).join('\n');
    const result = await analyzeMealPhoto(files, {
      onProgress: (phase, label) => requestDeps.updateProgress(progressId, phase, label),
      correctedMealName,
      previousMealName,
      analysisKind,
      consumedAmount: consumption.amount,
      consumedUnit: consumption.unit,
      userContext,
      signal: controller.signal,
    });
    if (controller.signal.aborted || activeAnalysisController !== controller || activeAnalysisProfileId !== state.currentProfile) return;
    requestDeps.applyAnalysis(result);
    requestDeps.focusReview();
    completed = true;
  } catch (error) {
    if (!controller.signal.aborted && activeAnalysisController === controller) {
      requestDeps.setStatus(getErrorMessage(error, 'The meal could not be analyzed.'), 'error');
    }
  } finally {
    if (activeAnalysisController === controller) {
      activeAnalysisController = null;
      activeAnalysisProfileId = '';
      updateBackgroundDismissalState();
      requestDeps.finishProgress(progressId, completed, button);
    }
  }
}

export function cancelNutritionMealAnalysis() {
  if (!activeAnalysisController || activeAnalysisController.signal.aborted) return false;
  activeAnalysisController.abort(new DOMException('Canceled by user.', 'AbortError'));
  requestDeps.setStatus('Analysis canceled. Choose another model or adjust the meal, then try again.', 'warning');
  return true;
}
