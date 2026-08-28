// @ts-check
import { PHOTO_NUTRIENT_KEYS } from './nutrition-analysis.js';
import { deleteActiveProfileMeal, getActiveProfileMeal, saveActiveProfileMeal } from './nutrition-store.js';
import { normalizeNutritionComponent, recalculateMealFromComponents, updateComponentQuantity } from './nutrition-food-data.js';
import { persistedNutritionComponents, photoEstimateNutrientAllowlist, photoEstimateNutrientBasis } from './nutrition-photo-provenance.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { escapeAttr, showConfirmDialog, showNotification } from './utils.js';
import { getErrorMessage } from './caught-error.js';
import { cancelComparisonRun, clearComparisonReference, clearSavedNutritionComparison, configureNutritionComparisonUI, filterNutritionComparisonModels, isNutritionComparisonRunning, refreshComparisonModelPicker, rememberNutritionComparisonWorkspace, removeComparisonRun, replaceComparisonRun, resetNutritionComparison, restoreNutritionComparison, retryComparisonRun, runModelComparison, setComparisonReference, toggleComparisonPresentation, updateComparisonControls, useComparisonEstimate, useManualComparisonReference } from './nutrition-comparison-ui.js';
import { analysisInputsDirty, applyAnalysis, clearAnalyzedFields, componentCorrectionContext, componentPortionNeedsReanalysis, configureNutritionReviewUI, consumptionKey, currentKnownDetails, currentMealName, finishAnalysisProgress, focusMobileNutritionReview, isAnalysisProgressRunning, isPhotoEstimate, labelConsumption, mealNameCorrectionIsDirty, normalizeKnownDetails, normalizeMealName, renderEditableComponents, renderFuelOverlapPreview, renderNutrientEstimateSummary, renderReviewEvidence, resetAnalysisProgress, setAnalysisKind, setStatus, startAnalysisProgress, updateAnalysisProgress, updateCorrectionState } from './nutrition-review-ui.js';
import { ALL_REVIEW_FIELDS, MEAL_TYPES, ensureNutritionStylesheet, hasFiniteNumber, mealLocalDateTime, mealImages, renderStoredPhotoPreview, renderFluidLogModal, renderMealModelControl, renderNutritionCustomizeModal, renderNutritionEditor, renderNutritionFuelWidget, renderNutritionWidget, setElementValue } from './nutrition-render.js';
import { hydrateNutritionLocalAICatalog, setNutritionAIRouteFromValue } from './nutrition-ai-settings.js';
import { discardSuspendedNutritionEditor, enhanceNutritionEditorNavigation, hasSuspendedNutritionEditor, setManualEntryMode, suspendNutritionEditor, suspendedNutritionEditorHasDraft } from './nutrition-editor-navigation.js';
import { askAIAboutNutritionHistory, getNutritionHistoryRange, getNutritionHistoryView, openNutritionHistory, openNutritionHistoryView, showMoreNutritionHistoryMeals } from './nutrition-history.js';
import { clearMealResponse, configureNutritionEntryForms, openMealDetail, saveFluidLog, saveMealResponse, saveNutritionTargets, updateFluidLogControls, updateNutritionTargetControls, updateNutritionWidgetMetricControls } from './nutrition-entry-forms.js';
import { closeNutritionEditor as closeEditor, configureNutritionModalController, handleNutritionEditorKeydown as handleNutritionKeydown, openNutritionAISettings, requestCloseNutritionEditor as requestCloseEditor, requestNutritionEditorNavigation } from './nutrition-modal-controller.js';
import { clearNutritionBenchmarkPhotos, configureNutritionBenchmarkWorkspace, handleNutritionBenchmarkPhotoSelection, hasNutritionBenchmarkSource, nutritionBenchmarkAnalysisFiles, nutritionBenchmarkContext, nutritionBenchmarkHasPhotos, openNutritionBenchmark, resetNutritionBenchmarkWorkspace, restoreNutritionMealEntry } from './nutrition-benchmark-workspace.js';
import { beginNutritionBackgroundSession, cancelNutritionMealAnalysis, configureNutritionRequestLifecycle, finishNutritionComparisonRequest, isNutritionBackgroundSession, isNutritionComparisonRequestActive, resetNutritionRequestLifecycle, resumeNutritionBackgroundSession, runNutritionMealAnalysis, startNutritionComparisonRequest } from './nutrition-request-lifecycle.js';
export { deleteNutritionDB } from './nutrition-store.js';
export { openNutritionHistory, openNutritionHistoryView, renderNutritionFuelWidget, renderNutritionWidget };
const ACTION_ATTR = 'data-nutrition-action';
let delegatesInstalled = false;
let previewUrls = [];
let pendingAnalysis = null;
let lastAnalyzedMealName = '';
/** @type {'meal-photo'|'nutrition-label'} */ let lastAnalyzedKind = 'meal-photo';
let lastAnalyzedConsumption = '';
let lastAnalyzedContext = '';
/** @type {'meal-photo'|'nutrition-label'} */ let analysisKind = 'meal-photo';
let componentIdentityDirty = false;
let analyzedComponentIdentityBaseline = [];
let editingMealId = '';
let editingCreatedAt = '';
let editingResponseCheckIn = null;
let reusedMealId = '';
let editorDetailReturnTo = 'history';
let existingImages = [];
const userEditedNutrients = new Set();
const userEditedComponentIdentities = new Set();
function clearPreviewUrl() { for (const url of previewUrls) URL.revokeObjectURL(url); previewUrls = []; }
function resetEditorState() {
  discardSuspendedNutritionEditor();
  resetNutritionRequestLifecycle();
  resetAnalysisProgress();
  pendingAnalysis = null;
  lastAnalyzedMealName = '';
  lastAnalyzedKind = 'meal-photo';
  lastAnalyzedConsumption = '';
  lastAnalyzedContext = '';
  analysisKind = 'meal-photo';
  resetNutritionComparison();
  componentIdentityDirty = false; analyzedComponentIdentityBaseline = [];
  editingMealId = '';
  editingCreatedAt = '';
  editingResponseCheckIn = null;
  reusedMealId = '';
  editorDetailReturnTo = 'history';
  existingImages = [];
  resetNutritionBenchmarkWorkspace();
  userEditedNutrients.clear();
  userEditedComponentIdentities.clear();
  clearPreviewUrl();
}
function populateEditorFromMeal(meal, reuse = false) {
  const sourceKind = meal?.source?.kind || 'manual';
  const manualSource = sourceKind === 'manual' || sourceKind === 'reused-meal' || sourceKind === 'barcode-database';
  analysisKind = sourceKind === 'ai-label-scan' ? 'nutrition-label' : 'meal-photo';
  setAnalysisKind(analysisKind);
  if (manualSource) setManualEntryMode({ focus: false });
  existingImages = reuse ? [] : mealImages(meal);
  editingResponseCheckIn = reuse ? null : (meal?.responseCheckIn || null);
  pendingAnalysis = {
    analysis: {
      mealName: meal.name || 'Meal',
      nutrients: { ...(meal.nutrients || {}) },
      components: (meal.components || []).map(normalizeNutritionComponent),
      confidence: meal.confidence ?? null,
      assumptions: [...(meal.assumptions || [])],
      warnings: [...(meal.warnings || [])],
      label: meal.source?.label || null,
    },
    image: existingImages[0] || null,
    images: existingImages,
    source: { ...(meal.source || { kind: 'manual' }) },
  };
  lastAnalyzedMealName = meal.name || 'Meal';
  lastAnalyzedKind = analysisKind;
  const label = meal.source?.label;
  if (label?.consumedAmount) setElementValue('nutrition-consumed-amount', label.consumedAmount);
  if (label?.consumedUnit) setElementValue('nutrition-consumed-unit', label.consumedUnit);
  lastAnalyzedConsumption = consumptionKey(analysisKind);
  const knownDetails = meal.analysisContext || meal.source?.review?.userContext || '';
  setElementValue('nutrition-known-details', knownDetails);
  lastAnalyzedContext = normalizeKnownDetails(knownDetails);
  for (const key of meal.source?.review?.editedNutrients || []) userEditedNutrients.add(key);
  for (const name of meal.source?.review?.editedComponentIdentities || []) userEditedComponentIdentities.add(name);
  applyAnalysis(pendingAnalysis, { quiet: true });
  setElementValue('nutrition-meal-type', meal.mealType || '');
  setElementValue('nutrition-eaten-at', mealLocalDateTime(meal, reuse));
  setElementValue('nutrition-note', meal.note || '');
  if (existingImages.length) renderStoredPhotoPreview(existingImages);
  if (reuse) setStatus('Reviewed values copied. Adjust the time, occasion, or portions before saving.', 'success');
  else setStatus('Editing the stored record. Changes remain local until you save.', 'success');
  updateCorrectionState();
}
export async function openNutritionEditor(options = {}) {
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  if (resumeNutritionBackgroundSession(modal, overlay)) return true;
  void hydrateNutritionLocalAICatalog();
  resetEditorState();
  const seedMeal = options?.seedMeal || null;
  if (seedMeal && options?.mode === 'edit') {
    editingMealId = seedMeal.id || '';
    editingCreatedAt = seedMeal.createdAt || '';
  } else if (seedMeal && options?.mode === 'reuse') {
    reusedMealId = seedMeal.id || '';
  }
  editorDetailReturnTo = options?.returnMealOrigin === 'editor' ? 'editor' : 'history';
  modal.innerHTML = renderNutritionEditor([], {
    editingMealId,
    reusedMealId,
    returnTo: options?.returnTo || '',
    returnMealId: options?.returnMealId || '',
    returnMealOrigin: editorDetailReturnTo,
  });
  modal.scrollTop = 0;
  modal.classList.remove('nutrition-targets-modal', 'nutrition-fluid-modal', 'nutrition-history-modal', 'nutrition-manual-mode');
  modal.classList.add('nutrition-modal');
  const manualDefault = !seedMeal && /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-analyze-btn'))?.disabled === true;
  enhanceNutritionEditorNavigation(modal, { manualDefault });
  overlay.setAttribute('data-modal-dismiss-protected', '');
  renderEditableComponents([]);
  await restoreNutritionComparison();
  if (seedMeal) populateEditorFromMeal(seedMeal, options?.mode === 'reuse');
  else updateCorrectionState();
  openModalOverlay(overlay, { initialFocus: manualDefault ? '#nutrition-meal-name' : '#nutrition-photo-input', focusDelay: 30 });
  return true;
}
export async function openNutritionTargets(options = {}) {
  if (isNutritionBackgroundSession()) {
    showNotification('Return to the background meal request before opening Nutrition setup.', 'info');
    return false;
  }
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  if (!hasSuspendedNutritionEditor()) resetEditorState();
  const returnTo = options?.returnTo === 'history' ? 'history' : '';
  modal.innerHTML = renderNutritionCustomizeModal({ returnTo });
  modal.scrollTop = 0;
  modal.classList.remove('nutrition-fluid-modal', 'nutrition-history-modal', 'nutrition-manual-mode');
  modal.classList.add('nutrition-modal', 'nutrition-targets-modal');
  if (hasSuspendedNutritionEditor()) overlay.setAttribute('data-modal-dismiss-protected', '');
  else overlay.removeAttribute('data-modal-dismiss-protected');
  openModalOverlay(overlay, { initialFocus: '#nutrition-target-settings', focusDelay: 30 });
  return true;
}
export async function openFluidLog() {
  if (isNutritionBackgroundSession()) {
    showNotification('Return to the background meal request before opening the drink logger.', 'info');
    return false;
  }
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  resetEditorState();
  modal.innerHTML = renderFluidLogModal();
  modal.scrollTop = 0;
  modal.classList.remove('nutrition-targets-modal', 'nutrition-history-modal', 'nutrition-manual-mode');
  modal.classList.add('nutrition-modal', 'nutrition-fluid-modal');
  overlay.removeAttribute('data-modal-dismiss-protected');
  updateFluidLogControls();
  openModalOverlay(overlay, { initialFocus: '#nutrition-fluid-amount', focusDelay: 30 });
  return true;
}
async function openMealEditor(id, mode, origin = 'history') {
  if (suspendedNutritionEditorHasDraft() && !await showConfirmDialog(
    `Opening this meal to ${mode === 'reuse' ? 'log it again' : 'edit it'} will replace the meal entry you left open. Continue?`,
    { confirmLabel: mode === 'reuse' ? 'Log this meal again' : 'Edit this meal', cancelLabel: 'Keep meal entry', ariaLabel: 'Replace open meal entry' },
  )) return false;
  let meal;
  try { meal = await getActiveProfileMeal(id); }
  catch (error) {
    showNotification(getErrorMessage(error, 'This stored meal could not be read.'), 'error');
    return false;
  }
  if (!meal) {
    showNotification('That meal is no longer available on this device.', 'error');
    return false;
  }
  return openNutritionEditor({ seedMeal: meal, mode, returnTo: 'detail', returnMealId: id, returnMealOrigin: origin });
}
async function browseMealsFromEditor() {
  if (isAnalysisProgressRunning()) {
    showNotification('Meal analysis is still running. Wait for it to finish before browsing saved meals.', 'info');
    return false;
  }
  if (!suspendNutritionEditor()) return openNutritionHistory();
  const opened = await openNutritionHistory(getNutritionHistoryRange(), { view: 'meals', returnTo: 'editor' });
  if (!opened) restoreNutritionMealEntry();
  return opened;
}
async function openNewMealFromHistory() {
  if (suspendedNutritionEditorHasDraft() && !await showConfirmDialog(
    'Start a new meal and discard the meal entry you left open?',
    { confirmLabel: 'Start new meal', cancelLabel: 'Return to meal entry', ariaLabel: 'Replace open meal entry' },
  )) return false;
  return openNutritionEditor({ returnTo: 'history' });
}
async function returnToNutritionHistory() {
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  const navigate = () => openNutritionHistory(getNutritionHistoryRange(), { view: getNutritionHistoryView() });
  if (modal?.classList.contains('nutrition-targets-modal') || !overlay?.hasAttribute('data-modal-dismiss-protected')) return navigate();
  return requestNutritionEditorNavigation(navigate, {
    message: 'Return to Meals & Nutrition and discard this unsaved meal draft?',
    confirmLabel: 'Return to meals',
    ariaLabel: 'Discard meal draft and return to meals',
  });
}
function returnToMealDetail(id, origin) {
  return requestNutritionEditorNavigation(() => openMealDetail(id, { returnTo: origin }), {
    message: 'Return to the saved meal details and discard these unsaved changes?',
    confirmLabel: 'Return to details',
    ariaLabel: 'Discard meal changes and return to details',
  });
}
async function saveTargetsAndContinue(returnTo) {
  const saved = await saveNutritionTargets({ closeOnSave: returnTo !== 'history' });
  if (saved && returnTo === 'history') await openNutritionHistory(getNutritionHistoryRange(), { view: getNutritionHistoryView() });
}
function selectedPhotos() { return Array.from(/** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-photo-input'))?.files || []).slice(0, 4); }

configureNutritionBenchmarkWorkspace({
  selectedPhotos,
  getExistingImages: () => existingImages,
  getConsumption: labelConsumption,
  getUserContext: currentKnownDetails,
  getAnalysisKind: () => analysisKind,
  isAnalysisRunning: isAnalysisProgressRunning,
  openEditor: openNutritionEditor,
  updateCorrectionState,
});
configureNutritionRequestLifecycle({
  selectedPhotos,
  getExistingImages: () => existingImages,
  getAnalysisKind: () => analysisKind,
  getConsumption: labelConsumption,
  getUserContext: currentKnownDetails,
  getCorrectionContext: componentCorrectionContext,
  applyAnalysis,
  focusReview: focusMobileNutritionReview,
  setStatus,
  startProgress: startAnalysisProgress,
  updateProgress: updateAnalysisProgress,
  finishProgress: finishAnalysisProgress,
  isAnalysisRunning: isAnalysisProgressRunning,
  isComparisonRunning: isNutritionComparisonRunning,
  hasPendingAnalysis: () => !!pendingAnalysis,
});

configureNutritionReviewUI({
  getPendingAnalysis: () => pendingAnalysis,
  getComponentIdentityDirty: () => componentIdentityDirty,
  getLastAnalyzedMealName: () => lastAnalyzedMealName,
  getLastAnalyzedKind: () => lastAnalyzedKind,
  getLastAnalyzedConsumption: () => lastAnalyzedConsumption,
  getLastAnalyzedContext: () => lastAnalyzedContext,
  getAnalysisKind: () => analysisKind,
  setAnalysisKind: kind => { analysisKind = kind; },
  getEditingMealId: () => editingMealId,
  getReusedMealId: () => reusedMealId,
  getExistingImages: () => existingImages,
  selectedPhotoCount: () => selectedPhotos().length,
  applyResultState: (result, analyzed) => {
    pendingAnalysis = result;
    lastAnalyzedMealName = analyzed.mealName;
    lastAnalyzedKind = analyzed.kind;
    lastAnalyzedConsumption = analyzed.consumption;
    lastAnalyzedContext = analyzed.context;
    analyzedComponentIdentityBaseline = (result?.analysis?.components || []).map(item => normalizeMealName(item?.name));
    componentIdentityDirty = false;
  },
});
function handlePhotoSelection(input) {
  const files = Array.from(input.files || []);
  if (files.length > 4) {
    input.value = '';
    setStatus('Choose no more than four photos for one analysis.', 'error');
    return;
  }
  const replacingAnalysis = !!pendingAnalysis;
  pendingAnalysis = null;
  lastAnalyzedMealName = '';
  lastAnalyzedKind = analysisKind;
  lastAnalyzedConsumption = '';
  lastAnalyzedContext = '';
  componentIdentityDirty = false; analyzedComponentIdentityBaseline = [];
  existingImages = [];
  if (!hasNutritionBenchmarkSource()) resetNutritionComparison();
  const comparisonReturn = document.getElementById('nutrition-comparison-return');
  if (comparisonReturn) comparisonReturn.hidden = true;
  const comparisonResults = document.getElementById('nutrition-comparison-results');
  if (comparisonResults) comparisonResults.innerHTML = '';
  userEditedNutrients.clear();
  userEditedComponentIdentities.clear();
  if (replacingAnalysis) clearAnalyzedFields();
  clearPreviewUrl();
  const preview = document.getElementById('nutrition-photo-preview');
  updateCorrectionState();
  updateComparisonControls();
  if (!files.length || !preview) return;
  previewUrls = files.map(file => URL.createObjectURL(file));
  preview.innerHTML = `<span class="nutrition-photo-grid">${previewUrls.map((url, index) => `<img src="${escapeAttr(url)}" alt="Selected view ${index + 1}">`).join('')}</span><span class="nutrition-photo-change">${files.length} view${files.length === 1 ? '' : 's'} · change</span>`;
  setStatus(`${files.length} view${files.length === 1 ? '' : 's'} ready. Nothing has been sent.`);
}
configureNutritionComparisonUI({
  analysisFiles: nutritionBenchmarkAnalysisFiles,
  hasPhotos: nutritionBenchmarkHasPhotos,
  startRequest: startNutritionComparisonRequest,
  isRequestActive: isNutritionComparisonRequestActive,
  finishRequest: finishNutritionComparisonRequest,
  updateCorrectionState,
  getConsumption: () => nutritionBenchmarkContext().consumption,
  getUserContext: () => nutritionBenchmarkContext().userContext,
  getAnalysisKind: () => nutritionBenchmarkContext().analysisKind,
  beforeApplyAnalysis: restoreNutritionMealEntry,
  applyAnalysis,
  setStatus,
});
async function analyzeSelectedPhoto() {
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-analyze-btn'));
  await runNutritionMealAnalysis({ button });
}
async function reanalyzeCorrectedMeal() {
  const correctedMealName = currentMealName();
  if (!pendingAnalysis || !lastAnalyzedMealName || !analysisInputsDirty()) {
    showNotification('Change the meal name, ingredient, photo type, or amount eaten first.', 'info');
    return;
  }
  if (!correctedMealName) {
    showNotification('Enter the corrected meal name first.', 'info');
    return;
  }
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-recalculate-btn'));
  await runNutritionMealAnalysis({
    correctedMealName: mealNameCorrectionIsDirty() ? correctedMealName : '',
    previousMealName: lastAnalyzedMealName,
    button,
  });
}
function currentExplicitNutrients() {
  const totals = {};
  for (const key of userEditedNutrients) {
    const value = numberInput(`nutrition-${key}`);
    if (value !== null) totals[key] = value;
  }
  return totals;
}
function refreshNutrientInputs(nutrients) {
  for (const [key] of ALL_REVIEW_FIELDS) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(`nutrition-${key}`));
    if (!input || userEditedNutrients.has(key)) continue;
    const value = nutrients?.[key];
    input.value = hasFiniteNumber(value) ? String(value) : '';
  }
  refreshFuelPreviewFromInputs();
}

function refreshFuelPreviewFromInputs() {
  const carbohydrateG = numberInput('nutrition-carbohydrateG');
  const fatG = numberInput('nutrition-fatG');
  renderFuelOverlapPreview({
    ...(carbohydrateG === null ? {} : { carbohydrateG }),
    ...(fatG === null ? {} : { fatG }),
  });
}

function markReviewChange(kind, detail = '') {
  if (!pendingAnalysis) return;
  pendingAnalysis.source = pendingAnalysis.source || { kind: 'manual' };
  pendingAnalysis.source.review = pendingAnalysis.source.review || {};
  if (kind === 'portion') pendingAnalysis.source.review.editedPortions = Number(pendingAnalysis.source.review.editedPortions || 0) + 1;
  if (kind === 'removed') {
    const removed = pendingAnalysis.source.review.removedComponents || [];
    if (detail && !removed.includes(detail)) removed.push(detail);
    pendingAnalysis.source.review.removedComponents = removed;
  }
}

function recalculateReviewedComponents(message = 'Portion updated', preserveUnlinked = false) {
  if (!pendingAnalysis) return;
  const previous = pendingAnalysis.analysis.nutrients;
  const result = recalculateMealFromComponents(
    pendingAnalysis.analysis.components,
    previous,
    currentExplicitNutrients(),
  );
  if (preserveUnlinked) result.nutrients = { ...previous, ...result.nutrients };
  pendingAnalysis.analysis.nutrients = result.nutrients;
  refreshNutrientInputs(result.nutrients);
  renderEditableComponents(pendingAnalysis.analysis.components);
  renderReviewEvidence(pendingAnalysis);
  renderNutrientEstimateSummary(pendingAnalysis);
  const cleared = !preserveUnlinked && result.removedEstimatedKeys.length;
  if (componentPortionNeedsReanalysis()) {
    setStatus(`${message}, but this ingredient has no linked nutrient profile. Recalculate the estimate before saving.`, 'warning');
  } else {
    setStatus(`${message}. Linked nutrients recalculated${preserveUnlinked ? '; unchanged unlinked totals kept' : cleared ? '; unsupported estimates cleared' : ''}.`, 'success');
  }
  updateCorrectionState();
}

function refreshComponentIdentityDirty() {
  const current = (pendingAnalysis?.analysis?.components || []).map(item => normalizeMealName(item?.name));
  componentIdentityDirty = isPhotoEstimate() && (current.length !== analyzedComponentIdentityBaseline.length
    || current.some((name, index) => name !== analyzedComponentIdentityBaseline[index]));
}

function updateComponentName(index, value) {
  const component = pendingAnalysis?.analysis?.components?.[index];
  if (!component) return;
  component.name = String(value || '').trim().slice(0, 120);
  if (normalizeMealName(component.name) === (analyzedComponentIdentityBaseline[index] || '')) {
    userEditedComponentIdentities.delete(component);
  } else {
    userEditedComponentIdentities.add(component);
  }
  refreshComponentIdentityDirty();
  updateCorrectionState();
}

function updateComponentGrams(index, value) {
  const component = pendingAnalysis?.analysis?.components?.[index];
  if (!component) return;
  const grams = value === '' ? null : Number(value);
  const next = grams !== null && Number.isFinite(grams) && grams >= 0 ? grams : null;
  const current = hasFiniteNumber(component.quantityG) ? Number(component.quantityG) : null;
  if (next === current) { updateCorrectionState(); return; }
  pendingAnalysis.analysis.components[index] = updateComponentQuantity(component, next);
  markReviewChange('portion');
  recalculateReviewedComponents('Portion updated', true);
}

function syncReviewedComponentGrams() {
  if (!pendingAnalysis?.analysis?.components?.length) return;
  let changed = false;
  const inputs = Array.from(document.querySelectorAll('[data-nutrition-component-grams]'));
  for (const field of inputs) {
    if (!(field instanceof HTMLInputElement)) continue;
    const index = Number(field.getAttribute('data-nutrition-component-grams'));
    const component = pendingAnalysis.analysis.components[index];
    if (!component) continue;
    const raw = field.value;
    const parsed = raw === '' ? null : Number(raw);
    const next = Number.isFinite(parsed) && Number(parsed) >= 0 ? Number(parsed) : null;
    const current = hasFiniteNumber(component.quantityG) ? Number(component.quantityG) : null;
    if (next === current) continue;
    pendingAnalysis.analysis.components[index] = updateComponentQuantity(component, next);
    markReviewChange('portion');
    changed = true;
  }
  if (changed) {
    recalculateReviewedComponents('Portions synchronized before save', true);
  }
}

function addMissingComponent() {
  if (!pendingAnalysis) {
    pendingAnalysis = {
      analysis: { mealName: currentMealName() || 'Meal', nutrients: {}, components: [], confidence: null, assumptions: [], warnings: [], label: null },
      image: null, images: [], source: { kind: 'manual', analysisKind },
    };
    lastAnalyzedMealName = pendingAnalysis.analysis.mealName;
    lastAnalyzedKind = analysisKind;
    lastAnalyzedConsumption = consumptionKey();
  }
  pendingAnalysis.analysis.components.push(normalizeNutritionComponent({ name: '', quantityG: null, confidence: null, nutrients: {} }));
  refreshComponentIdentityDirty();
  renderEditableComponents(pendingAnalysis.analysis.components);
  /** @type {HTMLElement | null} */ (document.querySelector(`[data-nutrition-component-name="${pendingAnalysis.analysis.components.length - 1}"]`))?.focus();
  updateCorrectionState();
}

function removeComponent(index) {
  const component = pendingAnalysis?.analysis?.components?.[index];
  if (!component) return;
  userEditedComponentIdentities.delete(component);
  userEditedComponentIdentities.delete(component.name);
  pendingAnalysis.analysis.components.splice(index, 1);
  refreshComponentIdentityDirty();
  markReviewChange('removed', component.name || 'Unnamed item');
  recalculateReviewedComponents(`${component.name || 'Item'} removed`);
}

function numberInput(id) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (input?.dataset.nutritionPartial === 'true') return null;
  const value = input?.value;
  return value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

async function saveMeal() {
  syncReviewedComponentGrams();
  if (analysisInputsDirty()) {
    showNotification('Recalculate the estimate after changing the analyzed details.', 'info');
    document.getElementById('nutrition-recalculate-btn')?.focus();
    return;
  }
  const name = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-meal-name'))?.value.trim() || '';
  const localDate = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-eaten-at'))?.value || '';
  const mealType = /** @type {HTMLSelectElement | null} */ (document.getElementById('nutrition-meal-type'))?.value || '';
  if (!name) {
    showNotification('Add a meal name before saving.', 'error');
    document.getElementById('nutrition-meal-name')?.focus();
    return;
  }
  if (!MEAL_TYPES.some(([value]) => value === mealType)) {
    showNotification('Choose whether this was breakfast, lunch, dinner, a snack, or another meal type.', 'error');
    document.getElementById('nutrition-meal-type')?.focus();
    return;
  }
  const originalSource = pendingAnalysis?.source || { kind: 'manual' };
  const reviewedNutrientKeys = new Set([
    ...(originalSource?.review?.editedNutrients || []),
    ...userEditedNutrients,
  ]);
  const photoAllowed = photoEstimateNutrientAllowlist(originalSource, [...reviewedNutrientKeys], [...PHOTO_NUTRIENT_KEYS]);
  const nutrients = Object.fromEntries(Object.entries(pendingAnalysis?.analysis?.nutrients || {})
    .filter(([key]) => originalSource.kind !== 'ai-photo-estimate' || photoAllowed.has(key)));
  for (const [key] of ALL_REVIEW_FIELDS) {
    const value = numberInput(`nutrition-${key}`);
    if (value === null) delete nutrients[key];
    else nutrients[key] = value;
  }
  const eatenAt = new Date(localDate);
  if (!Number.isFinite(eatenAt.getTime())) {
    showNotification('Choose a valid meal date and time.', 'error');
    return;
  }
  const note = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('nutrition-note'))?.value.trim() || '';
  const analysisContext = currentKnownDetails();
  const [, timePart = '00:00'] = localDate.split('T');
  const [localHour, localMinute] = timePart.split(':').map(Number);
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  try {
    const wasEditing = !!editingMealId;
    const source = reusedMealId
      ? {
          kind: 'reused-meal',
          templateMealId: reusedMealId,
          recordedAt: new Date().toISOString(),
          originalSource: { kind: originalSource.kind || 'manual', provider: originalSource.provider || '', model: originalSource.model || '' },
          ...(originalSource.foodData ? { foodData: originalSource.foodData } : {}),
        }
      : { ...(pendingAnalysis?.source || { kind: 'manual', recordedAt: new Date().toISOString() }) };
    const editedComponentIdentities = [...new Set([...userEditedComponentIdentities]
      .map(value => value && typeof value === 'object' ? value.name : value)
      .map(value => String(value || '').trim())
      .filter(Boolean))];
    source.review = {
      ...(source.review || {}),
      userContext: analysisContext,
      editedNutrients: [...reviewedNutrientKeys],
      editedComponentIdentities,
      mealNameEdited: !!(lastAnalyzedMealName && normalizeMealName(name) !== normalizeMealName(lastAnalyzedMealName)),
      reviewedAt: new Date().toISOString(),
    };
    source.nutrientBasis = source.kind === 'ai-photo-estimate'
      ? photoEstimateNutrientBasis(source)
      : source.kind === 'ai-label-scan'
        ? 'label-transcription'
        : 'user-entered';
    if (pendingAnalysis?.analysis?.label) source.label = pendingAnalysis.analysis.label;
    const images = reusedMealId ? [] : (pendingAnalysis?.images?.length ? pendingAnalysis.images : existingImages);
    const saved = await saveActiveProfileMeal({
      ...(editingMealId ? { id: editingMealId, createdAt: editingCreatedAt || undefined } : {}),
      name,
      mealType,
      eatenAt: eatenAt.toISOString(),
      localDate: localDate.slice(0, 10),
      localTimeMinutes: Number.isFinite(localHour) && Number.isFinite(localMinute) ? localHour * 60 + localMinute : null,
      timezoneOffsetMinutes: eatenAt.getTimezoneOffset(),
      timeZone,
      note,
      analysisContext,
      nutrients,
      components: persistedNutritionComponents(pendingAnalysis?.analysis?.components || []),
      assumptions: pendingAnalysis?.analysis?.assumptions || [],
      warnings: [...new Set([...(pendingAnalysis?.analysis?.warnings || []), ...images.flatMap(image => image?.qualityWarnings || [])])],
      confidence: pendingAnalysis?.analysis?.confidence ?? null,
      images,
      ...(editingResponseCheckIn ? { responseCheckIn: editingResponseCheckIn } : {}),
      source,
      reviewed: true,
    });
    refreshWidget();
    await openMealDetail(saved.id, { returnTo: editorDetailReturnTo });
    showNotification(wasEditing ? 'Meal changes saved and queued for sync.' : 'Meal saved and queued for sync.', 'success');
  } catch (error) {
    showNotification(getErrorMessage(error, 'Meal could not be saved.'), 'error');
  }
}

async function deleteMeal(id, origin = 'history') {
  if (!id || !await showConfirmDialog('Delete this meal and its thumbnail from synced devices?')) return;
  try {
    await deleteActiveProfileMeal(id);
    refreshWidget();
    if (origin === 'history') await openNutritionHistory(getNutritionHistoryRange(), { view: 'meals' });
    else await openNutritionEditor();
    showNotification('Meal deletion queued for sync.', 'info');
  } catch (error) {
    showNotification(getErrorMessage(error, 'Meal could not be deleted.'), 'error');
  }
}

function refreshWidget() {
  document.querySelectorAll('.dashboard-widget[data-widget-id="nutrition"] .dashboard-widget-body')
    .forEach(body => { body.innerHTML = renderNutritionWidget(); });
  document.querySelectorAll('.dashboard-widget[data-widget-id="nutrition-fuel-mix"] .dashboard-widget-body')
    .forEach(body => { body.innerHTML = renderNutritionFuelWidget(); });
}

function refreshMealModelControl() {
  const current = document.getElementById('nutrition-meal-model-control');
  if (!current) return;
  current.outerHTML = renderMealModelControl();
  updateCorrectionState();
}

function refreshMealModelCatalogSurfaces() {
  refreshMealModelControl();
  refreshComparisonModelPicker();
}

function handleClick(event) {
  const target = event.target instanceof Element ? event.target.closest(`[${ACTION_ATTR}]`) : null;
  if (!target) return;
  const action = target.getAttribute(ACTION_ATTR);
  if (action === 'open') {
    if (target.getAttribute('data-nutrition-return') === 'history') void openNewMealFromHistory();
    else void openNutritionEditor();
  }
  else if (action === 'open-history') {
    if (isNutritionBackgroundSession()) showNotification('Return to the background meal request before opening Nutrition history.', 'info');
    else if (target.closest('.nutrition-recent')) void browseMealsFromEditor();
    else void openNutritionHistory();
  }
  else if (action === 'set-history-range') void openNutritionHistory(target.getAttribute('data-nutrition-range') || '30d', { view: getNutritionHistoryView(), resetMeals: true });
  else if (action === 'set-history-view') void openNutritionHistoryView(target.getAttribute('data-nutrition-view') || 'meals');
  else if (action === 'show-history-more') void showMoreNutritionHistoryMeals();
  else if (action === 'ask-history') void askAIAboutNutritionHistory(target.getAttribute('data-nutrition-range') || '30d');
  else if (action === 'open-targets') void openNutritionTargets({ returnTo: target.getAttribute('data-nutrition-return') || '' });
  else if (action === 'open-fluid-log') void openFluidLog();
  else if (action === 'open-ai-settings') openNutritionAISettings();
  else if (action === 'close') void requestCloseEditor();
  else if (action === 'set-kind') {
    const kind = target.getAttribute('data-nutrition-kind') || 'meal-photo';
    if (kind === 'manual') setManualEntryMode();
    else setAnalysisKind(kind);
  }
  else if (action === 'analyze') void analyzeSelectedPhoto();
  else if (action === 'cancel-analysis') cancelNutritionMealAnalysis();
  else if (action === 'reanalyze') void reanalyzeCorrectedMeal();
  else if (action === 'toggle-comparison') void openNutritionBenchmark();
  else if (action === 'clear-benchmark-photos') clearNutritionBenchmarkPhotos();
  else if (action === 'toggle-comparison-presentation') toggleComparisonPresentation();
  else if (action === 'run-comparison') void runModelComparison();
  else if (action === 'retry-comparison') void retryComparisonRun(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'cancel-comparison-run') cancelComparisonRun(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'remove-comparison-run') removeComparisonRun(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'replace-comparison-run') replaceComparisonRun(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'set-comparison-reference') setComparisonReference(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'clear-comparison-reference') clearComparisonReference();
  else if (action === 'clear-comparison-history') void clearSavedNutritionComparison();
  else if (action === 'use-comparison') void useComparisonEstimate(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'show-comparison') void openNutritionBenchmark();
  else if (action === 'save') void saveMeal();
  else if (action === 'save-response') void saveMealResponse(target.getAttribute('data-nutrition-id') || '');
  else if (action === 'clear-response') void clearMealResponse(target.getAttribute('data-nutrition-id') || '');
  else if (action === 'save-targets') void saveTargetsAndContinue(target.getAttribute('data-nutrition-return') || '');
  else if (action === 'save-fluid') void saveFluidLog();
  else if (action === 'set-fluid-amount') {
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-fluid-amount'));
    if (amountInput) amountInput.value = target.getAttribute('data-nutrition-amount') || amountInput.value;
    updateFluidLogControls();
  }
  else if (action === 'add-component') addMissingComponent();
  else if (action === 'remove-component') removeComponent(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'detail') void openMealDetail(target.getAttribute('data-nutrition-id') || '', { returnTo: target.getAttribute('data-nutrition-origin') || 'meals' });
  else if (action === 'edit') void openMealEditor(target.getAttribute('data-nutrition-id') || '', 'edit', target.getAttribute('data-nutrition-origin') || 'history');
  else if (action === 'reuse') void openMealEditor(target.getAttribute('data-nutrition-id') || '', 'reuse', target.getAttribute('data-nutrition-origin') || 'history');
  else if (action === 'return-editor') void restoreNutritionMealEntry();
  else if (action === 'return-history') void returnToNutritionHistory();
  else if (action === 'return-detail') void returnToMealDetail(target.getAttribute('data-nutrition-id') || '', target.getAttribute('data-nutrition-origin') || 'history');
  else if (action === 'back') {
    if (target.getAttribute('data-nutrition-origin') === 'history') void openNutritionHistory(getNutritionHistoryRange(), { view: 'meals' });
    else void openNutritionEditor();
  }
  else if (action === 'delete') void deleteMeal(target.getAttribute('data-nutrition-id') || '', target.getAttribute('data-nutrition-origin') || 'meals');
  else return;
  event.preventDefault();
  event.stopPropagation();
}

function handleChange(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.getAttribute(ACTION_ATTR) === 'photo') handlePhotoSelection(target);
  else if (target instanceof HTMLInputElement && target.id === 'nutrition-benchmark-photo-input') handleNutritionBenchmarkPhotoSelection(target);
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-comparison-model')) {
    const checked = document.querySelectorAll('[data-nutrition-comparison-model]:checked');
    if (checked.length > 4) {
      target.checked = false;
      showNotification('Compare up to four models at a time.', 'info');
    }
    updateComparisonControls();
    rememberNutritionComparisonWorkspace();
  }
  else if (target instanceof HTMLSelectElement && ['nutrition-consumed-unit', 'nutrition-meal-type'].includes(target.id)) updateCorrectionState();
  else if (target instanceof HTMLSelectElement && target.hasAttribute('data-nutrition-model-route')) {
    setNutritionAIRouteFromValue(target.value);
    refreshMealModelControl();
    showNotification('Meal photo model updated.', 'success');
  }
  else if (target instanceof HTMLSelectElement && target.id === 'nutrition-target-protein-basis') updateNutritionTargetControls();
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-widget-metric')) updateNutritionWidgetMetricControls();
  else if (target instanceof HTMLInputElement && target.name === 'nutrition-fluid-kind') updateFluidLogControls();
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-component-grams')) updateComponentGrams(Number(target.getAttribute('data-nutrition-component-grams')), target.value);
}

function handleInput(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-comparison-search')) filterNutritionComparisonModels(target.value);
  else if (target instanceof HTMLInputElement && target.id.startsWith('nutrition-target-')) updateNutritionTargetControls();
  else if (target instanceof HTMLInputElement && target.id === 'nutrition-fluid-amount') updateFluidLogControls();
  else if (target instanceof HTMLInputElement && ['nutrition-meal-name', 'nutrition-consumed-amount'].includes(target.id)) updateCorrectionState();
  else if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.hasAttribute('data-nutrition-reference')) {
    useManualComparisonReference();
  }
  else if (target instanceof HTMLTextAreaElement && target.id === 'nutrition-known-details') updateCorrectionState();
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-component-name')) updateComponentName(Number(target.getAttribute('data-nutrition-component-name')), target.value);
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-nutrient')) {
    const key = target.getAttribute('data-nutrition-nutrient') || '';
    if (key) {
      delete target.dataset.nutritionPartial;
      target.classList.remove('is-partial-food-value');
      target.removeAttribute('title');
      const source = document.getElementById(`nutrition-${key}-source`);
      if (source) { source.textContent = ''; source.hidden = true; }
      userEditedNutrients.add(key);
      const value = Number(target.value);
      if (pendingAnalysis) {
        if (target.value !== '' && Number.isFinite(value) && value >= 0) pendingAnalysis.analysis.nutrients[key] = value;
        else delete pendingAnalysis.analysis.nutrients[key];
      }
      if (key === 'carbohydrateG' || key === 'fatG') refreshFuelPreviewFromInputs();
    }
  }
}

export function installNutritionDelegates() {
  if (delegatesInstalled || typeof document === 'undefined') return;
  delegatesInstalled = true;
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleNutritionKeydown, true);
  globalThis.addEventListener?.('labcharts-ai-settings-local-changed', () => queueMicrotask(refreshMealModelCatalogSurfaces));
  globalThis.addEventListener?.('labcharts-nutrition-summary-changed', refreshWidget);
}

configureNutritionEntryForms({ refreshWidget, closeEditor, resetEditorState });
configureNutritionModalController({
  resetEditorState,
  hasUnsavedState: () => !!(pendingAnalysis || selectedPhotos().length || editingMealId || reusedMealId),
  onBackgroundClose: () => {
    rememberNutritionComparisonWorkspace();
    beginNutritionBackgroundSession();
  },
});
installNutritionDelegates();
