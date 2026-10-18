import { alignBiologyScoreCards, configureBiologyScoreNavigation } from './biology-score-navigation.js';
import { contextScoreData, contextForScores } from './biology-score-data.js';
import {getLensDashboardToggleView} from './lens-page-shell-core.js';
// biology-scores.js — synchronous compatibility facade and loaded Biology UI/AI controller.
import { computeBiologyScores, computeBiologyScoreView } from './biology-score-compute.js';
export { SCORE_DEFINITIONS, computeBiologyScores, computeBiologyScoreView, getBiologyScoreMapping, getBiologyScoreWidgetDefinitions } from './biology-score-compute.js';

import { filterDatesByRange, getActiveData, invalidateActiveDataCache } from './data.js';
import { canAutomaticallyExplainBiologyScores, generateBiologyScoreAIAnswer, generateBiologyScoreAIAnswers } from './biology-score-ai.js';

import {
  renderBiologicalCoherenceLensHero as renderBiologicalCoherenceLensHeroImpl,
  renderBiologyScoreCoveragePlanner,
  renderBiologyScoresActionSummary,
  renderBiologyScoresLens as renderBiologyScoresLensImpl,
  renderScoreDetail,
  groupBiologyScores,
} from './biology-score-render.js';
import { getBiologyAIRenderState, renderScoreAISummaryForRender, renderScoreAIAnswerForRender, getScoreAIMaterialKey, hasCurrentScoreAIAssessment, getScoreAIRequestKey, renderScoreAIAnswer, renderScoreAISummary, writeScoreAIAnswer, writeScoreAIAnswers, retryUnsavedScoreAIAnswers, pendingScoreExplanations, setScoreExplanationError } from './biology-score-sections.js';
import { getBiologyProfileContext } from './profile-context.js';
import { state } from './state.js';
import { getBiologyScoresActiveData, prepareBiologyScoresContext } from './biology-scores-runtime.js';

import type {BiologyData, BiologyScore, BiologyAssessment, BiologyContext} from '../types/biology-scores.js';

function replaceScoreMarkup(element: Element | null, html: string) {
  if (!element) return;
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const next = template.content.firstElementChild;
  if (!next || element.isEqualNode(next)) return;
  const focused = element.contains(document.activeElement) ? document.activeElement?.getAttribute('data-biology-score-action') : null;
  element.replaceWith(next);
  const control = focused ? next.querySelector(`[data-biology-score-action="${CSS.escape(focused)}"]`) : null;
  if (control instanceof HTMLElement) control.focus({ preventScroll: true });
}

function refreshScoreAIView(current: BiologyScore) {
  const scoreId = CSS.escape(current.id);
  const panel = document.querySelector(`[data-biology-score-ai-panel="${scoreId}"]`);
  replaceScoreMarkup(panel, renderScoreAIAnswer(current));
  const currentTeaser = document.querySelector(`[data-biology-score-ai-summary="${scoreId}"]`);
  replaceScoreMarkup(currentTeaser, renderScoreAISummary(current));
}

async function retrySavedBiologyInsights() {
  const profileId = state.currentProfile;
  const ids = await retryUnsavedScoreAIAnswers(profileId);
  if (!ids.length) return ids;
  if (state.currentProfile !== profileId) return [];
  const scores = computeBiologyScoreAssessments(getBiologyScoresActiveData());
  for (const score of scores.filter(s => ids.includes(s.id))) setScoreExplanationError(assessmentRequestKeys(score, profileId));
  reconcileBiologyScoreAIPanels();
  alignBiologyScoreCards();
  return ids;
}

async function runEmbeddedScoreAI(el: HTMLElement) {
  const scoreId = el.dataset.biologyScoreId;
  if (!scoreId) return;
  const originProfile = state.currentProfile;
  const recovered = await retrySavedBiologyInsights();
  if (recovered?.includes(scoreId)) { reconcileBiologyScoreAIPanels(); return; }
  await prepareBiologyScoresContext();
  if (state.currentProfile !== originProfile) return;
  invalidateActiveDataCache();
  const rawData = getBiologyScoresActiveData();
  const score = computeBiologyScoreAssessments(rawData).find(item => item.id === scoreId);
  if (!score) throw new Error('Score not found');
  const profileId = state.currentProfile;
  const imported = structuredClone(state.importedData);
  const requestKey = getScoreAIRequestKey(score, profileId);
  if (pendingScoreExplanations.has(requestKey)) return;
  const requestKeys = assessmentRequestKeys(score, profileId);
  requestKeys.forEach(key => pendingScoreExplanations.add(key));
  setScoreExplanationError(requestKeys);
  refreshScoreAIView(score);
  alignBiologyScoreCards();
  let errorText = '';
  try {
    const material = getScoreAIMaterialKey(score);
    const answer = await generateBiologyScoreAIAnswer(score);
    await writeScoreAIAnswer(score, answer, profileId, imported, material);
  } catch (error) {
    errorText = error instanceof Error ? error.message : 'Explanation failed. Please retry.';
    throw error;
  } finally {
    requestKeys.forEach(key => pendingScoreExplanations.delete(key));
    setScoreExplanationError(requestKeys, errorText);
    if (state.currentProfile === profileId) {
      invalidateActiveDataCache();
      reconcileBiologyScoreAIPanels();
      const errorEl = document.querySelector(`[data-biology-score-ai-summary="${CSS.escape(scoreId)}"] .biology-score-ai-error`);
      if (errorEl) errorEl.textContent = errorText;
      alignBiologyScoreCards();
    }
  }
}

const automaticAttempts = new Map<string, boolean>();
const sharedExplanationLoads = new Map<string, Promise<void>>();

export function loadBiologyScoreInsights({ force = false }: {force?: unknown} = {}) {
  const profileId = state.currentProfile;
  if (sharedExplanationLoads.has(profileId)) {
    if (!force) return sharedExplanationLoads.get(profileId)!;
    // Explicit refresh is scoped to the current assessment; pending keys deduplicate it.
    return prepareBiologyScoresContext().then(async () => {
      if (state.currentProfile === profileId) await loadPreparedBiologyScoreInsights(profileId, true);
    });
  }
  if (!force && !canAutomaticallyExplainBiologyScores()) return Promise.resolve();
  // Match the ready context used by chat before comparing saved fingerprints.
  // A cold Light runtime must not look like new biological evidence.
  const pending = Promise.resolve().then(async () => {
    await retryUnsavedScoreAIAnswers(profileId);
    await prepareBiologyScoresContext();
    if (state.currentProfile !== profileId) return;
    if (!force && !canAutomaticallyExplainBiologyScores()) return;
    await loadPreparedBiologyScoreInsights(profileId, force);
  }).catch(error => {
    if (state.currentProfile === profileId) {
      const errorEl = document.querySelector('#biology-score-biologicalCoherence .biology-score-ai-error');
      if (errorEl) errorEl.textContent = error instanceof Error ? error.message : 'Context could not load. Refresh to retry.';
    }
  }).finally(() => sharedExplanationLoads.delete(profileId));
  sharedExplanationLoads.set(profileId, pending);
  return pending;
}

// One comparison-aware answer covers all standard views. Repeated evidence
// is described once; this does not make eight independent AI assessments.
export function computeBiologyScoreAssessments(data: BiologyData): BiologyAssessment[] {
  // Profile context describes the whole assessment across lab date filters.
  // Capture live rollups once so all views use the same context snapshot.
  const options = { profileContext: getBiologyProfileContext() };
  const current = computeBiologyScoreView(data, { rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter }, options);
  const groups = new Map(current.map(score => [score.id, { ...score, aiViews: [] as BiologyAssessment['aiViews'] }]));
  for (const dateRangeFilter of ['all', '1y', '6m', '3m']) {
    for (const rangeMode of ['optimal', 'reference']) {
      for (const score of computeBiologyScoreView(data, { rangeMode, dateRangeFilter }, options)) {
        const group = groups.get(score.id)!;
        const material = getScoreAIMaterialKey(score);
        const label = `${rangeMode} / ${dateRangeFilter}`;
        const existing = group.aiViews.find(view => view.material === material);
        if (existing) existing.labels.push(label);
        else group.aiViews.push({ labels: [label], material, score });
      }
    }
  }
  return [...groups.values()];
}

function assessmentRequestKeys(score: BiologyAssessment, profileId: string) {
  return score.aiViews.map(view => getScoreAIRequestKey(view.score, profileId));
}

function loadPreparedBiologyScoreInsights(profileId: string, force: unknown) {
  invalidateActiveDataCache();
  const data = getBiologyScoresActiveData();
  const scores = computeBiologyScoreAssessments(data);
  const originData = structuredClone(state.importedData);
  const requested = scores.filter(score => {
    if (assessmentRequestKeys(score, profileId).some(key => pendingScoreExplanations.has(key))) return false;
    if (!score.aiViews.some(view => (view.score.historicalSnapshot || view.score).available?.length)) return false;
    // Legacy per-view answers stay usable. A filter change must not purchase
    // an upgrade: explicit Refresh creates the combined interpretation.
    if (hasCurrentScoreAIAssessment(score)) return false;
    return force || !automaticAttempts.has(getScoreAIRequestKey(score, profileId));
  });
  if (!requested.length) {
    reconcileBiologyScoreAIPanels();
    alignBiologyScoreCards();
    return Promise.resolve();
  }
  const materials = new Map(requested.map(score => [score.id, getScoreAIMaterialKey(score)]));
  for (const score of requested) {
    setScoreExplanationError(assessmentRequestKeys(score, profileId));
    for (const key of assessmentRequestKeys(score, profileId)) {
      pendingScoreExplanations.add(key);
      automaticAttempts.set(key, true);
    }
    if (automaticAttempts.size > 512) automaticAttempts.delete(automaticAttempts.keys().next().value!);
  }
  reconcileBiologyScoreAIPanels();
  alignBiologyScoreCards();
  const run = async () => {
    let failed: string[] = [];
    let errorText = '';
    let errors: Record<string, string> = {};
    try {
      const { failedIds, errors: requestErrors } = await generateBiologyScoreAIAnswers(requested, {
        automatic: !force,
        shouldContinue: () => state.currentProfile === profileId,
        onBatch: async (group, result) => {
          const records = (group as BiologyAssessment[]).filter(score => result.answers[score.id]).map(score => ({ score, answer: result.answers[score.id]!, materialFingerprint: (materials.get(score.id) as string) }));
          if (records.length) await writeScoreAIAnswers(records, profileId, originData);
          for (const score of group) {
            const keys = assessmentRequestKeys(score as BiologyAssessment, profileId);
            keys.forEach(key => pendingScoreExplanations.delete(key));
            setScoreExplanationError(keys, result.answers[score.id] ? '' : result.errors[score.id] || 'The response was incomplete. Refresh to retry this score.');
          }
          if (state.currentProfile === profileId) { reconcileBiologyScoreAIPanels(); alignBiologyScoreCards(); }
        },
      });
      errors = requestErrors;
      failed = failedIds;
      if (failed.length) errorText = 'Some insights could not be generated. Refresh to retry.';
    } catch (error) {
      failed = requested.map(score => score.id);
      errorText = error instanceof Error ? error.message : 'AI insights could not load. Refresh to retry.';
    } finally {
      for (const score of requested) {
        const keys = assessmentRequestKeys(score, profileId);
        keys.forEach(key => pendingScoreExplanations.delete(key));
        if (failed.includes(score.id)) setScoreExplanationError(keys, errors[score.id] || errorText);
      }
      if (state.currentProfile === profileId) {
        invalidateActiveDataCache();
        reconcileBiologyScoreAIPanels();
        alignBiologyScoreCards();
      }
    }
    return !errorText;
  };
  return run();
}

function reconcileBiologyScoreAIPanels() {
  if (typeof document === 'undefined') return;
  const panels = Array.from(document.querySelectorAll('[data-biology-score-ai-panel]'));
  if (!panels.length) return;
  const rawData = getActiveData();
  const scoreData = filterDatesByRange(rawData, { fallbackToAll: false });
  const scoreMap = new Map(computeBiologyScores(scoreData).map(score => [score.id, score]));
  for (const panel of panels) {
    const scoreId = panel.getAttribute('data-biology-score-ai-panel');
    const score = scoreId ? scoreMap.get(scoreId) : null;
    if (!score) continue;
    const teaser = document.querySelector(`[data-biology-score-ai-summary="${CSS.escape(scoreId || '')}"]`);
    const summaryHtml = renderScoreAISummaryForRender(score);
    replaceScoreMarkup(teaser, summaryHtml);
    const freshHtml = renderScoreAIAnswerForRender(score);
    replaceScoreMarkup(panel, freshHtml);
  }
}

export function scheduleBiologyScoreAIReconcile() {
  if (typeof globalThis === 'undefined' || typeof document === 'undefined') return;
  const profileId = state.currentProfile;
  const run = async () => {
    try {
      await prepareBiologyScoresContext();
      if (state.currentProfile !== profileId) return;
      invalidateActiveDataCache();
      reconcileBiologyScoreAIPanels();
      alignBiologyScoreCards();
      if (state.currentView === 'biology-scores') void loadBiologyScoreInsights();
    } catch {}
  };
  if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(run);
  else setTimeout(run, 0);
  setTimeout(run, 250);
  setTimeout(run, 1000);
}

configureBiologyScoreNavigation({
  retrySavedInsights: retrySavedBiologyInsights,
  loadInsights: loadBiologyScoreInsights,
  runEmbeddedAI: runEmbeddedScoreAI,
  reconcile: scheduleBiologyScoreAIReconcile,
});

/** Snapshot calculation and AI/display state for typed page composition. */
export function getBiologyScorePresentationRecords(ctx: unknown) {
  return computeBiologyScores(contextScoreData(ctx)).map(score => ({score,ai:getBiologyAIRenderState(score),
    dashboardToggle:getLensDashboardToggleView(`biology-score-${score.id}`)}));
}

export function getBiologyScoreLensWidgets(ctx: unknown) {
  const scoreCtx = contextForScores(ctx) as BiologyContext | null | undefined;
  const scores = computeBiologyScores(scoreCtx?.data || {}).filter(score => score.id !== 'biologicalCoherence');
  return scores.map(score => ({ id: `biology-score-detail-${score.id}`, title: score.title, description: '', body: renderScoreDetail(score), size: 'full', opts: { source: 'Biology Scores', dashboardId: `biology-score-${score.id}`, compactScore: true } }));
}

export function getBiologyScoreLensGroups(ctx: unknown) {
  const groups = groupBiologyScores(computeBiologyScores(contextScoreData(ctx)));
  const widgets = new Map(getBiologyScoreLensWidgets(ctx).map(widget => [widget.id, widget]));
  return Object.fromEntries(Object.entries(groups).map(([key, scores]) => [key, scores.map(score => widgets.get(`biology-score-detail-${score.id}`))]));
}

export function renderBiologicalCoherenceLensHero(ctx: unknown) {
  return (renderBiologicalCoherenceLensHeroImpl as (ctx: unknown, compute: typeof computeBiologyScores) => ReturnType<typeof renderBiologicalCoherenceLensHeroImpl>)(contextForScores(ctx), computeBiologyScores);
}

export { projectDashboardBiologicalCoherenceWidget, projectDashboardBiologyScoreWidget, renderDashboardBiologicalCoherenceWidget, renderDashboardBiologyScoreWidget, renderBiologyScoresWidget } from './biology-score-dashboard.js';

export function renderBiologyScoresLens(ctx: unknown) {
  const html = (renderBiologyScoresLensImpl as (ctx: unknown, compute: typeof computeBiologyScores) => ReturnType<typeof renderBiologyScoresLensImpl>)(contextForScores(ctx), computeBiologyScores);
  scheduleBiologyScoreAIReconcile();
  return html;
}

// Re-export the render implementations for callers that want the injected-compute variant.
export {
  renderBiologyScoreCoveragePlanner,
  renderBiologyScoresActionSummary,
};
