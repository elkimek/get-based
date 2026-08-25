// @ts-check
import { PHOTO_NUTRIENT_KEYS, analyzeMealPhoto, mealAnalysisFiles } from './nutrition-analysis.js';
import { cacheActiveProfileFood, deleteActiveProfileMeal, getActiveProfileFood, getActiveProfileMeal, listActiveProfileMeals, saveActiveProfileMeal } from './nutrition-store.js';
import { buildBarcodeMealAnalysis, fetchBarcodeFood, normalizeBarcode, normalizeNutritionComponent, recalculateMealFromComponents, updateComponentQuantity } from './nutrition-food-data.js';
import { enrichFreshPhotoAnalysis, foodCompositionNutrientBasis, foodCompositionPhotoAllowlist, persistedFoodCompositionComponents, updateFoodCompositionCoverage } from './nutrition-food-composition-state.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { escapeAttr, showConfirmDialog, showNotification } from './utils.js';
import { getErrorMessage } from './caught-error.js';
import { clearComparisonReference, clearSavedNutritionComparison, configureNutritionComparisonUI, refreshComparisonModelPicker, resetNutritionComparison, restoreNutritionComparison, retryComparisonRun, runModelComparison, setComparisonReference, showModelComparison, toggleModelComparison, updateComparisonControls, useComparisonEstimate, useManualComparisonReference } from './nutrition-comparison-ui.js';
import { analysisInputsDirty, applyAnalysis, clearAnalyzedFields, componentCorrectionContext, componentPortionNeedsReanalysis, configureNutritionReviewUI, consumptionKey, currentKnownDetails, currentMealName, currentSourceKind, finishAnalysisProgress, focusMobileNutritionReview, isPhotoEstimate, labelConsumption, mealNameCorrectionIsDirty, normalizeKnownDetails, normalizeMealName, renderEditableComponents, renderFoodCompositionSummary, renderFuelOverlapPreview, renderReviewEvidence, resetAnalysisProgress, setAnalysisKind, setStatus, startAnalysisProgress, updateAnalysisProgress, updateCorrectionState, updateFoodCompositionMatch } from './nutrition-review-ui.js';
import { ALL_REVIEW_FIELDS, MEAL_TYPES, ensureNutritionStylesheet, hasFiniteNumber, mealLocalDateTime, mealImages, renderStoredPhotoPreview, renderFluidLogModal, renderMealModelControl, renderNutritionCustomizeModal, renderNutritionEditor, renderNutritionFuelWidget, renderNutritionWidget, setElementValue } from './nutrition-render.js';
import { hydrateNutritionLocalAICatalog, setNutritionAIRouteFromValue } from './nutrition-ai-settings.js';
import { clearMealResponse, configureNutritionEntryForms, openMealDetail, saveFluidLog, saveMealResponse, saveNutritionTargets, updateFluidLogControls, updateNutritionTargetControls, updateNutritionWidgetMetricControls } from './nutrition-entry-forms.js';
import { closeNutritionEditor as closeEditor, configureNutritionModalController, handleNutritionEditorKeydown as handleNutritionKeydown, openNutritionAISettings, requestCloseNutritionEditor as requestCloseEditor } from './nutrition-modal-controller.js';
export { deleteNutritionDB } from './nutrition-store.js';
export { renderNutritionFuelWidget, renderNutritionWidget };
const ACTION_ATTR = 'data-nutrition-action';
let delegatesInstalled = false;
let previewUrls = [];
let pendingAnalysis = null;
let lastAnalyzedMealName = '';
/** @type {'meal-photo'|'nutrition-label'} */ let lastAnalyzedKind = 'meal-photo';
let lastAnalyzedConsumption = '';
let lastAnalyzedContext = '';
/** @type {'meal-photo'|'nutrition-label'} */ let analysisKind = 'meal-photo';
let activeAnalysisController = null;
let activeBarcodeController = null;
let editorGeneration = 0;
let componentIdentityDirty = false;
let analyzedComponentIdentityBaseline = [];
let editingMealId = '';
let editingCreatedAt = '';
let editingResponseCheckIn = null;
let reusedMealId = '';
let existingImages = [];
const userEditedNutrients = new Set();
const userEditedComponentIdentities = new Set();
function clearPreviewUrl() { for (const url of previewUrls) URL.revokeObjectURL(url); previewUrls = []; }
function resetEditorState() {
  editorGeneration += 1;
  activeAnalysisController?.abort(new DOMException('Meal editor closed.', 'AbortError')); activeAnalysisController = null;
  activeBarcodeController?.abort(new DOMException('Meal editor closed.', 'AbortError')); activeBarcodeController = null;
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
  existingImages = [];
  userEditedNutrients.clear();
  userEditedComponentIdentities.clear();
  clearPreviewUrl();
}
function populateEditorFromMeal(meal, reuse = false) {
  analysisKind = meal?.source?.kind === 'ai-label-scan' || meal?.source?.kind === 'barcode-database' ? 'nutrition-label' : 'meal-photo';
  setAnalysisKind(analysisKind);
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
  if (meal.source?.foodData?.barcode) setElementValue('nutrition-barcode', meal.source.foodData.barcode);
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
  void hydrateNutritionLocalAICatalog();
  resetEditorState();
  const seedMeal = options?.seedMeal || null;
  if (seedMeal && options?.mode === 'edit') {
    editingMealId = seedMeal.id || '';
    editingCreatedAt = seedMeal.createdAt || '';
  } else if (seedMeal && options?.mode === 'reuse') {
    reusedMealId = seedMeal.id || '';
  }
  let meals = [];
  let storageError = '';
  try {
    meals = await listActiveProfileMeals({ limit: 10 });
  } catch (error) {
    storageError = getErrorMessage(error, 'Stored meals could not be read. Do not clear browser data; recovery may still be possible.');
  }
  modal.innerHTML = renderNutritionEditor(meals, { editingMealId, reusedMealId, storageError });
  modal.scrollTop = 0;
  modal.classList.remove('nutrition-targets-modal', 'nutrition-fluid-modal');
  modal.classList.add('nutrition-modal');
  overlay.setAttribute('data-modal-dismiss-protected', '');
  renderEditableComponents([]);
  await restoreNutritionComparison();
  if (seedMeal) populateEditorFromMeal(seedMeal, options?.mode === 'reuse');
  else updateCorrectionState();
  openModalOverlay(overlay, { initialFocus: '#nutrition-photo-input', focusDelay: 30 });
  return true;
}
export async function openNutritionTargets() {
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  resetEditorState();
  modal.innerHTML = renderNutritionCustomizeModal();
  modal.scrollTop = 0;
  modal.classList.remove('nutrition-fluid-modal');
  modal.classList.add('nutrition-modal', 'nutrition-targets-modal');
  overlay.removeAttribute('data-modal-dismiss-protected');
  openModalOverlay(overlay, { initialFocus: '#nutrition-target-settings', focusDelay: 30 });
  return true;
}

export async function openFluidLog() {
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  resetEditorState();
  modal.innerHTML = renderFluidLogModal();
  modal.scrollTop = 0;
  modal.classList.remove('nutrition-targets-modal');
  modal.classList.add('nutrition-modal', 'nutrition-fluid-modal');
  overlay.removeAttribute('data-modal-dismiss-protected');
  updateFluidLogControls();
  openModalOverlay(overlay, { initialFocus: '#nutrition-fluid-amount', focusDelay: 30 });
  return true;
}

async function openMealEditor(id, mode) {
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
  return openNutritionEditor({ seedMeal: meal, mode });
}

function startNutritionRequest() { activeAnalysisController?.abort(new DOMException('Replaced by a new meal request.', 'AbortError')); activeAnalysisController = new AbortController(); return activeAnalysisController; }

function selectedPhotos() { return Array.from(/** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-photo-input'))?.files || []).slice(0, 4); }

configureNutritionReviewUI({
  getPendingAnalysis: () => pendingAnalysis,
  getComponentIdentityDirty: () => componentIdentityDirty,
  getLastAnalyzedMealName: () => lastAnalyzedMealName,
  getLastAnalyzedKind: () => lastAnalyzedKind,
  getLastAnalyzedConsumption: () => lastAnalyzedConsumption,
  getLastAnalyzedContext: () => lastAnalyzedContext,
  getExplicitNutrients: currentExplicitNutrients,
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
  resetNutritionComparison();
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

function analysisFiles() { return mealAnalysisFiles(selectedPhotos(), existingImages); }

configureNutritionComparisonUI({
  analysisFiles,
  hasPhotos: () => selectedPhotos().length > 0 || existingImages.length > 0,
  startRequest: startNutritionRequest,
  isRequestActive: controller => activeAnalysisController === controller,
  finishRequest: controller => { if (activeAnalysisController === controller) activeAnalysisController = null; },
  updateCorrectionState,
  getConsumption: labelConsumption,
  getUserContext: currentKnownDetails,
  getAnalysisKind: () => analysisKind,
  applyAnalysis,
  setStatus,
});

/** @param {{correctedMealName?: string, previousMealName?: string, button?: HTMLButtonElement | null}} [options] */
async function runMealAnalysis({ correctedMealName = '', previousMealName = '', button = null } = {}) {
  const files = await analysisFiles();
  if (!files.length) {
    showNotification('Choose at least one meal or label photo first.', 'info');
    return;
  }
  const comparisonReturn = document.getElementById('nutrition-comparison-return');
  if (comparisonReturn) comparisonReturn.hidden = true;
  const consumption = labelConsumption();
  const progressId = startAnalysisProgress(button, correctedMealName ? 'Recalculating…' : analysisKind === 'nutrition-label' ? 'Scanning…' : 'Analyzing…');
  const controller = startNutritionRequest();
  let completed = false;
  setStatus('');
  try {
    const userContext = [currentKnownDetails(), componentCorrectionContext()].filter(Boolean).join('\n');
    let result = await analyzeMealPhoto(files, {
      onProgress: (phase, label) => updateAnalysisProgress(progressId, phase, label),
      correctedMealName,
      previousMealName,
      analysisKind,
      consumedAmount: consumption.amount,
      consumedUnit: consumption.unit,
      userContext,
      signal: controller.signal,
    });
    if (controller.signal.aborted || activeAnalysisController !== controller) return;
    result = await enrichFreshPhotoAnalysis(result, analysisKind,
      () => updateAnalysisProgress(progressId, 4, 'Matching ingredients to food-composition data…'));
    if (controller.signal.aborted || activeAnalysisController !== controller) return;
    applyAnalysis(result);
    focusMobileNutritionReview();
    completed = true;
  } catch (error) {
    if (!controller.signal.aborted && activeAnalysisController === controller) {
      setStatus(getErrorMessage(error, 'The meal could not be analyzed.'), 'error');
    }
  } finally {
    if (activeAnalysisController === controller) {
      activeAnalysisController = null;
      finishAnalysisProgress(progressId, completed, button);
    }
  }
}

async function lookupBarcode() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-barcode'));
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-barcode-btn'));
  const barcode = normalizeBarcode(input?.value);
  if (!barcode) {
    showNotification('Enter an 8–14 digit EAN or UPC barcode.', 'info');
    input?.focus();
    return;
  }
  if (button) { button.disabled = true; button.textContent = 'Looking up…'; }
  activeBarcodeController?.abort(new DOMException('A newer food lookup started.', 'AbortError'));
  const controller = new AbortController();
  activeBarcodeController = controller;
  const generation = editorGeneration;
  setStatus('Checking the encrypted local food cache…');
  try {
    let food = await getActiveProfileFood(barcode).catch(() => null);
    if (controller.signal.aborted || generation !== editorGeneration) return;
    const cacheHit = !!food;
    if (!food) {
      setStatus('Looking up the barcode in Open Food Facts…');
      food = await fetchBarcodeFood(barcode, { signal: controller.signal });
      if (controller.signal.aborted || generation !== editorGeneration) return;
      if (food) await cacheActiveProfileFood(food);
    }
    if (controller.signal.aborted || generation !== editorGeneration) return;
    if (!food) throw new Error('No nutrition record was found for this barcode. Scan the label instead.');
    const result = /** @type {any} */ (buildBarcodeMealAnalysis(food, labelConsumption(), cacheHit));
    result.source.label = result.analysis.label;
    applyAnalysis(result, { quiet: true });
    setStatus(`${food.name} loaded from ${cacheHit ? 'the encrypted local cache' : 'Open Food Facts'}. Review the serving amount, then save.`, 'success');
  } catch (error) {
    if (controller.signal.aborted || generation !== editorGeneration) return;
    setStatus(getErrorMessage(error, 'The barcode could not be looked up.'), 'error');
  } finally {
    if (activeBarcodeController === controller) activeBarcodeController = null;
    if (generation === editorGeneration && button?.isConnected) { button.disabled = false; button.textContent = 'Find product'; }
  }
}

async function analyzeSelectedPhoto() {
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-analyze-btn'));
  await runMealAnalysis({ button });
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
  if (currentSourceKind() === 'barcode-database' && pendingAnalysis.source?.foodData?.catalogFood) {
    try {
      applyAnalysis(buildBarcodeMealAnalysis(pendingAnalysis.source.foodData.catalogFood, labelConsumption(), true), { quiet: true });
      setStatus('Nutrients updated in this browser for the new consumed amount.', 'success');
    } catch (error) {
      setStatus(getErrorMessage(error, 'The amount could not be updated.'), 'error');
    }
    return;
  }
  await runMealAnalysis({
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
  updateFoodCompositionCoverage(pendingAnalysis, result.recalculatedKeys);
  refreshNutrientInputs(result.nutrients);
  renderEditableComponents(pendingAnalysis.analysis.components);
  renderReviewEvidence(pendingAnalysis);
  renderFoodCompositionSummary(pendingAnalysis);
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
  const photoAllowed = foodCompositionPhotoAllowlist(originalSource, [...reviewedNutrientKeys], [...PHOTO_NUTRIENT_KEYS]);
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
      ? foodCompositionNutrientBasis(source)
      : source.kind === 'ai-label-scan' || source.kind === 'barcode-database'
        ? 'label-or-database'
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
      components: persistedFoodCompositionComponents(pendingAnalysis?.analysis?.components || []),
      assumptions: pendingAnalysis?.analysis?.assumptions || [],
      warnings: [...new Set([...(pendingAnalysis?.analysis?.warnings || []), ...images.flatMap(image => image?.qualityWarnings || [])])],
      confidence: pendingAnalysis?.analysis?.confidence ?? null,
      images,
      ...(editingResponseCheckIn ? { responseCheckIn: editingResponseCheckIn } : {}),
      source,
      reviewed: true,
    });
    refreshWidget();
    await openMealDetail(saved.id);
    showNotification(wasEditing ? 'Meal changes saved and queued for sync.' : 'Meal saved and queued for sync.', 'success');
  } catch (error) {
    showNotification(getErrorMessage(error, 'Meal could not be saved.'), 'error');
  }
}

async function deleteMeal(id) {
  if (!id || !await showConfirmDialog('Delete this meal and its thumbnail from synced devices?')) return;
  try {
    await deleteActiveProfileMeal(id);
    refreshWidget();
    await openNutritionEditor();
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

function toggleRecentMeals(button) {
  const rows = document.getElementById('nutrition-recent-more');
  if (!rows) return;
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  const remaining = Math.max(0, Number(button.getAttribute('data-nutrition-remaining')) || 0);
  rows.hidden = !expanded;
  button.setAttribute('aria-expanded', String(expanded));
  button.textContent = expanded
    ? 'Show less'
    : `Show ${remaining} more meal${remaining === 1 ? '' : 's'}`;
  if (!expanded) button.scrollIntoView({ block: 'nearest' });
}

function handleClick(event) {
  const target = event.target instanceof Element ? event.target.closest(`[${ACTION_ATTR}]`) : null;
  if (!target) return;
  const action = target.getAttribute(ACTION_ATTR);
  if (action === 'open') void openNutritionEditor();
  else if (action === 'open-targets') void openNutritionTargets();
  else if (action === 'open-fluid-log') void openFluidLog();
  else if (action === 'open-ai-settings') openNutritionAISettings();
  else if (action === 'close') void requestCloseEditor();
  else if (action === 'set-kind') setAnalysisKind(target.getAttribute('data-nutrition-kind') || 'meal-photo');
  else if (action === 'analyze') void analyzeSelectedPhoto();
  else if (action === 'barcode') void lookupBarcode();
  else if (action === 'reanalyze') void reanalyzeCorrectedMeal();
  else if (action === 'toggle-comparison') toggleModelComparison();
  else if (action === 'run-comparison') void runModelComparison();
  else if (action === 'retry-comparison') void retryComparisonRun(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'set-comparison-reference') setComparisonReference(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'clear-comparison-reference') clearComparisonReference();
  else if (action === 'clear-comparison-history') void clearSavedNutritionComparison();
  else if (action === 'use-comparison') void useComparisonEstimate(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'show-comparison') showModelComparison();
  else if (action === 'save') void saveMeal();
  else if (action === 'save-response') void saveMealResponse(target.getAttribute('data-nutrition-id') || '');
  else if (action === 'clear-response') void clearMealResponse(target.getAttribute('data-nutrition-id') || '');
  else if (action === 'save-targets') void saveNutritionTargets();
  else if (action === 'save-fluid') void saveFluidLog();
  else if (action === 'set-fluid-amount') {
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-fluid-amount'));
    if (amountInput) amountInput.value = target.getAttribute('data-nutrition-amount') || amountInput.value;
    updateFluidLogControls();
  }
  else if (action === 'add-component') addMissingComponent();
  else if (action === 'remove-component') removeComponent(Number(target.getAttribute('data-nutrition-index')));
  else if (action === 'detail') void openMealDetail(target.getAttribute('data-nutrition-id') || '');
  else if (action === 'edit') void openMealEditor(target.getAttribute('data-nutrition-id') || '', 'edit');
  else if (action === 'reuse') void openMealEditor(target.getAttribute('data-nutrition-id') || '', 'reuse');
  else if (action === 'back') void openNutritionEditor();
  else if (action === 'delete') void deleteMeal(target.getAttribute('data-nutrition-id') || '');
  else if (action === 'toggle-recent') toggleRecentMeals(target);
  else return;
  event.preventDefault();
  event.stopPropagation();
}

function handleChange(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.getAttribute(ACTION_ATTR) === 'photo') handlePhotoSelection(target);
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-comparison-model')) {
    const checked = document.querySelectorAll('[data-nutrition-comparison-model]:checked');
    if (checked.length > 4) {
      target.checked = false;
      showNotification('Compare up to four models at a time.', 'info');
    }
    updateComparisonControls();
  }
  else if (target instanceof HTMLSelectElement && ['nutrition-consumed-unit', 'nutrition-meal-type'].includes(target.id)) updateCorrectionState();
  else if (target instanceof HTMLSelectElement && target.hasAttribute('data-nutrition-model-route')) {
    setNutritionAIRouteFromValue(target.value);
    refreshMealModelControl();
    showNotification('Meal photo model updated.', 'success');
  }
  else if (target instanceof HTMLSelectElement && target.hasAttribute('data-nutrition-food-match')) {
    void updateFoodCompositionMatch(Number(target.getAttribute('data-nutrition-food-match')), Number(target.value) || 0);
  }
  else if (target instanceof HTMLSelectElement && target.id === 'nutrition-target-protein-basis') updateNutritionTargetControls();
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-widget-metric')) updateNutritionWidgetMetricControls(target);
  else if (target instanceof HTMLInputElement && target.name === 'nutrition-fluid-kind') updateFluidLogControls();
  else if (target instanceof HTMLInputElement && target.hasAttribute('data-nutrition-component-grams')) updateComponentGrams(Number(target.getAttribute('data-nutrition-component-grams')), target.value);
}

function handleInput(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id.startsWith('nutrition-target-')) updateNutritionTargetControls();
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
});
installNutritionDelegates();
