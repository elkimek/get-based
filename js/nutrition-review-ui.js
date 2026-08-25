// @ts-check
// nutrition-review-ui.js — editor review state, validation, and progress UI.

import { getMealAnalysisAvailability, nutritionUsageSummary } from './nutrition-analysis.js';
import { reviewFoodCompositionCandidate } from './nutrition-food-composition-state.js';
import { normalizeNutritionComponent, sumComponentNutrients } from './nutrition-food-data.js';
import { calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { isNutritionComparisonRunning } from './nutrition-comparison-ui.js';
import {
  ALL_REVIEW_FIELDS, MEAL_TYPES, actionAttrs, formatNumber, hasFiniteNumber, renderFuelOverlapCard,
} from './nutrition-render.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { getErrorMessage } from './caught-error.js';

let analysisProgressId = 0;
/** @type {{id: number, phase: number, label: string, startedAt: number, timer: number | null, buttonLabel: string} | null} */
let analysisProgress = null;
let componentPortionBaseline = [];
/** @type {any} */
let reviewDeps = {
  getPendingAnalysis: () => null,
  getComponentIdentityDirty: () => false,
  getLastAnalyzedMealName: () => '',
  getLastAnalyzedKind: () => 'meal-photo',
  getLastAnalyzedConsumption: () => '',
  getLastAnalyzedContext: () => '',
  getExplicitNutrients: () => ({}),
  getAnalysisKind: () => 'meal-photo',
  setAnalysisKind: () => {},
  getEditingMealId: () => '',
  getReusedMealId: () => '',
  getExistingImages: () => [],
  selectedPhotoCount: () => 0,
  applyResultState: () => {},
};

export function configureNutritionReviewUI(deps = {}) {
  reviewDeps = { ...reviewDeps, ...deps };
}

export function resetAnalysisProgress() {
  if (analysisProgress?.timer) clearInterval(analysisProgress.timer);
  analysisProgress = null;
  analysisProgressId += 1;
}

export function isAnalysisProgressRunning() {
  return !!analysisProgress?.timer;
}

export function setStatus(text, tone = '') {
  const status = document.getElementById('nutrition-analysis-status');
  if (!status) return;
  status.className = `nutrition-analysis-status${tone ? ` is-${tone}` : ''}`;
  status.textContent = text;
}

export function renderFuelOverlapPreview(nutrients = {}) {
  const area = document.getElementById('nutrition-fuel-preview');
  if (!area) return;
  const mix = calculateFuelOverlap(nutrients);
  area.hidden = !mix;
  area.innerHTML = mix ? renderFuelOverlapCard(mix, { scope: 'meal', compact: true }) : '';
}

function analysisElapsed(startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return seconds < 60 ? `${seconds}s elapsed` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s elapsed`;
}

function renderAnalysisProgress(id, state = 'running') {
  if (!analysisProgress || analysisProgress.id !== id) return;
  const area = document.getElementById('nutrition-analysis-progress');
  if (!area) return;
  const { phase, label, startedAt } = analysisProgress;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const percentages = [8, 24, 58, 86, 96];
  const base = percentages[Math.max(0, Math.min(4, phase))];
  const percent = state === 'success' ? 100 : (phase === 2 ? Math.min(82, base + Math.floor(elapsedSeconds / 3) * 2) : base);
  const slowHint = state === 'running' && elapsedSeconds >= 15 ? ' · The provider is still working.' : '';
  area.hidden = false;
  area.className = `nutrition-analysis-progress is-${state}`;
  area.innerHTML = `<div class="nutrition-analysis-progress-head"><strong>${escapeHTML(label)}</strong><span>${state === 'running' ? `Step ${Math.max(1, phase)} of 4 · ${analysisElapsed(startedAt)}${slowHint}` : state === 'success' ? 'Complete' : 'Stopped'}</span></div><div class="nutrition-analysis-progress-track" role="progressbar" aria-label="Meal photo analysis progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`;
}

export function startAnalysisProgress(button, loadingLabel = 'Analyzing…') {
  if (analysisProgress?.timer) clearInterval(analysisProgress.timer);
  const id = ++analysisProgressId;
  analysisProgress = { id, phase: 1, label: 'Preparing photo…', startedAt: Date.now(), timer: null, buttonLabel: button?.textContent || '' };
  button?.classList.add('is-loading');
  if (button) button.textContent = loadingLabel;
  renderAnalysisProgress(id);
  analysisProgress.timer = setInterval(() => renderAnalysisProgress(id), 1000);
  updateCorrectionState();
  return id;
}

export function updateAnalysisProgress(id, phase, label) {
  if (!analysisProgress || analysisProgress.id !== id) return;
  analysisProgress.phase = phase;
  analysisProgress.label = label;
  renderAnalysisProgress(id);
}

export function finishAnalysisProgress(id, success, button) {
  if (!analysisProgress || analysisProgress.id !== id) return;
  const buttonLabel = analysisProgress.buttonLabel;
  if (analysisProgress.timer) clearInterval(analysisProgress.timer);
  analysisProgress.timer = null;
  analysisProgress.phase = 4;
  analysisProgress.label = success ? 'Estimate ready' : 'Analysis stopped';
  renderAnalysisProgress(id, success ? 'success' : 'error');
  button?.classList.remove('is-loading');
  if (button && buttonLabel) button.textContent = buttonLabel;
  updateCorrectionState();
  setTimeout(() => {
    if (!analysisProgress || analysisProgress.id !== id) return;
    const area = document.getElementById('nutrition-analysis-progress');
    if (area) area.hidden = true;
    analysisProgress = null;
  }, success ? 1800 : 6000);
}

export function normalizeMealName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function normalizeKnownDetails(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function currentMealName() {
  return /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-meal-name'))?.value.trim() || '';
}

export function currentKnownDetails() {
  return /** @type {HTMLTextAreaElement | null} */ (document.getElementById('nutrition-known-details'))?.value.trim() || '';
}

export function componentCorrectionContext() {
  if (!reviewDeps.getComponentIdentityDirty() && !componentPortionNeedsReanalysis()) return '';
  const reviewed = (reviewDeps.getPendingAnalysis()?.analysis?.components || [])
    .filter(item => String(item?.name || '').trim())
    .map(item => `${String(item.name).trim()}${hasFiniteNumber(item.quantityG) ? ` (${formatNumber(item.quantityG, 0)} g)` : ''}`);
  return reviewed.length ? `User-reviewed ingredients and portions: ${reviewed.join('; ')}.` : '';
}

export function currentSourceKind() {
  return String(reviewDeps.getPendingAnalysis()?.source?.kind || '');
}

export function componentPortionNeedsReanalysis() {
  if (!['ai-photo-estimate', 'ai-label-scan'].includes(currentSourceKind())) return false;
  return (reviewDeps.getPendingAnalysis()?.analysis?.components || []).some((component, index) => {
    if (Object.keys(component?.nutrientsPer100g || {}).length) return false;
    const current = hasFiniteNumber(component?.quantityG) ? Number(component.quantityG) : null;
    return current !== (componentPortionBaseline[index] ?? null);
  });
}

export function focusMobileNutritionReview() {
  if (!globalThis.matchMedia?.('(max-width: 760px)').matches) return;
  const heading = /** @type {HTMLElement | null} */ (document.querySelector('.nutrition-review-heading'));
  if (!heading) return;
  heading.tabIndex = -1;
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => {
    heading.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    heading.focus({ preventScroll: true });
  });
}

export function isPhotoEstimate() {
  return currentSourceKind() === 'ai-photo-estimate';
}

export function mealNameCorrectionIsDirty() {
  return !!(isPhotoEstimate() && reviewDeps.getLastAnalyzedMealName()
    && normalizeMealName(currentMealName()) !== normalizeMealName(reviewDeps.getLastAnalyzedMealName()));
}

export function labelConsumption() {
  const amountValue = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-consumed-amount'))?.value || '1';
  const amount = Number(amountValue);
  const unit = /** @type {HTMLSelectElement | null} */ (document.getElementById('nutrition-consumed-unit'))?.value || 'servings';
  /** @type {'servings'|'g'|'ml'|'packages'} */
  const normalizedUnit = unit === 'g' || unit === 'ml' || unit === 'packages' ? unit : 'servings';
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : 1,
    unit: normalizedUnit,
  };
}

export function consumptionKey(kind = reviewDeps.getAnalysisKind()) {
  if (kind !== 'nutrition-label') return '';
  const consumption = labelConsumption();
  return `${consumption.amount}:${consumption.unit}`;
}

export function analysisInputsDirty() {
  if (!reviewDeps.getPendingAnalysis()) return false;
  return mealNameCorrectionIsDirty()
    || (isPhotoEstimate() && reviewDeps.getComponentIdentityDirty())
    || componentPortionNeedsReanalysis()
    || (isPhotoEstimate() && reviewDeps.getLastAnalyzedContext() !== normalizeKnownDetails(currentKnownDetails()))
    || reviewDeps.getLastAnalyzedKind() !== reviewDeps.getAnalysisKind()
    || reviewDeps.getLastAnalyzedConsumption() !== consumptionKey();
}

export function updateCorrectionState() {
  const review = document.getElementById('nutrition-correction-review');
  const copy = document.getElementById('nutrition-correction-copy');
  const recalculate = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-recalculate-btn'));
  const analyze = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-analyze-btn'));
  const save = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-save-btn'));
  const saveRequirement = document.getElementById('nutrition-save-requirement');
  const photo = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-photo-input'));
  const running = !!analysisProgress?.timer || isNutritionComparisonRunning();
  const dirty = analysisInputsDirty();
  const portionDirty = componentPortionNeedsReanalysis();
  const nameDirty = mealNameCorrectionIsDirty();
  const kindDirty = !!reviewDeps.getPendingAnalysis() && reviewDeps.getLastAnalyzedKind() !== reviewDeps.getAnalysisKind();
  const consumptionDirty = !!reviewDeps.getPendingAnalysis() && reviewDeps.getLastAnalyzedConsumption() !== consumptionKey();
  const contextDirty = isPhotoEstimate() && reviewDeps.getLastAnalyzedContext() !== normalizeKnownDetails(currentKnownDetails());
  const name = currentMealName();
  const mealType = /** @type {HTMLSelectElement | null} */ (document.getElementById('nutrition-meal-type'))?.value || '';
  const validMealType = MEAL_TYPES.some(([value]) => value === mealType);
  const hasPhotos = reviewDeps.selectedPhotoCount() > 0 || reviewDeps.getExistingImages().length > 0;
  if (review) {
    review.hidden = !reviewDeps.getPendingAnalysis();
    review.classList.toggle('is-dirty', dirty);
  }
  if (copy && reviewDeps.getPendingAnalysis()) {
    const reasons = [];
    if (kindDirty) reasons.push('Photo interpretation changed.');
    if (consumptionDirty) reasons.push('Amount eaten changed.');
    if (reviewDeps.getComponentIdentityDirty()) reasons.push('Ingredient list changed.');
    if (portionDirty) reasons.push('An ingredient amount changed without linked nutrient data.');
    if (contextDirty) reasons.push('Known details changed.');
    if (nameDirty) reasons.push(`Meal name changed from “${escapeHTML(reviewDeps.getLastAnalyzedMealName())}”.`);
    copy.innerHTML = dirty
      ? `<strong>Estimate needs recalculation.</strong> ${reasons.join(' ')}`
      : '<strong>Wrong identification?</strong> Edit the meal name or food list, then recalculate.';
  }
  if (recalculate) recalculate.textContent = currentSourceKind() === 'barcode-database' ? 'Update amount' : 'Recalculate estimate';
  if (recalculate) recalculate.disabled = running || !dirty || !name;
  if (analyze) analyze.disabled = running || dirty || !hasPhotos || !getMealAnalysisAvailability().available;
  if (save) save.disabled = running || dirty || !name || !validMealType;
  if (saveRequirement) {
    saveRequirement.classList.toggle('is-ready', !running && !dirty && !!name && validMealType);
    saveRequirement.textContent = running
      ? 'Analysis in progress…'
      : dirty
      ? portionDirty
        ? 'Recalculate after changing an unlinked ingredient amount.'
        : 'Recalculate the changed estimate before saving.'
      : !name && !validMealType
      ? 'Add a meal name and choose an occasion to save.'
      : !name
      ? 'Add a meal name to save.'
      : !validMealType
      ? 'Choose a meal occasion to save.'
      : 'Ready to save locally.';
  }
  if (photo) photo.disabled = running;
  document.querySelectorAll('.nutrition-capture-tabs button').forEach(button => {
    if (button instanceof HTMLButtonElement) button.disabled = running;
  });
}

export function clearAnalyzedFields() {
  const name = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-meal-name'));
  if (name) name.value = '';
  for (const [key] of ALL_REVIEW_FIELDS) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(`nutrition-${key}`));
    if (input) input.value = '';
  }
  const components = document.getElementById('nutrition-components');
  if (components) components.innerHTML = '';
  const evidence = document.getElementById('nutrition-review-evidence');
  if (evidence) { evidence.innerHTML = ''; evidence.hidden = true; }
  const checks = document.getElementById('nutrition-review-checks');
  if (checks) { checks.innerHTML = ''; checks.hidden = true; }
  const labelDetails = document.getElementById('nutrition-label-details');
  if (labelDetails) {
    labelDetails.textContent = '';
    labelDetails.hidden = true;
  }
  renderFuelOverlapPreview({});
}

export function setAnalysisKind(kind) {
  const analysisKind = kind === 'nutrition-label' ? 'nutrition-label' : 'meal-photo';
  reviewDeps.setAnalysisKind(analysisKind);
  document.querySelectorAll('.nutrition-capture-tabs button').forEach(button => {
    const selected = button.getAttribute('data-nutrition-kind') === reviewDeps.getAnalysisKind();
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const consumption = document.getElementById('nutrition-label-consumption');
  if (consumption) consumption.hidden = analysisKind !== 'nutrition-label';
  const prompt = document.getElementById('nutrition-photo-prompt');
  if (prompt) prompt.textContent = analysisKind === 'nutrition-label' ? 'Add nutrition label' : 'Add meal photo';
  const analyze = document.getElementById('nutrition-analyze-btn');
  if (analyze && !analyze.classList.contains('is-loading')) analyze.textContent = analysisKind === 'nutrition-label' ? 'Scan label' : 'Analyze photo';
  const modelPurpose = document.getElementById('nutrition-model-purpose');
  if (modelPurpose) modelPurpose.textContent = analysisKind === 'nutrition-label' ? 'Label model' : 'Photo model';
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.querySelector('[data-nutrition-model-route]'));
  if (modelSelect) modelSelect.setAttribute('aria-label', analysisKind === 'nutrition-label' ? 'Nutrition label analysis model' : 'Meal photo analysis model');
  const privacyLine = document.getElementById('nutrition-privacy-line');
  if (privacyLine) privacyLine.textContent = analysisKind === 'nutrition-label'
    ? 'Sent only when you choose Scan label; originals are not saved. First cloud use asks for approval.'
    : 'Sent only when you choose Analyze photo; originals are not saved. First cloud use asks for approval.';
  const mealName = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-meal-name'));
  if (mealName && !mealName.value) mealName.placeholder = analysisKind === 'nutrition-label' ? 'e.g. Greek yogurt' : 'e.g. Lentil bowl';
  if (reviewDeps.selectedPhotoCount()) setStatus(analysisKind === 'nutrition-label' ? 'Ready to scan label. Nothing has been sent.' : 'Ready to analyze. Nothing has been sent.');
  updateCorrectionState();
}

function setInputValue(id, value) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (input && hasFiniteNumber(value)) input.value = String(value);
}

function componentReviewRead(item) {
  const identity = item?.confidence == null ? 'Review identity' : 'Identity estimate';
  const portion = hasFiniteNumber(item?.quantityG)
    ? item?.portionReviewed ? 'Portion adjusted' : 'Check portion'
    : 'Portion missing';
  return { identity, portion };
}

function foodCompositionControl(item, index) {
  if (!item?.foodCompositionAttempted && !item?.foodData?.fdcId) return '';
  const candidates = Array.isArray(item?.foodDataCandidates) ? item.foodDataCandidates : [];
  const selectedId = Number(item?.foodData?.fdcId) || 0;
  if (selectedId && !candidates.length) {
    return `<div class="nutrition-component-food-data is-readonly"><span>Food composition</span><strong>${escapeHTML(item.foodData?.description || 'Saved USDA match')}</strong><small>Confirmed · ${escapeHTML(item.foodData?.dataset || 'FNDDS 2021-2023')}</small></div>`;
  }
  const choices = [...candidates];
  if (selectedId && !choices.some(candidate => Number(candidate?.fdcId) === selectedId)) {
    choices.unshift({ fdcId: selectedId, description: item.foodData?.description || 'Saved USDA match' });
  }
  const status = selectedId
    ? `${item.foodData?.reviewed ? 'Confirmed' : 'Suggested — review'} · ${item.foodData?.dataset || 'FNDDS 2021-2023'}`
    : choices.length ? 'Choose a match for micronutrients' : 'No local match · macros only';
  return `<label class="nutrition-component-food-data"><span>Food composition</span><select data-nutrition-food-match="${index}" aria-label="Food-composition match for ${escapeAttr(item.name || `ingredient ${index + 1}`)}"><option value="">No database match</option>${choices.map(candidate => `<option value="${escapeAttr(String(candidate.fdcId || ''))}"${Number(candidate.fdcId) === selectedId ? ' selected' : ''}>${escapeHTML(candidate.description || 'USDA food')}</option>`).join('')}</select><small>${escapeHTML(status)}</small></label>`;
}

export function renderEditableComponents(components) {
  const area = document.getElementById('nutrition-components');
  if (!area) return;
  const rows = (Array.isArray(components) ? components : []);
  area.innerHTML = `<div class="nutrition-components-head"><div><strong>Ingredients and portions</strong><span>Changing grams updates linked nutrients.</span></div><button type="button" class="nutrition-text-btn" ${actionAttrs('add-component')}>+ Add ingredient</button></div>${rows.length ? `<div class="nutrition-component-editor"><div class="nutrition-component-columns" aria-hidden="true"><span>Ingredient</span><span>Amount</span><span>Check</span><span></span></div>${rows.map((item, index) => {
    const review = componentReviewRead(item);
    return `<div class="nutrition-component-row" data-component-index="${index}"><label class="nutrition-component-ingredient"><span class="sr-only">Ingredient ${index + 1}</span><input data-nutrition-component-name="${index}" value="${escapeAttr(item.name || '')}" maxlength="120" placeholder="Ingredient"></label><label class="nutrition-component-quantity"><span class="sr-only">Amount for ingredient ${index + 1}</span><span class="nutrition-component-amount"><input data-nutrition-component-grams="${index}" type="number" inputmode="decimal" min="0" step="1" value="${item.quantityG == null ? '' : escapeAttr(String(item.quantityG))}" aria-label="Amount in grams"><small>g</small></span></label><span class="nutrition-component-confidence"><strong>${escapeHTML(review.identity)}</strong><small>${escapeHTML(review.portion)}</small></span><button type="button" class="nutrition-icon-btn" aria-label="Remove ${escapeAttr(item.name || 'ingredient')}" ${actionAttrs('remove-component', { index })}>×</button>${foodCompositionControl(item, index)}</div>`;
  }).join('')}</div>` : '<div class="nutrition-empty nutrition-empty-inline">No ingredients yet. Add one or enter nutrient totals.</div>'}`;
}

function clearPartialNutrientValue(input, key, clearValue = true) {
  if (input?.dataset?.nutritionPartial !== 'true') return;
  if (clearValue) input.value = '';
  delete input.dataset.nutritionPartial;
  input.classList.remove('is-partial-food-value');
  input.removeAttribute('title');
  const marker = document.getElementById(`nutrition-${key}-source`);
  if (marker) {
    marker.textContent = '';
    marker.hidden = true;
  }
}

function renderPartialFoodCompositionValues(result) {
  const components = Array.isArray(result?.analysis?.components) ? result.analysis.components : [];
  const matched = components.filter(component => component?.foodData?.fdcId);
  const partial = matched.length > 0 && matched.length < components.length
    ? sumComponentNutrients(matched).nutrients
    : {};
  for (const [key] of ALL_REVIEW_FIELDS) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(`nutrition-${key}`));
    if (!input) continue;
    const marker = document.getElementById(`nutrition-${key}-source`);
    const hasWholeMealValue = hasFiniteNumber(result?.analysis?.nutrients?.[key]);
    const hasPartialValue = !hasWholeMealValue && hasFiniteNumber(partial?.[key]);
    if (!hasPartialValue) {
      clearPartialNutrientValue(input, key, !hasWholeMealValue);
      continue;
    }
    input.value = String(partial[key]);
    input.dataset.nutritionPartial = 'true';
    input.classList.add('is-partial-food-value');
    input.title = 'Partial value from matched ingredients only; not saved as a whole-meal total.';
    if (marker) {
      marker.textContent = ' · matched foods only';
      marker.hidden = false;
    }
  }
}

export function renderFoodCompositionSummary(result) {
  const area = document.getElementById('nutrition-food-composition-summary');
  if (!area) return;
  renderPartialFoodCompositionValues(result);
  const sourceKind = result?.source?.kind;
  const composition = result?.source?.foodComposition;
  if (sourceKind === 'ai-photo-estimate' && composition) {
    const matched = Number(composition.matchedComponents || 0);
    const total = Number(composition.totalComponents || 0);
    const micronutrients = Array.isArray(composition.completeMicronutrientKeys) ? composition.completeMicronutrientKeys.length : 0;
    area.textContent = matched
      ? `${matched}/${total} matched to ${composition.dataset || 'FNDDS 2021-2023'}. ${micronutrients ? `${micronutrients} whole-meal micronutrients calculated.` : `Partial values show matched ingredients only; match ${Math.max(0, total - matched)} more for whole-meal totals.`}`
      : 'No complete food-data match. Photo macros remain; unknown values stay blank.';
    return;
  }
  if (sourceKind === 'ai-photo-estimate') {
    area.textContent = 'Food-composition data unavailable. Photo macros remain; unknown values stay blank.';
    return;
  }
  if (sourceKind === 'ai-label-scan') {
    area.textContent = 'Label values are transcribed; unprinted nutrients remain unknown.';
    return;
  }
  if (sourceKind === 'barcode-database') {
    area.textContent = 'Product-record values can be incomplete.';
    return;
  }
  area.textContent = 'Unknown values stay blank. Enter only values you know or can verify.';
}

export async function updateFoodCompositionMatch(index, fdcId) {
  const result = reviewDeps.getPendingAnalysis();
  if (!result || result.source?.kind !== 'ai-photo-estimate') return;
  try {
    await reviewFoodCompositionCandidate(result, index, fdcId);
    result.analysis.nutrients = { ...result.analysis.nutrients, ...reviewDeps.getExplicitNutrients() };
    for (const [key] of ALL_REVIEW_FIELDS) {
      const input = /** @type {HTMLInputElement | null} */ (document.getElementById(`nutrition-${key}`));
      if (input) input.value = hasFiniteNumber(result.analysis.nutrients?.[key]) ? String(result.analysis.nutrients[key]) : '';
    }
    renderFuelOverlapPreview(result.analysis.nutrients);
    renderEditableComponents(result.analysis.components);
    renderReviewEvidence(result);
    renderFoodCompositionSummary(result);
    const composition = result.source?.foodComposition;
    const remaining = Math.max(0, Number(composition?.totalComponents || 0) - Number(composition?.matchedComponents || 0));
    setStatus(fdcId
      ? remaining
        ? `Food match confirmed. Partial values shown; match ${remaining} more ingredient${remaining === 1 ? '' : 's'} for whole-meal micronutrients.`
        : 'Food match confirmed. Whole-meal nutrients recalculated.'
      : 'Food match removed. Unsupported micronutrients are unknown.', 'success');
    updateCorrectionState();
  } catch (error) {
    setStatus(getErrorMessage(error, 'The food-composition match could not be updated.'), 'error');
  }
}

export function renderReviewEvidence(result) {
  const area = document.getElementById('nutrition-review-evidence');
  if (!area) return;
  const sourceKind = result?.source?.kind;
  const source = sourceKind === 'barcode-database' ? 'Database values'
    : sourceKind === 'ai-label-scan' ? 'Printed label'
    : sourceKind === 'ai-photo-estimate' ? 'Photo estimate'
    : sourceKind === 'reused-meal' ? 'Reviewed meal copy' : 'Manual values';
  const components = result?.analysis?.components || [];
  const knownWeights = components.filter(item => hasFiniteNumber(item.quantityG)).length;
  const linked = components.filter(item => Object.keys(item.nutrientsPer100g || {}).length).length;
  const parts = [`${source}`, `${knownWeights}/${components.length || 0} portions quantified`];
  if (linked) parts.push(`${linked}/${components.length} linked to component nutrients`);
  const composition = result?.source?.foodComposition;
  if (sourceKind === 'ai-photo-estimate' && composition?.matchedComponents) {
    parts.push(`${composition.matchedComponents}/${composition.totalComponents || components.length} matched to ${composition.dataset || 'food composition data'}`);
  }
  if (sourceKind === 'ai-photo-estimate') {
    parts.push('Uncalibrated identity self-check; verify foods');
  }
  const usage = nutritionUsageSummary(result?.source);
  const model = result?.source?.modelDisplay || result?.source?.model || 'Selected model';
  const usageLine = sourceKind === 'ai-photo-estimate' || sourceKind === 'ai-label-scan'
    ? usage
      ? `${model} · ${usage.costLabel} · ${usage.totalTokens.toLocaleString()} tokens (${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out)`
      : `${model} · provider did not report token usage`
    : '';
  area.hidden = false;
  area.innerHTML = `<strong>${escapeHTML(sourceKind === 'ai-photo-estimate' ? 'Photo estimate' : 'Nutrition source')}</strong><span>${escapeHTML(parts.join(' · '))}</span>${usageLine ? `<span class="nutrition-analysis-usage">${escapeHTML(usageLine)}</span>` : ''}`;
}

function renderReviewChecks(result) {
  const area = document.getElementById('nutrition-review-checks');
  if (!area) return;
  const imageWarnings = (result?.images || (result?.image ? [result.image] : [])).flatMap(image => image?.qualityWarnings || []);
  const assumptions = [...new Set(result?.analysis?.assumptions || [])];
  const warnings = [...new Set([...(result?.analysis?.warnings || []), ...imageWarnings])];
  if (!assumptions.length && !warnings.length) {
    area.hidden = true;
    area.innerHTML = '';
    return;
  }
  area.hidden = false;
  area.innerHTML = `<div class="nutrition-review-checks-head"><strong>Assumptions and uncertainties</strong></div>${assumptions.length ? `<div><small>Model assumed</small><ul>${assumptions.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>` : ''}${warnings.length ? `<div><small>Still uncertain</small><ul>${warnings.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>` : ''}`;
}

export function applyAnalysis(result, { quiet = false } = {}) {
  result.analysis.components = (result.analysis.components || []).map(normalizeNutritionComponent);
  componentPortionBaseline = result.analysis.components.map(item => hasFiniteNumber(item?.quantityG) ? Number(item.quantityG) : null);
  let analyzedKind = result.source?.analysisKind || (result.source?.kind === 'ai-label-scan' ? 'nutrition-label' : 'meal-photo');
  if (result.source?.kind === 'barcode-database') analyzedKind = 'nutrition-label';
  reviewDeps.applyResultState(result, {
    mealName: result.analysis.mealName,
    kind: analyzedKind,
    consumption: consumptionKey(analyzedKind),
    context: normalizeKnownDetails(currentKnownDetails()),
  });
  const name = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-meal-name'));
  if (name) name.value = result.analysis.mealName;
  for (const [key] of ALL_REVIEW_FIELDS) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(`nutrition-${key}`));
    if (input) input.value = '';
    setInputValue(`nutrition-${key}`, result.analysis.nutrients?.[key]);
  }
  renderFuelOverlapPreview(result.analysis.nutrients);
  renderEditableComponents(result.analysis.components);
  renderReviewEvidence(result);
  renderFoodCompositionSummary(result);
  renderReviewChecks(result);
  const labelDetails = document.getElementById('nutrition-label-details');
  if (labelDetails) {
    const label = result.analysis.label;
    const details = label ? [
      label.servingSizeText && `Serving size ${label.servingSizeText}`,
      hasFiniteNumber(label.servingsPerContainer) && `${formatNumber(label.servingsPerContainer)} servings per container`,
      hasFiniteNumber(label.consumedAmount) && `Logged ${formatNumber(label.consumedAmount)} ${label.consumedUnit || 'servings'}`,
      label.labelBasis && `Label basis: ${label.labelBasis}`,
    ].filter(Boolean) : [];
    labelDetails.hidden = !details.length;
    labelDetails.textContent = details.join(' · ');
  }
  const imageWarnings = (result.images || (result.image ? [result.image] : [])).flatMap(image => image?.qualityWarnings || []);
  const warningCount = result.analysis.warnings.length + imageWarnings.length;
  const corrected = !!result.source?.correction;
  const scannedLabel = result.source?.kind === 'ai-label-scan';
  if (!quiet) setStatus(warningCount
    ? `${corrected ? 'Recalculated estimate' : scannedLabel ? 'Label scan ready' : 'Estimate ready'} · ${warningCount} uncertainty note${warningCount === 1 ? '' : 's'} included in the saved record.`
    : `${corrected ? 'Recalculated from your correction' : scannedLabel ? 'Label scan ready' : 'Estimate ready'}. Review the values, then save.`, 'success');
  updateCorrectionState();
}
