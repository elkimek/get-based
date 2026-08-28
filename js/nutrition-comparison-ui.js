// @ts-check
// nutrition-comparison-ui.js — debug model comparison workflow and result UI.

import { analyzeMealPhoto, mealImagesFromPreparedPhotos, prepareMealPhotos } from './nutrition-analysis.js';
import { hydrateNutritionLocalAICatalog, listNutritionVisionModels } from './nutrition-ai-settings.js';
import { parseReferenceIngredients } from './nutrition-comparison.js';
import { actionAttrs, renderComparisonModelPicker } from './nutrition-render.js';
import { escapeHTML, isDebugMode, showNotification } from './utils.js';
import { getErrorMessage } from './caught-error.js';
import { getLocalNutritionComparison, setLocalNutritionComparison } from './nutrition-store.js';
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { renderNutritionComparisonResults } from './nutrition-comparison-results.js';
import { state } from './state.js';

let comparisonRunning = false;
let comparisonRuns = [];
const comparisonRunControllers = new Map();
let comparisonExecutionId = 0;
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
let comparisonModelQuery = '';
let comparisonReplacementPending = false;
let comparisonSelectedModelValues = [];
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
  beforeApplyAnalysis: () => {},
  setStatus: () => {},
};

export function configureNutritionComparisonUI(deps = {}) {
  comparisonDeps = { ...comparisonDeps, ...deps };
}

export function resetNutritionComparison({ preserveWorkspace = false } = {}) {
  if (preserveWorkspace) rememberNutritionComparisonWorkspace();
  comparisonExecutionId += 1;
  for (const controller of comparisonRunControllers.values()) {
    controller.abort(new DOMException('Meal comparison closed.', 'AbortError'));
    comparisonDeps.finishRequest(controller);
  }
  comparisonRunControllers.clear();
  exitComparisonPresentation();
  if (comparisonRuns.length && comparisonProfileId && comparisonPersistenceDirty) void persistComparisonSnapshot(comparisonSnapshot(), comparisonProfileId, comparisonPersistenceRevision);
  if (comparisonPersistenceTimer) clearTimeout(comparisonPersistenceTimer);
  comparisonPersistenceTimer = 0;
  comparisonRunning = false;
  comparisonRuns = [];
  comparisonSharedImages = [];
  comparisonPreparedPhotos = [];
  comparisonRunContext = null;
  comparisonReferenceRunIndex = null;
  if (!preserveWorkspace) comparisonManualReference = {};
  comparisonSavedAt = '';
  comparisonIsRestored = false;
  comparisonProfileId = '';
  comparisonPersistenceDirty = false;
  comparisonPersistenceRevision = 0;
  if (!preserveWorkspace) comparisonModelQuery = '';
  comparisonReplacementPending = false;
  if (!preserveWorkspace) comparisonSelectedModelValues = [];
}

export function resetNutritionComparisonSource() {
  resetNutritionComparison({ preserveWorkspace: true });
  renderComparisonResults();
  updateComparisonControls();
  updateComparisonHistoryBanner();
  const progress = document.getElementById('nutrition-comparison-progress');
  if (progress) {
    progress.hidden = true;
    progress.innerHTML = '';
  }
}

export function isNutritionComparisonRunning() {
  return comparisonRunning;
}

export function refreshComparisonModelPicker() {
  const current = document.querySelector('.nutrition-comparison-model-picker');
  if (!current || comparisonRunning) return;
  const wasCheckingLocal = current.textContent?.includes('checking Local AI') === true;
  const search = current.querySelector('[data-nutrition-comparison-search]');
  comparisonModelQuery = search instanceof HTMLInputElement ? search.value : comparisonModelQuery;
  const checkedValues = new Set(Array.from(current.querySelectorAll('[data-nutrition-comparison-model]:checked'))
    .map(input => /** @type {HTMLInputElement} */ (input).value));
  const retainedValues = comparisonSelectedModelValues.length
    ? new Set(comparisonSelectedModelValues)
    : checkedValues;
  current.outerHTML = renderComparisonModelPicker(comparisonModelQuery);
  if ((!wasCheckingLocal || comparisonSelectedModelValues.length) && retainedValues.size) {
    document.querySelectorAll('[data-nutrition-comparison-model]').forEach(input => {
      /** @type {HTMLInputElement} */ (input).checked = retainedValues.has(/** @type {HTMLInputElement} */ (input).value);
    });
  }
  filterNutritionComparisonModels(comparisonModelQuery);
  updateComparisonControls();
}

function normalizedModelSearch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

export function filterNutritionComparisonModels(value) {
  comparisonModelQuery = String(value || '').slice(0, 160);
  const picker = document.querySelector('.nutrition-comparison-model-picker');
  if (!picker) return;
  const tokens = normalizedModelSearch(comparisonModelQuery).split(/\s+/).filter(Boolean);
  const cards = Array.from(picker.querySelectorAll('.nutrition-comparison-model'));
  let shown = 0;
  cards.forEach(card => {
    const searchable = normalizedModelSearch(card.getAttribute('data-nutrition-model-search'));
    const matches = tokens.every(token => searchable.includes(token));
    /** @type {HTMLElement} */ (card).hidden = !matches;
    if (matches) shown += 1;
  });
  const status = picker.querySelector('[data-nutrition-comparison-search-status]');
  if (status) status.textContent = tokens.length ? `${shown} of ${cards.length} shown` : `${cards.length} available`;
  const empty = picker.querySelector('[data-nutrition-comparison-search-empty]');
  if (empty instanceof HTMLElement) empty.hidden = !tokens.length || shown > 0;
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
  const reference = {
    mealName: analysis?.mealName || '',
    ingredients: (analysis?.components || []).map(item => item?.name).filter(Boolean),
    totalWeightG: comparisonTotalWeight(analysis),
  };
  for (const field of NUTRIENT_DEFINITIONS) reference[field.key] = analysis?.nutrients?.[field.key];
  return reference;
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

function comparisonIsForeign(profileId = comparisonProfileId) {
  if (profileId && profileId === state.currentProfile) return false;
  resetNutritionComparison();
  showNotification('This benchmark belongs to another profile and was discarded.', 'info');
  return true;
}
function renderComparisonResults() {
  renderNutritionComparisonResults({
    runs: comparisonRuns,
    reference: currentComparisonReference(),
    referenceRun: selectedComparisonReferenceRun(),
    referenceRunIndex: comparisonReferenceRunIndex,
    isRestored: comparisonIsRestored,
  });
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
  const selectedModels = selectedComparisonModels();
  const selectedCount = selectedModels.length;
  const existing = existingComparisonRouteKeys();
  const pendingModels = selectedModels.filter(model => !existing.has(comparisonRouteKey(model.provider, model.model)));
  const reusableRun = comparisonRuns.length > 0 && !comparisonIsRestored && comparisonPreparedPhotos.length > 0 && !!comparisonRunContext;
  const appendRequested = reusableRun && pendingModels.length > 0;
  const availableSlots = Math.max(0, 4 - comparisonRuns.length);
  const hasPhotos = comparisonDeps.hasPhotos() || comparisonPreparedPhotos.length > 0;
  const benchmarkPhotoInput = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-benchmark-photo-input'));
  const clearBenchmarkPhotos = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-nutrition-action="clear-benchmark-photos"]'));
  if (benchmarkPhotoInput) benchmarkPhotoInput.disabled = comparisonRunning;
  if (clearBenchmarkPhotos) clearBenchmarkPhotos.disabled = comparisonRunning;
  const limit = document.getElementById('nutrition-comparison-model-limit');
  document.querySelectorAll('[data-nutrition-comparison-model]').forEach(input => {
    if (input instanceof HTMLInputElement) input.disabled = comparisonRunning;
    const row = input.closest('.nutrition-comparison-model');
    const benchmarked = existing.has(/** @type {HTMLInputElement} */ (input).value);
    row?.classList.toggle('is-benchmarked', benchmarked);
    row?.classList.toggle('is-selected', /** @type {HTMLInputElement} */ (input).checked);
    const note = row?.querySelector('[data-nutrition-benchmarked]');
    if (note instanceof HTMLElement) note.hidden = !benchmarked;
  });
  if (limit) limit.textContent = comparisonRuns.length
    ? `${selectedCount} selected · ${comparisonRuns.length} of 4 results`
    : `${selectedCount} of 4 selected`;
  if (comparisonRunning) {
    button.disabled = true;
    button.textContent = 'Comparison running…';
  } else if (appendRequested) {
    button.disabled = pendingModels.length > availableSlots;
    button.textContent = pendingModels.length > availableSlots
      ? `Remove ${pendingModels.length - availableSlots} result${pendingModels.length - availableSlots === 1 ? '' : 's'} to add selected models`
      : comparisonReplacementPending && pendingModels.length === 1
        ? 'Run replacement model'
        : `Add ${pendingModels.length} model result${pendingModels.length === 1 ? '' : 's'}`;
  } else {
    button.disabled = selectedCount < 2 || selectedCount > 4 || !hasPhotos;
    button.textContent = selectedCount >= 2
      ? `${comparisonRuns.length ? comparisonIsRestored ? 'Run fresh comparison with' : 'Rerun' : 'Run'} ${selectedCount} model${selectedCount === 1 ? '' : 's'}`
      : 'Choose at least 2 models';
  }
}

function setComparisonProgress(completed, total, label, state = 'running') {
  const area = document.getElementById('nutrition-comparison-progress');
  if (!area) return;
  const complete = state === 'success' || state === 'partial';
  const percent = complete ? 100 : Math.max(4, Math.min(96, Math.round(completed / Math.max(1, total) * 100)));
  area.hidden = false;
  area.className = `nutrition-analysis-progress is-${state}`;
  area.innerHTML = `<div class="nutrition-analysis-progress-head"><strong>${escapeHTML(label)}</strong><span>${state === 'running' ? `${completed} of ${total} finished` : state === 'success' ? `${total} model${total === 1 ? '' : 's'} finished` : state === 'partial' ? 'Retry or replace failed models below' : 'Stopped'}</span></div><div class="nutrition-analysis-progress-track" role="progressbar" aria-label="Meal model comparison progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`;
}

export function mountNutritionComparison() {
  if (!isDebugMode()) return false;
  void hydrateNutritionLocalAICatalog({ includeConfigured: true });
  refreshComparisonModelPicker();
  if (comparisonRuns.length || comparisonSelectedModelValues.length) {
    const selected = comparisonSelectedModelValues.length
      ? new Set(comparisonSelectedModelValues)
      : existingComparisonRouteKeys();
    document.querySelectorAll('[data-nutrition-comparison-model]').forEach(input => {
      if (input instanceof HTMLInputElement) input.checked = selected.has(input.value);
    });
  }
  populateManualComparisonReference(comparisonManualReference);
  renderComparisonResults();
  updateComparisonControls();
  updateComparisonHistoryBanner();
  if (comparisonRunning) {
    const completed = comparisonRuns.filter(run => run.status !== 'running').length;
    setComparisonProgress(completed, comparisonRuns.length, 'Benchmark continues in the background…');
  }
  return true;
}

export function rememberNutritionComparisonWorkspace() {
  const picker = document.querySelector('.nutrition-comparison-model-picker');
  if (!picker) return;
  const search = picker.querySelector('[data-nutrition-comparison-search]');
  if (search instanceof HTMLInputElement) comparisonModelQuery = search.value;
  comparisonSelectedModelValues = Array.from(picker.querySelectorAll('[data-nutrition-comparison-model]:checked'))
    .map(input => /** @type {HTMLInputElement} */ (input).value)
    .slice(0, 4);
  comparisonManualReference = readManualComparisonReference();
}

function setComparisonPresentation(active) {
  const workspace = document.getElementById('nutrition-model-comparison');
  const modal = document.getElementById('detail-modal');
  const enabled = Boolean(active && workspace && !workspace.hidden);
  workspace?.classList.toggle('is-presentation', enabled);
  modal?.classList.toggle('nutrition-comparison-presentation', enabled);
  document.body?.classList.toggle('nutrition-comparison-presenting', enabled);
  const button = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-nutrition-action="toggle-comparison-presentation"]'));
  if (button) {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Exit full-screen comparison' : 'Open full-screen comparison');
    button.title = enabled ? 'Exit full-screen comparison' : 'Open full-screen comparison';
    const label = button.querySelector('[data-nutrition-presentation-label]');
    if (label) label.textContent = enabled ? 'Exit full screen' : 'Full screen';
  }
  if (enabled) workspace?.scrollTo({ top: 0 });
  return enabled;
}

export function toggleComparisonPresentation() {
  const workspace = document.getElementById('nutrition-model-comparison');
  if (!workspace || workspace.hidden) return false;
  return setComparisonPresentation(!workspace.classList.contains('is-presentation'));
}

export function exitComparisonPresentation() {
  const workspace = document.getElementById('nutrition-model-comparison');
  const modal = document.getElementById('detail-modal');
  const wasActive = workspace?.classList.contains('is-presentation')
    || modal?.classList.contains('nutrition-comparison-presentation')
    || document.body?.classList.contains('nutrition-comparison-presenting');
  if (!wasActive) return false;
  setComparisonPresentation(false);
  return true;
}

function createComparisonRun(model) {
  return {
    route: { provider: model.provider, model: model.model },
    providerLabel: model.providerDisplay,
    modelLabel: model.modelDisplay,
    status: 'running', result: null, error: '', durationMs: 0,
  };
}

function startComparisonRunRequest(run) {
  const controller = comparisonDeps.startRequest();
  comparisonRunControllers.set(run, controller);
  return controller;
}

function finishComparisonRunRequest(run, controller) {
  if (comparisonRunControllers.get(run) !== controller) return;
  comparisonRunControllers.delete(run);
  comparisonDeps.finishRequest(controller);
}

export function cancelComparisonRun(index) {
  const run = comparisonRuns[index];
  const controller = comparisonRunControllers.get(run);
  if (!run || run.status !== 'running' || !controller || controller.signal.aborted) return false;
  run.status = 'cancelled';
  run.error = 'Canceled by user. Other selected models continue running.';
  controller.abort(new DOMException('Canceled by user.', 'AbortError'));
  renderComparisonResults();
  showNotification(`${run.modelLabel} canceled. Other benchmark models will continue.`, 'info');
  return true;
}

async function executeComparisonRun(run, files, preparedPhotos, executionId, onSettled) {
  const controller = comparisonRunControllers.get(run);
  if (!controller) return;
  const startedAt = performance.now();
  try {
    if (controller.signal.aborted || !comparisonDeps.isRequestActive(controller)) {
      run.status = 'cancelled';
      run.error ||= 'Canceled by user.';
      return;
    }
    run.result = await analyzeMealPhoto(files, {
      selection: run.route,
      preparedPhotos,
      includeImages: false,
      ...comparisonRunContext,
      signal: controller.signal,
    });
    if (controller.signal.aborted || !comparisonDeps.isRequestActive(controller)) {
      run.result = null;
      run.status = 'cancelled';
      run.error ||= 'Canceled by user.';
    } else {
      run.status = 'complete';
    }
  } catch (error) {
    if (controller.signal.aborted || !comparisonDeps.isRequestActive(controller)) {
      run.status = 'cancelled';
      run.error ||= 'Canceled by user.';
    } else {
      run.status = 'error';
      run.error = getErrorMessage(error, 'This model could not return a usable estimate.');
    }
  } finally {
    run.durationMs = Math.round(performance.now() - startedAt);
    finishComparisonRunRequest(run, controller);
    if (executionId !== comparisonExecutionId) return;
    renderComparisonResults();
    scheduleComparisonPersistence();
    onSettled();
  }
}

async function executeComparisonRuns(runs, files, preparedPhotos, executionId) {
  let completed = 0;
  const onSettled = () => {
    completed += 1;
    if (completed < runs.length) setComparisonProgress(completed, runs.length, `${completed} of ${runs.length} models finished…`);
  };
  const execute = run => executeComparisonRun(run, files, preparedPhotos, executionId, onSettled);
  await Promise.all(runs.map(execute));
}

export async function runModelComparison() {
  if (!isDebugMode() || comparisonRunning) return;
  const selectedModels = selectedComparisonModels();
  const existing = existingComparisonRouteKeys();
  const pendingModels = selectedModels.filter(model => !existing.has(comparisonRouteKey(model.provider, model.model)));
  const append = comparisonRuns.length > 0 && !comparisonIsRestored && comparisonPreparedPhotos.length > 0 && !!comparisonRunContext && pendingModels.length > 0;
  const models = append ? pendingModels : selectedModels;
  const files = await comparisonDeps.analysisFiles();
  if ((!append && (models.length < 2 || models.length > 4)) || (append && comparisonRuns.length + models.length > 4)) {
    showNotification(append ? 'Remove a result before adding another model.' : 'Choose between two and four vision models.', 'info');
    return;
  }
  if (!files.length && !comparisonPreparedPhotos.length) {
    showNotification('Choose a meal or label photo before comparing models.', 'info');
    return;
  }
  comparisonRunning = true;
  const executionId = ++comparisonExecutionId;
  comparisonProfileId = state.currentProfile;
  if (!append) {
    comparisonRuns = [];
    comparisonSharedImages = [];
    comparisonPreparedPhotos = [];
    comparisonRunContext = null;
    comparisonReferenceRunIndex = null;
    comparisonIsRestored = false;
  }
  comparisonReplacementPending = false;
  const comparisonReturn = document.getElementById('nutrition-comparison-return');
  if (comparisonReturn) comparisonReturn.hidden = true;
  const batchRuns = models.map(createComparisonRun);
  comparisonRuns.push(...batchRuns);
  batchRuns.forEach(startComparisonRunRequest);
  renderComparisonResults();
  comparisonDeps.updateCorrectionState();
  updateComparisonControls();
  try {
    setComparisonProgress(0, models.length, comparisonPreparedPhotos.length
      ? 'Running selected models in parallel…'
      : 'Preparing one shared photo set…');
    const preparedPhotos = comparisonPreparedPhotos.length ? comparisonPreparedPhotos : await prepareMealPhotos(files);
    if (executionId !== comparisonExecutionId) return;
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
    setComparisonProgress(0, models.length, `Running ${models.length} model${models.length === 1 ? '' : 's'} in parallel…`);
    await executeComparisonRuns(batchRuns, files, preparedPhotos, executionId);
    if (executionId === comparisonExecutionId) {
      const failed = batchRuns.filter(run => !run.result).length;
      setComparisonProgress(models.length, models.length, failed
        ? `${failed} model${failed === 1 ? '' : 's'} need${failed === 1 ? 's' : ''} retry`
        : 'Comparison ready', failed ? 'partial' : 'success');
    }
  } catch (error) {
    if (executionId === comparisonExecutionId) {
      batchRuns.forEach(run => {
        if (run.status !== 'running') return;
        run.status = 'error';
        run.error = getErrorMessage(error, 'The comparison could not start.');
      });
      renderComparisonResults();
      setComparisonProgress(0, models.length, getErrorMessage(error, 'The comparison could not start.'), 'error');
    }
  } finally {
    for (const run of batchRuns) {
      const controller = comparisonRunControllers.get(run);
      if (!controller) continue;
      if (!controller.signal.aborted) controller.abort(new DOMException('Comparison stopped.', 'AbortError'));
      finishComparisonRunRequest(run, controller);
    }
    if (executionId === comparisonExecutionId) {
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
  if (comparisonIsRestored || !run || !['error', 'cancelled'].includes(run.status) || run.result || !comparisonPreparedPhotos.length || !comparisonRunContext) {
    showNotification('This model run cannot be retried from the current comparison.', 'info');
    return;
  }
  comparisonRunning = true;
  const executionId = ++comparisonExecutionId;
  run.status = 'running';
  run.error = '';
  run.result = null;
  startComparisonRunRequest(run);
  renderComparisonResults();
  comparisonDeps.updateCorrectionState();
  updateComparisonControls();
  setComparisonProgress(0, 1, `Retrying ${run.modelLabel}…`);
  try {
    await executeComparisonRun(run, [], comparisonPreparedPhotos, executionId, () => {});
    if (executionId === comparisonExecutionId) {
      setComparisonProgress(1, 1, run.status === 'complete'
        ? `${run.modelLabel} retry complete`
        : `${run.modelLabel} ${run.status === 'cancelled' ? 'retry canceled' : 'still could not finish'}`,
      run.status === 'complete' ? 'success' : 'partial');
    }
  } finally {
    const controller = comparisonRunControllers.get(run);
    if (controller) finishComparisonRunRequest(run, controller);
    if (executionId === comparisonExecutionId) {
      comparisonRunning = false;
      comparisonDeps.updateCorrectionState();
      updateComparisonControls();
    }
  }
}

export function removeComparisonRun(index, { quiet = false } = {}) {
  if (comparisonRunning) {
    showNotification('Wait for the active comparison requests to finish before removing a result.', 'info');
    return false;
  }
  const removed = comparisonRuns[index];
  if (!removed) return false;
  comparisonRuns.splice(index, 1);
  if (comparisonReferenceRunIndex === index) comparisonReferenceRunIndex = null;
  else if (Number.isInteger(comparisonReferenceRunIndex) && comparisonReferenceRunIndex > index) comparisonReferenceRunIndex -= 1;
  const routeKey = comparisonRouteKey(removed.route?.provider, removed.route?.model);
  document.querySelectorAll('[data-nutrition-comparison-model]').forEach(input => {
    if (/** @type {HTMLInputElement} */ (input).value === routeKey) /** @type {HTMLInputElement} */ (input).checked = false;
  });
  comparisonIsRestored = false;
  renderComparisonResults();
  updateComparisonControls();
  updateComparisonHistoryBanner();
  if (comparisonRuns.length) {
    scheduleComparisonPersistence();
  } else {
    if (comparisonPersistenceTimer) clearTimeout(comparisonPersistenceTimer);
    comparisonPersistenceTimer = 0;
    comparisonPersistenceDirty = false;
    comparisonPersistenceRevision += 1;
    comparisonSavedAt = '';
    void setLocalNutritionComparison(comparisonProfileId || state.currentProfile, null);
  }
  if (!quiet) showNotification(`${removed.modelLabel} removed. Select another model to fill the open result slot.`, 'info');
  return true;
}

export function replaceComparisonRun(index) {
  if (!removeComparisonRun(index, { quiet: true })) return false;
  comparisonReplacementPending = true;
  updateComparisonControls();
  const picker = document.querySelector('.nutrition-comparison-model-picker');
  picker?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const search = /** @type {HTMLInputElement | null} */ (picker?.querySelector('[data-nutrition-comparison-search]'));
  search?.focus({ preventScroll: true });
  const progress = document.getElementById('nutrition-comparison-progress');
  if (progress) {
    progress.hidden = false;
    progress.className = 'nutrition-analysis-progress is-partial';
    progress.innerHTML = '<div class="nutrition-analysis-progress-head"><strong>Choose a replacement model</strong><span>Only the new model will run</span></div>';
  }
  showNotification('Failed result removed. Choose another model, then run the replacement.', 'info');
  return true;
}

export async function useComparisonEstimate(index) {
  const profileId = comparisonProfileId;
  if (comparisonIsForeign(profileId)) return;
  const run = comparisonRuns[index];
  if (!run?.result?.analysis) return;
  const result = {
    ...run.result,
    image: comparisonSharedImages[0] || null,
    images: comparisonSharedImages,
  };
  await comparisonDeps.beforeApplyAnalysis();
  if (comparisonIsForeign(profileId)) return;
  comparisonDeps.applyAnalysis(result, { quiet: true });
  comparisonDeps.setStatus(`${run.modelLabel} estimate loaded. Review it and choose a meal occasion before saving.`, 'success');
  const returnBar = document.getElementById('nutrition-comparison-return');
  const returnCopy = document.getElementById('nutrition-comparison-return-copy');
  if (returnBar) returnBar.hidden = false;
  if (returnCopy) returnCopy.textContent = `${run.modelLabel} loaded from the benchmark.`;
  exitComparisonPresentation();
  document.querySelector('.nutrition-review-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
