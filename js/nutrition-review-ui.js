// @ts-check
// nutrition-review-ui.js — editor review state, validation, and progress UI.

import { getMealAnalysisAvailability, nutritionUsageSummary } from './nutrition-analysis.js';
import { normalizeNutritionComponent } from './nutrition-food-data.js';
import { calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { isNutritionComparisonRunning } from './nutrition-comparison-ui.js';
import {
  ALL_REVIEW_FIELDS, MEAL_TYPES, actionAttrs, formatNumber, hasFiniteNumber, renderFuelOverlapCard,
} from './nutrition-render.js';
import { escapeAttr, escapeHTML } from './utils.js';

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
  const cancel = state === 'running'
    ? `<button type="button" class="nutrition-analysis-cancel" ${actionAttrs('cancel-analysis')}>Cancel analysis</button>`
    : '';
  area.innerHTML = `<div class="nutrition-analysis-progress-head"><strong>${escapeHTML(label)}</strong><span>${state === 'running' ? `Step ${Math.max(1, phase)} of 4 · ${analysisElapsed(startedAt)}${slowHint}` : state === 'success' ? 'Complete' : 'Stopped'}</span>${cancel}</div><div class="nutrition-analysis-progress-track" role="progressbar" aria-label="Meal photo analysis progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`;
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
  if (recalculate) recalculate.textContent = 'Recalculate estimate';
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
  document.getElementById('detail-modal')?.classList.remove('nutrition-manual-mode');
  document.querySelectorAll('.nutrition-capture-tabs button').forEach(button => {
    const selected = button.getAttribute('data-nutrition-kind') === reviewDeps.getAnalysisKind();
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-selected', String(selected));
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
    ? 'Sent only when you choose Scan label. Full-size originals are not saved; resized copies stay with the meal. First cloud use asks for approval.'
    : 'Sent only when you choose Analyze photo. Full-size originals are not saved; resized copies stay with the meal. First cloud use asks for approval.';
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

function historicalFoodComposition(item) {
  if (!item?.foodData?.fdcId) return '';
  return `<div class="nutrition-component-food-data is-readonly"><span>Historical source</span><strong>${escapeHTML(item.foodData?.description || 'Saved food-composition record')}</strong><small>${escapeHTML(item.foodData?.dataset || 'Legacy database match')} · retained from the saved meal</small></div>`;
}

export function renderEditableComponents(components) {
  const area = document.getElementById('nutrition-components');
  if (!area) return;
  const rows = (Array.isArray(components) ? components : []);
  area.innerHTML = `<div class="nutrition-components-head"><div><strong>Ingredients and portions</strong><span>Changing grams updates linked nutrients.</span></div><button type="button" class="nutrition-text-btn" ${actionAttrs('add-component')}>+ Add ingredient</button></div>${rows.length ? `<div class="nutrition-component-editor"><div class="nutrition-component-columns" aria-hidden="true"><span>Ingredient</span><span>Amount</span><span>Check</span><span></span></div>${rows.map((item, index) => {
    const review = componentReviewRead(item);
    return `<div class="nutrition-component-row" data-component-index="${index}"><label class="nutrition-component-ingredient"><span class="sr-only">Ingredient ${index + 1}</span><input data-nutrition-component-name="${index}" value="${escapeAttr(item.name || '')}" maxlength="120" placeholder="Ingredient"></label><label class="nutrition-component-quantity"><span class="sr-only">Amount for ingredient ${index + 1}</span><span class="nutrition-component-amount"><input data-nutrition-component-grams="${index}" type="number" inputmode="decimal" min="0" step="1" value="${item.quantityG == null ? '' : escapeAttr(String(item.quantityG))}" aria-label="Amount in grams"><small>g</small></span></label><span class="nutrition-component-confidence"><strong>${escapeHTML(review.identity)}</strong><small>${escapeHTML(review.portion)}</small></span><button type="button" class="nutrition-icon-btn" aria-label="Remove ${escapeAttr(item.name || 'ingredient')}" ${actionAttrs('remove-component', { index })}>×</button>${historicalFoodComposition(item)}</div>`;
  }).join('')}</div>` : '<div class="nutrition-empty nutrition-empty-inline">No ingredients yet. Add one or enter nutrient totals.</div>'}`;
}

function setNutrientSource(input, key, label = '', title = '') {
  const marker = document.getElementById(`nutrition-${key}-source`);
  if (marker) {
    marker.textContent = label ? ` · ${label}` : '';
    marker.hidden = !label;
  }
  if (title) input.title = title;
  else input.removeAttribute('title');
}

function renderNutrientSources(result) {
  const aiEstimated = new Set(Array.isArray(result?.source?.aiNutritionEstimate?.nutrientKeys)
    ? result.source.aiNutritionEstimate.nutrientKeys : []);
  const legacyDatabase = new Set(Array.isArray(result?.source?.foodComposition?.completeNutrientKeys)
    ? result.source.foodComposition.completeNutrientKeys : []);
  const userReviewed = new Set(Array.isArray(result?.source?.review?.editedNutrients)
    ? result.source.review.editedNutrients : []);
  for (const [key] of ALL_REVIEW_FIELDS) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(`nutrition-${key}`));
    if (!input) continue;
    delete input.dataset.nutritionPartial;
    input.classList.remove('is-partial-food-value');
    const hasWholeMealValue = hasFiniteNumber(result?.analysis?.nutrients?.[key]);
    setNutrientSource(input, key,
      hasWholeMealValue && userReviewed.has(key) ? 'user reviewed'
        : hasWholeMealValue && aiEstimated.has(key) ? 'AI estimate'
        : hasWholeMealValue && legacyDatabase.has(key) ? 'historical database' : '',
      hasWholeMealValue && userReviewed.has(key)
        ? 'Reviewed or changed by the user.'
        : hasWholeMealValue && aiEstimated.has(key)
          ? 'Estimated by the selected AI model from food identity, preparation, and portion.'
          : hasWholeMealValue && legacyDatabase.has(key)
            ? 'Retained from a database-enriched meal saved by an older version.' : '');
  }
}

export function renderNutrientEstimateSummary(result) {
  const area = document.getElementById('nutrition-nutrient-estimate-summary');
  if (!area) return;
  renderNutrientSources(result);
  const sourceKind = result?.source?.kind;
  if (sourceKind === 'ai-photo-estimate') {
    const estimated = Array.isArray(result?.source?.aiNutritionEstimate?.nutrientKeys)
      ? result.source.aiNutritionEstimate.nutrientKeys.length : 0;
    const model = result?.source?.modelDisplay || result?.source?.model || 'the selected model';
    area.textContent = estimated
      ? `${estimated} nutrient values estimated by ${model}. Review or clear uncertain values; unknown values stay blank.`
      : Number(result?.source?.foodComposition?.matchedComponents || 0) > 0
        ? 'This older saved meal retains historical database-derived values. New photo analyses use AI estimates only.'
        : 'The selected model did not return detailed nutrient estimates; unknown values stay blank.';
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
    parts.push(`historical database provenance retained for ${composition.matchedComponents}/${composition.totalComponents || components.length} ingredients`);
  }
  if (sourceKind === 'ai-photo-estimate') {
    const aiNutrientCount = Array.isArray(result?.source?.aiNutritionEstimate?.nutrientKeys)
      ? result.source.aiNutritionEstimate.nutrientKeys.length : 0;
    if (aiNutrientCount) parts.push(`${aiNutrientCount} model-estimated nutrients`);
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
  const analyzedKind = result.source?.analysisKind || (result.source?.kind === 'ai-label-scan' ? 'nutrition-label' : 'meal-photo');
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
  renderNutrientEstimateSummary(result);
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
