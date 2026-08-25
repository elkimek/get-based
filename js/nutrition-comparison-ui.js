// @ts-check
// nutrition-comparison-ui.js — debug model comparison workflow and result UI.

import { analyzeMealPhoto, mealImagesFromPreparedPhotos, nutritionUsageSummary, prepareMealPhotos } from './nutrition-analysis.js';
import { enrichFreshPhotoAnalysis } from './nutrition-food-composition-state.js';
import { hydrateNutritionLocalAICatalog, listNutritionVisionModels } from './nutrition-ai-settings.js';
import { parseReferenceIngredients, rankMealComparisonRuns } from './nutrition-comparison.js';
import { actionAttrs, formatNumber, hasFiniteNumber, renderComparisonModelPicker } from './nutrition-render.js';
import { escapeHTML, isDebugMode, showNotification } from './utils.js';
import { getErrorMessage } from './caught-error.js';
import { getLocalNutritionComparison, setLocalNutritionComparison } from './nutrition-store.js';
import { state } from './state.js';

let comparisonRunning = false;
let comparisonRuns = [];
let comparisonSharedImages = [];
let comparisonPreparedPhotos = [];
let comparisonRunContext = null;
let comparisonReferenceRunIndex = null;
let comparisonManualReference = {};
let comparisonSavedAt = '';
let comparisonIsRestored = false;
let comparisonPersistenceTimer = 0;
let comparisonProfileId = '';
let comparisonPersistenceDirty = false;
let comparisonPersistenceRevision = 0;
/** @type {any} */
let comparisonDeps = {
  analysisFiles: async () => [],
  hasPhotos: () => false,
  startRequest: () => new AbortController(),
  isRequestActive: () => false,
  finishRequest: () => {},
  updateCorrectionState: () => {},
  getConsumption: () => ({ amount: 1, unit: 'servings' }),
  getUserContext: () => '',
  getAnalysisKind: () => 'meal-photo',
  applyAnalysis: () => {},
  setStatus: () => {},
};

export function configureNutritionComparisonUI(deps = {}) {
  comparisonDeps = { ...comparisonDeps, ...deps };
}

export function resetNutritionComparison() {
  if (comparisonRuns.length && comparisonProfileId && comparisonPersistenceDirty) void persistComparisonSnapshot(comparisonSnapshot(), comparisonProfileId, comparisonPersistenceRevision);
  if (comparisonPersistenceTimer) clearTimeout(comparisonPersistenceTimer);
  comparisonPersistenceTimer = 0;
  comparisonRunning = false;
  comparisonRuns = [];
  comparisonSharedImages = [];
  comparisonPreparedPhotos = [];
  comparisonRunContext = null;
  comparisonReferenceRunIndex = null;
  comparisonManualReference = {};
  comparisonSavedAt = '';
  comparisonIsRestored = false;
  comparisonProfileId = '';
  comparisonPersistenceDirty = false;
  comparisonPersistenceRevision = 0;
}

export function isNutritionComparisonRunning() {
  return comparisonRunning;
}

export function refreshComparisonModelPicker() {
  const current = document.querySelector('.nutrition-comparison-model-picker');
  if (!current || comparisonRunning) return;
  const wasCheckingLocal = current.textContent?.includes('checking Local AI') === true;
  const checkedValues = new Set(Array.from(current.querySelectorAll('[data-nutrition-comparison-model]:checked'))
    .map(input => /** @type {HTMLInputElement} */ (input).value));
  current.outerHTML = renderComparisonModelPicker();
  if (!wasCheckingLocal && checkedValues.size) {
    document.querySelectorAll('[data-nutrition-comparison-model]').forEach(input => {
      /** @type {HTMLInputElement} */ (input).checked = checkedValues.has(/** @type {HTMLInputElement} */ (input).value);
    });
  }
  updateComparisonControls();
}

export function hasNutritionComparisonRuns() {
  return comparisonRuns.length > 0 && !comparisonIsRestored;
}

export function useManualComparisonReference() {
  comparisonReferenceRunIndex = null;
  comparisonManualReference = readManualComparisonReference();
  renderComparisonResults();
  scheduleComparisonPersistence();
}

function selectedComparisonModels() {
  const catalog = new Map(listNutritionVisionModels().map(model => [model.value, model]));
  return Array.from(document.querySelectorAll('[data-nutrition-comparison-model]:checked'))
    .flatMap(input => {
      const model = catalog.get(/** @type {HTMLInputElement} */ (input).value);
      return model ? [model] : [];
    })
    .slice(0, 4);
}

function comparisonRouteKey(provider, model) {
  return JSON.stringify({ provider: String(provider || ''), model: String(model || '') });
}

function existingComparisonRouteKeys() {
  return new Set(comparisonRuns.map(run => comparisonRouteKey(run?.route?.provider, run?.route?.model)));
}

function readManualComparisonReference() {
  const reference = {};
  const inputs = document.querySelectorAll('[data-nutrition-reference]');
  inputs.forEach(input => {
    const key = input.getAttribute('data-nutrition-reference') || '';
    if (!key || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    if (key === 'ingredients') reference.ingredients = parseReferenceIngredients(input.value);
    else if (key === 'mealName') reference.mealName = input.value;
    else reference[key] = input.value;
  });
  return reference;
}

function manualComparisonReference() {
  const inputs = document.querySelectorAll('[data-nutrition-reference]');
  return inputs.length ? readManualComparisonReference() : comparisonManualReference;
}

function comparisonSnapshot() {
  const runs = comparisonRuns.slice(0, 4).map(run => ({
    route: { provider: String(run?.route?.provider || ''), model: String(run?.route?.model || '') },
    providerLabel: String(run?.providerLabel || '').slice(0, 120),
    modelLabel: String(run?.modelLabel || '').slice(0, 160),
    status: run?.result ? 'complete' : 'error',
    result: run?.result ? { ...run.result, image: null, images: [] } : null,
    error: String(run?.error || '').slice(0, 1000),
    durationMs: Math.max(0, Number(run?.durationMs) || 0),
  }));
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    runs,
    manualReference: manualComparisonReference(),
    referenceRunIndex: Number.isInteger(comparisonReferenceRunIndex) ? comparisonReferenceRunIndex : null,
    runContext: comparisonRunContext ? { ...comparisonRunContext } : null,
  };
}

function updateComparisonHistoryBanner() {
  const banner = document.getElementById('nutrition-comparison-history');
  if (!banner) return;
  banner.hidden = !comparisonRuns.length;
  if (!comparisonRuns.length) {
    banner.innerHTML = '';
    return;
  }
  const date = new Date(comparisonSavedAt);
  const savedLabel = Number.isFinite(date.getTime())
    ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'recently';
  banner.innerHTML = `<span><strong>${comparisonIsRestored ? 'Last comparison restored' : 'Comparison saved'}</strong> · ${escapeHTML(savedLabel)} · encrypted locally · outside AI context.</span><button type="button" class="nutrition-text-btn" ${actionAttrs('clear-comparison-history')}>Clear</button>`;
}

async function persistComparisonSnapshot(snapshot, profileId = comparisonProfileId || state.currentProfile, revision = comparisonPersistenceRevision) {
  if (!snapshot?.runs?.length) return;
  try {
    await setLocalNutritionComparison(profileId, snapshot);
    if (profileId !== state.currentProfile || (comparisonProfileId && profileId !== comparisonProfileId)) return;
    comparisonSavedAt = snapshot.savedAt;
    if (revision === comparisonPersistenceRevision) comparisonPersistenceDirty = false;
    updateComparisonHistoryBanner();
  } catch (error) {
    showNotification(getErrorMessage(error, 'The last comparison could not be saved on this device.'), 'error');
  }
}

function scheduleComparisonPersistence() {
  if (!comparisonRuns.length) return;
  comparisonPersistenceDirty = true;
  comparisonPersistenceRevision += 1;
  if (comparisonPersistenceTimer) clearTimeout(comparisonPersistenceTimer);
  comparisonPersistenceTimer = setTimeout(() => {
    comparisonPersistenceTimer = 0;
    void persistComparisonSnapshot(comparisonSnapshot(), comparisonProfileId || state.currentProfile, comparisonPersistenceRevision);
  }, 180);
}

function populateManualComparisonReference(reference) {
  document.querySelectorAll('[data-nutrition-reference]').forEach(input => {
    const key = input.getAttribute('data-nutrition-reference') || '';
    if (!key || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    const value = key === 'ingredients' && Array.isArray(reference?.ingredients)
      ? reference.ingredients.join('\n')
      : reference?.[key];
    input.value = value === null || value === undefined ? '' : String(value);
  });
}

export async function restoreNutritionComparison() {
  if (!isDebugMode()) return false;
  const profileId = state.currentProfile;
  let snapshot;
  try { snapshot = await getLocalNutritionComparison(profileId); }
  catch { return false; }
  if (profileId !== state.currentProfile) return false;
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.runs) || !snapshot.runs.length) return false;
  comparisonRuns = snapshot.runs.slice(0, 4).flatMap(run => {
    const provider = String(run?.route?.provider || '');
    const model = String(run?.route?.model || '');
    if (!provider || !model || (run?.result && !run.result?.analysis)) return [];
    return [{
      route: { provider, model },
      providerLabel: String(run?.providerLabel || provider).slice(0, 120),
      modelLabel: String(run?.modelLabel || model).slice(0, 160),
      status: run?.result ? 'complete' : 'error',
      result: run?.result ? { ...run.result, image: null, images: [] } : null,
      error: String(run?.error || '').slice(0, 1000),
      durationMs: Math.max(0, Number(run?.durationMs) || 0),
    }];
  });
  if (!comparisonRuns.length) return false;
  comparisonManualReference = snapshot.manualReference && typeof snapshot.manualReference === 'object'
    ? snapshot.manualReference
    : {};
  comparisonRunContext = snapshot.runContext && typeof snapshot.runContext === 'object' ? snapshot.runContext : null;
  comparisonReferenceRunIndex = Number.isInteger(snapshot.referenceRunIndex)
    && snapshot.referenceRunIndex >= 0 && snapshot.referenceRunIndex < comparisonRuns.length
    ? snapshot.referenceRunIndex
    : null;
  comparisonSavedAt = String(snapshot.savedAt || '');
  comparisonIsRestored = true;
  comparisonProfileId = profileId;
  comparisonPersistenceDirty = false;
  comparisonPersistenceRevision = 0;
  populateManualComparisonReference(comparisonManualReference);
  renderComparisonResults();
  updateComparisonControls();
  updateComparisonHistoryBanner();
  return true;
}

export async function clearSavedNutritionComparison() {
  if (comparisonPersistenceTimer) clearTimeout(comparisonPersistenceTimer);
  comparisonPersistenceTimer = 0;
  const profileId = comparisonProfileId || state.currentProfile;
  await setLocalNutritionComparison(profileId, null);
  comparisonRuns = [];
  comparisonSharedImages = [];
  comparisonPreparedPhotos = [];
  comparisonRunContext = null;
  comparisonReferenceRunIndex = null;
  comparisonManualReference = {};
  comparisonSavedAt = '';
  comparisonIsRestored = false;
  comparisonProfileId = '';
  comparisonPersistenceDirty = false;
  comparisonPersistenceRevision = 0;
  populateManualComparisonReference({});
  renderComparisonResults();
  updateComparisonControls();
  updateComparisonHistoryBanner();
  showNotification('Saved meal comparison cleared.', 'info');
}

function comparisonReferenceFromAnalysis(analysis) {
  return {
    mealName: analysis?.mealName || '',
    ingredients: (analysis?.components || []).map(item => item?.name).filter(Boolean),
    totalWeightG: comparisonTotalWeight(analysis),
    energyKcal: analysis?.nutrients?.energyKcal,
    proteinG: analysis?.nutrients?.proteinG,
    carbohydrateG: analysis?.nutrients?.carbohydrateG,
    fatG: analysis?.nutrients?.fatG,
  };
}

function selectedComparisonReferenceRun() {
  if (!Number.isInteger(comparisonReferenceRunIndex)) return null;
  const run = comparisonRuns[comparisonReferenceRunIndex];
  return run?.result?.analysis ? run : null;
}

function currentComparisonReference() {
  const selected = selectedComparisonReferenceRun();
  return selected ? comparisonReferenceFromAnalysis(selected.result.analysis) : manualComparisonReference();
}

function comparisonTotalWeight(analysis) {
  const quantities = (analysis?.components || []).map(item => Number(item?.quantityG)).filter(Number.isFinite);
  return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null;
}

function relativeDifference(value, reference) {
  if (!hasFiniteNumber(value) || !hasFiniteNumber(reference)) return null;
  const numericValue = Number(value);
  const numericReference = Number(reference);
  if (numericReference === 0) return numericValue === 0 ? 0 : null;
  return (numericValue - numericReference) / Math.abs(numericReference) * 100;
}

function renderComparisonMetric(label, value, unit, digits = 0, reference = null, isReference = false) {
  const difference = relativeDifference(value, reference);
  const relative = isReference && hasFiniteNumber(value)
    ? '<small class="is-reference">Reference</small>'
    : difference === null
      ? ''
      : Math.abs(difference) < 0.05
        ? '<small class="is-close">Same</small>'
        : `<small class="${Math.abs(difference) <= 10 ? 'is-close' : Math.abs(difference) >= 30 ? 'is-far' : ''}">${difference > 0 ? '+' : '−'}${formatNumber(Math.abs(difference), 1)}%</small>`;
  return `<div><span>${escapeHTML(label)}</span><strong>${hasFiniteNumber(value) ? `${formatNumber(value, digits)} ${escapeHTML(unit)}` : '—'}</strong>${relative}</div>`;
}

function renderReferenceDifference(metric) {
  const difference = metric.predicted == null ? null : relativeDifference(metric.predicted, metric.expected);
  const differenceLabel = difference == null
    ? 'Missing estimate'
    : Math.abs(difference) < 0.05
      ? 'Same'
      : `${difference > 0 ? '+' : '−'}${formatNumber(Math.abs(difference), 1)}%`;
  const differenceTone = difference == null
    ? ' is-missing'
    : Math.abs(difference) <= 10
      ? ' is-close'
      : Math.abs(difference) >= 30
        ? ' is-far'
        : '';
  return `<tr><th scope="row">${escapeHTML(metric.label)}</th><td>${metric.predicted == null ? 'Missing' : `${formatNumber(metric.predicted, 1)} ${escapeHTML(metric.unit)}`}</td><td>${formatNumber(metric.expected, 1)} ${escapeHTML(metric.unit)}</td><td class="nutrition-comparison-difference${differenceTone}">${escapeHTML(differenceLabel)}</td></tr>`;
}

function renderComparisonResults() {
  const area = document.getElementById('nutrition-comparison-results');
  if (!area) return;
  if (!comparisonRuns.length) {
    area.innerHTML = '';
    return;
  }
  const reference = currentComparisonReference();
  const referenceRun = selectedComparisonReferenceRun();
  const ranked = rankMealComparisonRuns(comparisonRuns, reference, { excludedIndex: comparisonReferenceRunIndex });
  const hasManualReference = !referenceRun && ranked.some(run => run.evaluation?.hasReference);
  const referenceBanner = referenceRun
    ? `<div class="nutrition-comparison-reference-banner"><span>Comparing against <strong>${escapeHTML(referenceRun.modelLabel)}</strong>. A model baseline is not ground truth.</span><button type="button" class="nutrition-text-btn" ${actionAttrs('clear-comparison-reference')}>Use known values</button></div>`
    : hasManualReference
      ? '<div class="nutrition-comparison-reference-banner is-manual"><span><strong>Known values active.</strong> Ranking depends on the values entered.</span></div>'
      : '<div class="nutrition-comparison-reference-banner is-empty"><span>Add known values above to rank results.</span></div>';
  area.innerHTML = referenceBanner + ranked.map(run => {
    if (run.status === 'running') {
      return `<article class="nutrition-comparison-card is-running"><div class="nutrition-comparison-card-head"><div><span>${escapeHTML(run.providerLabel)}</span><strong>${escapeHTML(run.modelLabel)}</strong></div><span class="nutrition-comparison-state">Running…</span></div><div class="nutrition-comparison-skeleton" aria-hidden="true"></div></article>`;
    }
    if (!run.result) {
      const retry = comparisonIsRestored
        ? '<span>Choose a photo and run a new comparison to retry.</span>'
        : `<button type="button" class="import-btn import-btn-secondary" ${actionAttrs('retry-comparison', { index: run.originalIndex })}>Retry this model</button>`;
      return `<article class="nutrition-comparison-card is-error"><div class="nutrition-comparison-card-head"><div><span>${escapeHTML(run.providerLabel)}</span><strong>${escapeHTML(run.modelLabel)}</strong></div><span class="nutrition-comparison-state">Could not finish</span></div><div class="nutrition-comparison-usage is-unavailable"><strong>Cost unknown</strong><span>The provider returned no token count. This request may still be billable.</span></div><p>${escapeHTML(run.error || 'No usable estimate returned.')}</p><div class="nutrition-comparison-card-actions">${retry}</div></article>`;
    }
    const analysis = run.result.analysis;
    const isReference = run.originalIndex === comparisonReferenceRunIndex;
    const score = run.evaluation?.score;
    const usage = nutritionUsageSummary(run.result.source);
    const usageLine = usage
      ? `<div class="nutrition-comparison-usage"><strong>${escapeHTML(usage.costLabel)}</strong><span>${usage.totalTokens.toLocaleString()} tokens · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out</span></div>`
      : '<div class="nutrition-comparison-usage is-unavailable"><strong>Cost unknown</strong><span>This provider did not return token counts; do not assume the request was free.</span></div>';
    const ingredients = (analysis.components || []).slice(0, 6).map(item => `${item.name}${hasFiniteNumber(item.quantityG) ? ` · ${formatNumber(item.quantityG, 0)} g` : ''}`);
    const ranking = isReference
      ? '<div class="nutrition-comparison-score is-reference"><strong>Baseline</strong><span>Selected model</span></div>'
      : score == null
      ? '<div class="nutrition-comparison-score is-unscored"><strong>Not ranked</strong><span>Add known values</span></div>'
      : `<div class="nutrition-comparison-score${run.rank === 1 ? ' is-best' : ''}"><strong>${formatNumber(score, 1)}</strong><span>${referenceRun ? 'Baseline agreement' : 'Known-value agreement'} / 100</span><small>${run.rank === 1 ? `Closest to ${referenceRun ? 'baseline' : 'known values'}` : `Rank #${run.rank}`}</small></div>`;
    const referenceMetrics = {
      totalWeightG: reference.totalWeightG,
      energyKcal: reference.energyKcal,
      proteinG: reference.proteinG,
      carbohydrateG: reference.carbohydrateG,
      fatG: reference.fatG,
    };
    const breakdown = score == null ? '' : `<details class="nutrition-comparison-breakdown"><summary>Score breakdown</summary><div><span>Nutrition + amount <strong>${formatNumber(run.evaluation?.numericScore, 1)}/100</strong></span><span>Ingredients <strong>${formatNumber(run.evaluation?.identityScore, 1)}/100</strong></span></div></details>`;
    const modelChecks = [...new Set([...(analysis.warnings || []), ...(analysis.assumptions || [])])].slice(0, 8);
    return `<article class="nutrition-comparison-card${run.rank === 1 && !isReference ? ' is-best' : ''}"><div class="nutrition-comparison-card-head"><div><span>${escapeHTML(run.providerLabel)} · ${formatNumber(run.durationMs / 1000, 1)}s</span><strong>${escapeHTML(run.modelLabel)}</strong></div>${ranking}</div>
      ${usageLine}
      <div class="nutrition-comparison-identity"><strong>${escapeHTML(analysis.mealName || 'Meal')}</strong></div>
      ${breakdown}
      <div class="nutrition-comparison-metrics">${renderComparisonMetric('Amount', comparisonTotalWeight(analysis), 'g', 0, referenceMetrics.totalWeightG, isReference)}${renderComparisonMetric('Energy', analysis.nutrients?.energyKcal, 'kcal', 0, referenceMetrics.energyKcal, isReference)}${renderComparisonMetric('Protein', analysis.nutrients?.proteinG, 'g', 1, referenceMetrics.proteinG, isReference)}${renderComparisonMetric('Carbs', analysis.nutrients?.carbohydrateG, 'g', 1, referenceMetrics.carbohydrateG, isReference)}${renderComparisonMetric('Fat', analysis.nutrients?.fatG, 'g', 1, referenceMetrics.fatG, isReference)}</div>
      ${ingredients.length ? `<div class="nutrition-comparison-ingredients">${ingredients.map(item => `<span>${escapeHTML(item)}</span>`).join('')}</div>` : '<p>No ingredients returned.</p>'}
      ${modelChecks.length ? `<details class="nutrition-comparison-checks"><summary>Model checks and assumptions (${modelChecks.length})</summary><ul>${modelChecks.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></details>` : ''}
      ${run.evaluation?.metrics?.length ? `<details class="nutrition-comparison-errors"><summary>${referenceRun ? 'Baseline' : 'Known-value'} differences (${run.evaluation.metrics.length})</summary><div class="nutrition-comparison-error-table-wrap" role="region" aria-label="Comparison differences table" tabindex="0"><table><thead><tr><th scope="col">Metric</th><th scope="col">Estimate</th><th scope="col">${referenceRun ? 'Baseline' : 'Known value'}</th><th scope="col">Difference</th></tr></thead><tbody>${run.evaluation.metrics.map(renderReferenceDifference).join('')}</tbody></table></div></details>` : ''}
      <div class="nutrition-comparison-card-actions">${isReference ? '<span>Model baseline</span>' : `<button type="button" class="nutrition-text-btn" ${actionAttrs('set-comparison-reference', { index: run.originalIndex })}>Use as baseline</button>`}<button type="button" class="import-btn import-btn-secondary" ${actionAttrs('use-comparison', { index: run.originalIndex })}>Use this estimate</button></div>
    </article>`;
  }).join('');
}

export function setComparisonReference(index) {
  const run = comparisonRuns[index];
  if (!run?.result?.analysis) return;
  comparisonReferenceRunIndex = index;
  renderComparisonResults();
  scheduleComparisonPersistence();
}

export function clearComparisonReference() {
  comparisonReferenceRunIndex = null;
  renderComparisonResults();
  scheduleComparisonPersistence();
}

export function updateComparisonControls() {
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('nutrition-run-comparison'));
  if (!button) return;
  const selectedCount = selectedComparisonModels().length;
  const existing = existingComparisonRouteKeys();
  const hasPhotos = comparisonDeps.hasPhotos();
  const limit = document.getElementById('nutrition-comparison-model-limit');
  document.querySelectorAll('[data-nutrition-comparison-model]').forEach(input => {
    const row = input.closest('.nutrition-comparison-model');
    const benchmarked = existing.has(/** @type {HTMLInputElement} */ (input).value);
    row?.classList.toggle('is-benchmarked', benchmarked);
    row?.classList.toggle('is-selected', /** @type {HTMLInputElement} */ (input).checked);
    const note = row?.querySelector('[data-nutrition-benchmarked]');
    if (note instanceof HTMLElement) note.hidden = !benchmarked;
  });
  if (limit) limit.textContent = `${selectedCount} of 4 selected`;
  button.disabled = comparisonRunning || selectedCount < 2 || selectedCount > 4 || !hasPhotos;
  button.textContent = comparisonRunning
    ? 'Comparison running…'
    : selectedCount >= 2
      ? `${comparisonRuns.length ? 'Run new comparison with' : 'Run'} ${selectedCount} models`
      : 'Choose at least 2 models';
}

function setComparisonProgress(index, total, label, state = 'running') {
  const area = document.getElementById('nutrition-comparison-progress');
  if (!area) return;
  const complete = state === 'success' || state === 'partial';
  const percent = complete ? 100 : Math.max(4, Math.min(96, Math.round(((index - 1) + 0.55) / total * 100)));
  area.hidden = false;
  area.className = `nutrition-analysis-progress is-${state}`;
  area.innerHTML = `<div class="nutrition-analysis-progress-head"><strong>${escapeHTML(label)}</strong><span>${state === 'running' ? `Model ${index} of ${total}` : state === 'success' ? `${total} model${total === 1 ? '' : 's'} finished` : state === 'partial' ? 'Retry failed models below' : 'Stopped'}</span></div><div class="nutrition-analysis-progress-track" role="progressbar" aria-label="Meal model comparison progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`;
}

export function toggleModelComparison() {
  if (!isDebugMode()) return;
  const area = document.getElementById('nutrition-model-comparison');
  if (!area) return;
  area.hidden = !area.hidden;
  document.querySelectorAll('[data-nutrition-action="toggle-comparison"]').forEach(button => button.setAttribute('aria-expanded', String(!area.hidden)));
  if (!area.hidden) {
    void hydrateNutritionLocalAICatalog({ includeConfigured: true });
    refreshComparisonModelPicker();
    updateComparisonControls();
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export async function runModelComparison() {
  if (!isDebugMode() || comparisonRunning) return;
  const models = selectedComparisonModels();
  const files = await comparisonDeps.analysisFiles();
  if (models.length < 2 || models.length > 4) {
    showNotification('Choose between two and four vision models.', 'info');
    return;
  }
  if (!files.length) {
    showNotification('Choose a meal or label photo before comparing models.', 'info');
    return;
  }
  comparisonRunning = true;
  comparisonProfileId = state.currentProfile;
  comparisonRuns = [];
  comparisonSharedImages = [];
  comparisonPreparedPhotos = [];
  comparisonRunContext = null;
  comparisonReferenceRunIndex = null;
  comparisonIsRestored = false;
  const comparisonReturn = document.getElementById('nutrition-comparison-return');
  if (comparisonReturn) comparisonReturn.hidden = true;
  const controller = comparisonDeps.startRequest();
  comparisonDeps.updateCorrectionState();
  updateComparisonControls();
  try {
    setComparisonProgress(1, models.length, 'Preparing one shared photo set…');
    const preparedPhotos = comparisonPreparedPhotos.length ? comparisonPreparedPhotos : await prepareMealPhotos(files);
    if (controller.signal.aborted || !comparisonDeps.isRequestActive(controller)) return;
    if (!comparisonPreparedPhotos.length) comparisonPreparedPhotos = preparedPhotos;
    if (!comparisonSharedImages.length) comparisonSharedImages = mealImagesFromPreparedPhotos(preparedPhotos);
    if (!comparisonRunContext) {
      const consumption = comparisonDeps.getConsumption();
      comparisonRunContext = {
        analysisKind: comparisonDeps.getAnalysisKind(),
        consumedAmount: consumption.amount,
        consumedUnit: consumption.unit,
        userContext: comparisonDeps.getUserContext(),
      };
    }
    for (let index = 0; index < models.length; index += 1) {
      if (controller.signal.aborted || !comparisonDeps.isRequestActive(controller)) break;
      const model = models[index];
      /** @type {any} */
      const run = {
        route: { provider: model.provider, model: model.model },
        providerLabel: model.providerDisplay,
        modelLabel: model.modelDisplay,
        status: 'running', result: null, error: '', durationMs: 0,
      };
      comparisonRuns.push(run);
      renderComparisonResults();
      setComparisonProgress(index + 1, models.length, `Waiting for ${model.modelDisplay}…`);
      const startedAt = performance.now();
      try {
        run.result = await analyzeMealPhoto(files, {
          selection: run.route,
          preparedPhotos,
          includeImages: false,
          ...comparisonRunContext,
          signal: controller.signal,
        });
        run.status = 'complete';
      } catch (error) {
        if (controller.signal.aborted || !comparisonDeps.isRequestActive(controller)) break;
        run.status = 'error';
        run.error = getErrorMessage(error, 'This model could not return a usable estimate.');
      }
      run.durationMs = Math.round(performance.now() - startedAt);
      renderComparisonResults();
      scheduleComparisonPersistence();
    }
    if (!controller.signal.aborted && comparisonDeps.isRequestActive(controller)) {
      const failed = comparisonRuns.filter(run => run.status === 'error').length;
      setComparisonProgress(models.length, models.length, failed
        ? `${failed} model${failed === 1 ? '' : 's'} need${failed === 1 ? 's' : ''} retry`
        : 'Comparison ready', failed ? 'partial' : 'success');
    }
  } catch (error) {
    if (!controller.signal.aborted && comparisonDeps.isRequestActive(controller)) {
      setComparisonProgress(1, models.length, getErrorMessage(error, 'The comparison could not start.'), 'error');
    }
  } finally {
    if (comparisonDeps.isRequestActive(controller)) {
      comparisonDeps.finishRequest(controller);
      comparisonRunning = false;
      comparisonDeps.updateCorrectionState();
      updateComparisonControls();
      scheduleComparisonPersistence();
    }
  }
}

export async function retryComparisonRun(index) {
  if (!isDebugMode() || comparisonRunning) return;
  const run = comparisonRuns[index];
  if (comparisonIsRestored || !run || run.status !== 'error' || run.result || !comparisonPreparedPhotos.length || !comparisonRunContext) {
    showNotification('This model run cannot be retried from the current comparison.', 'info');
    return;
  }
  comparisonRunning = true;
  const controller = comparisonDeps.startRequest();
  run.status = 'running';
  run.error = '';
  renderComparisonResults();
  comparisonDeps.updateCorrectionState();
  updateComparisonControls();
  setComparisonProgress(1, 1, `Retrying ${run.modelLabel}…`);
  const startedAt = performance.now();
  try {
    run.result = await analyzeMealPhoto([], {
      selection: run.route,
      preparedPhotos: comparisonPreparedPhotos,
      includeImages: false,
      ...comparisonRunContext,
      signal: controller.signal,
    });
    if (controller.signal.aborted || !comparisonDeps.isRequestActive(controller)) return;
    run.status = 'complete';
    run.durationMs = Math.round(performance.now() - startedAt);
    renderComparisonResults();
    scheduleComparisonPersistence();
    setComparisonProgress(1, 1, `${run.modelLabel} retry complete`, 'success');
  } catch (error) {
    if (!controller.signal.aborted && comparisonDeps.isRequestActive(controller)) {
      run.status = 'error';
      run.error = getErrorMessage(error, 'This model could not return a usable estimate.');
      run.durationMs = Math.round(performance.now() - startedAt);
      renderComparisonResults();
      scheduleComparisonPersistence();
      setComparisonProgress(1, 1, `${run.modelLabel} still could not finish`, 'partial');
    }
  } finally {
    if (comparisonDeps.isRequestActive(controller)) {
      comparisonDeps.finishRequest(controller);
      comparisonRunning = false;
      comparisonDeps.updateCorrectionState();
      updateComparisonControls();
    }
  }
}

export async function useComparisonEstimate(index) {
  const run = comparisonRuns[index];
  if (!run?.result?.analysis) return;
  let result = {
    ...run.result,
    image: comparisonSharedImages[0] || null,
    images: comparisonSharedImages,
  };
  result = await enrichFreshPhotoAnalysis(result, result.source?.kind === 'ai-photo-estimate' ? 'meal-photo' : 'nutrition-label');
  comparisonDeps.applyAnalysis(result, { quiet: true });
  comparisonDeps.setStatus(`${run.modelLabel} estimate loaded. Review it and choose a meal occasion before saving.`, 'success');
  const returnBar = document.getElementById('nutrition-comparison-return');
  const returnCopy = document.getElementById('nutrition-comparison-return-copy');
  if (returnBar) returnBar.hidden = false;
  if (returnCopy) returnCopy.textContent = `${run.modelLabel} loaded from the benchmark.`;
  const comparison = document.getElementById('nutrition-model-comparison');
  if (comparison) comparison.hidden = true;
  document.querySelector('.nutrition-review-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function showModelComparison() {
  if (!comparisonRuns.length) return;
  const comparison = document.getElementById('nutrition-model-comparison');
  if (!comparison) return;
  comparison.hidden = false;
  renderComparisonResults();
  comparison.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
