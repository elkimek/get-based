// @ts-check
// biology-scores.js — Biology Scores orchestrator and public API.

import { filterDatesByRange, getActiveData, invalidateActiveDataCache } from './data.js';
import { canAutomaticallyExplainBiologyScores, generateBiologyScoreAIAnswer, generateBiologyScoreAIAnswers } from './biology-score-ai.js';
import { computeBiologicalCoherence } from './biology-score-coherence.js';
import { assessScoreRecency } from './biology-score-dates.js';
import { getScoreInputs } from './biology-score-contract.js';
import { addScoreInterpretation } from './biology-score-methodology.js';
import { getBiologyScoreCopy } from './biology-score-copy.js';
import { computeBloodFlowSignals } from './biology-score-blood-flow.js';
import { computeWeightedComposite } from './biology-score-engine.js';
import { computeIronHandling } from './biology-score-iron.js';

import {
  renderBiologicalCoherenceLensHero as renderBiologicalCoherenceLensHeroImpl,
  renderBiologyScoreCoveragePlanner,
  renderBiologyScoresActionSummary,
  renderBiologyScoresLens as renderBiologyScoresLensImpl,
  renderBiologyScoresWidget as renderBiologyScoresWidgetImpl,
  renderDashboardBiologyScoreWidget as renderDashboardBiologyScoreWidgetImpl,
  renderDashboardBiologicalCoherenceWidget as renderDashboardBiologicalCoherenceWidgetImpl,
  renderScoreDetail,
  groupBiologyScores,
} from './biology-score-render.js';
import { getScoreAIMaterialKey, hasCurrentScoreAIAssessment, getScoreAIRequestKey, renderScoreAIAnswer, renderScoreAISummary, writeScoreAIAnswer, writeScoreAIAnswers, retryUnsavedScoreAIAnswers, pendingScoreExplanations, setScoreExplanationError } from './biology-score-sections.js';
import { TIER1_BIOLOGY_SCORE_DEFINITIONS } from './biology-score-tier1-definitions.js';
import { TIER2_BIOLOGY_SCORE_DEFINITIONS } from './biology-score-tier2-definitions.js';
import { computeThyroidCoherence } from './biology-score-thyroid.js';
import { getBiologyProfileContext } from './profile-context.js';
import { state } from './state.js';
import { createNewThread } from './chat-loader.js';
import { buildBiologyScoreCoveragePlannerModel, formatBiologyScoreCoveragePlannerPrompt } from './biology-score-coverage-planner.js';
import {
  canOpenBiologyScoresChatPanel,
  getBiologyScoresActiveData,
  prepareBiologyScoresContext,
  hasBiologyScoresAIProvider,
  navigateBiologyScoresRoute,
  openBiologyScoreMarkerDetail,
  openBiologyScoresChatPanel,
  scheduleBiologyScoresTask,
  showBiologyScoresNotification,
  useBiologyScoresChatPrompt,
} from './biology-scores-runtime.js';

let biologyScoreDelegatesInstalled = false;
function installBiologyScoreDelegates() {
  if (biologyScoreDelegatesInstalled || typeof document === 'undefined') return;
  biologyScoreDelegatesInstalled = true;
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const summary = target?.closest('.biology-score-compact > .biology-score-summary');
    const actionEl = target?.closest('[data-biology-score-action]');
    if (summary?.parentElement instanceof HTMLElement && (!actionEl || actionEl.getAttribute('data-biology-score-action') === 'toggle-score')) {
      event.preventDefault();
      const top = summary.getBoundingClientRect().top;
      setScoreExpanded(summary.parentElement, !summary.parentElement.hasAttribute('open'));
      // Closing another row must not move this toggle away from the pointer.
      document.defaultView?.scrollBy({ top: summary.getBoundingClientRect().top - top, behavior: 'instant' });
      return;
    }
    if (!actionEl) return;
    const el = /** @type {HTMLElement} */ (actionEl);
    const action = el.dataset.biologyScoreAction;
    if (action === 'open-lens') {
      navigateBiologyScoresRoute('biology-scores');
      event.preventDefault();
    } else if (action === 'interpret-lens') {
      openBiologyScoresChatPanel();
      scheduleBiologyScoresTask(() => {
        useBiologyScoresChatPrompt('Interpret my Biology Scores. Focus on the strongest and most strained patterns, any stale or mixed-date scores that need retesting, and the most useful next checks. Treat the scores as deterministic pattern summaries, not diagnoses.');
      }, 250);
      event.preventDefault();
    } else if (action === 'plan-coverage-chat') {
      if (!canOpenBiologyScoresChatPanel()) {
        showBiologyScoresNotification('Chat is not available on this screen.', 'error');
        event.preventDefault();
        return;
      }
      if (hasBiologyScoresAIProvider() === false) {
        showBiologyScoresNotification('Connect an AI provider before making a lab plan.', 'error');
        openBiologyScoresChatPanel();
        event.preventDefault();
        return;
      }
      const rawData = getBiologyScoresActiveData();
      const scoreData = filterDatesByRange(rawData, { fallbackToAll: false });
      const scores = computeBiologyScores(scoreData);
      const detailScores = scores.filter((score) => score.id !== 'biologicalCoherence');
      const coherence = scores.find((score) => score.id === 'biologicalCoherence');
      const planner = buildBiologyScoreCoveragePlannerModel(detailScores, coherence);
      createNewThread();
      openBiologyScoresChatPanel(formatBiologyScoreCoveragePlannerPrompt(planner));
      event.preventDefault();
    } else if (action === 'read-score-ai') {
      event.preventDefault();
      const scoreId = el.dataset.biologyScoreId || '';
      const card = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
      if (card?.matches('.biology-score-compact')) setScoreExpanded(card, true);
      else card?.querySelector('.biology-coherence-interpretation')?.setAttribute('open', '');
      const answer = card?.querySelector('.biology-score-ai');
      answer?.setAttribute('tabindex', '-1');
      if (answer instanceof HTMLElement) answer.focus({ preventScroll: true });
      answer?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (action === 'retry-save-score-insights') {
      event.preventDefault();
      void retrySavedBiologyInsights().catch(err => showBiologyScoresNotification(err.message, 'error'));
    } else if (action === 'update-score-insights') {
      event.preventDefault();
      void loadBiologyScoreInsights({ force: true });
    } else if (action === 'interpret-score-ai') {
      event.preventDefault();
      runEmbeddedScoreAI(el).catch((err) => {
        showBiologyScoresNotification(err?.message || 'Could not generate Biology Score answer', 'error');
      });
    } else if (action === 'jump-to-domain') {
      const scoreId = el.dataset.biologyScoreId;
      if (!scoreId) return;
      event.preventDefault();
      if (state.currentView === 'biology-scores') {
        jumpToScore(scoreId);
      } else {
        navigateBiologyScoresRoute('biology-scores');
        jumpToScoreWhenReady(scoreId);
      }
    } else if (action === 'open-marker') {
      const markerId = el.dataset.biologyMarkerId;
      if (markerId) {
        openBiologyScoreMarkerDetail(markerId);
        event.preventDefault();
      }
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target instanceof Element ? event.target : null;
    const el = /** @type {HTMLElement | null} */ (target?.closest('[data-biology-score-action="jump-to-domain"]'));
    if (!el) return;
    event.preventDefault();
    el.click();
  });
  document.addEventListener('toggle', event => {
    if (event.target instanceof Element && event.target.matches('.biology-score-unavailable-group')) alignBiologyScoreCards();
  }, true);
}
installBiologyScoreDelegates();

function setScoreExpanded(target, open) {
  if (open) {
    const group = target.closest('.biology-score-unavailable-group');
    if (group instanceof HTMLDetailsElement) group.open = true;
    alignBiologyScoreCards();
  }
  if (open) document.querySelectorAll('.biology-score-compact[open]').forEach(other => {
    if (other !== target) setScoreExpanded(other, false);
  });
  target.toggleAttribute('open', open);
  target.querySelector('[data-biology-score-action=toggle-score]')?.setAttribute('aria-expanded', String(open));
}

function jumpToScore(scoreId) {
  const target = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
  if (target?.matches('.biology-score-compact')) setScoreExpanded(target, true);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToScoreWhenReady(scoreId, maxAttempts = 30) {
  let attempts = 0;
  function tryScroll() {
    const target = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
    if (target) {
      if (target?.matches('.biology-score-compact')) setScoreExpanded(target, true);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (++attempts < maxAttempts) {
      requestAnimationFrame(tryScroll);
    }
  }
  requestAnimationFrame(tryScroll);
}

function replaceScoreMarkup(element, html) {
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

function refreshScoreAIView(current) {
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

async function runEmbeddedScoreAI(el) {
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

const automaticAttempts = new Map();
const sharedExplanationLoads = new Map();

export function loadBiologyScoreInsights({ force = false } = {}) {
  const profileId = state.currentProfile;
  if (sharedExplanationLoads.has(profileId)) {
    if (!force) return sharedExplanationLoads.get(profileId);
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

// Existing scoring helpers read range settings from state. Capture each view
// synchronously and restore both settings before any render, write or await.
export function computeBiologyScoreView(data, view, options = {}) {
  const previous = { rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter };
  try {
    Object.assign(state, view);
    return computeBiologyScores(filterDatesByRange(data, { fallbackToAll: false }), options);
  } finally { Object.assign(state, previous); }
}

// One comparison-aware answer covers all standard views. Repeated evidence
// is described once; this does not make eight independent AI assessments.
export function computeBiologyScoreAssessments(data) {
  // Profile context describes the whole assessment across lab date filters.
  // Capture live rollups once so all views use the same context snapshot.
  const options = { profileContext: getBiologyProfileContext() };
  const current = computeBiologyScoreView(data, { rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter }, options);
  const groups = new Map(current.map(score => [score.id, { ...score, aiViews: [] }]));
  for (const dateRangeFilter of ['all', '1y', '6m', '3m']) {
    for (const rangeMode of ['optimal', 'reference']) {
      for (const score of computeBiologyScoreView(data, { rangeMode, dateRangeFilter }, options)) {
        const group = groups.get(score.id);
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

function assessmentRequestKeys(score, profileId) {
  return score.aiViews.map(view => getScoreAIRequestKey(view.score, profileId));
}

function loadPreparedBiologyScoreInsights(profileId, force) {
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
    if (automaticAttempts.size > 512) automaticAttempts.delete(automaticAttempts.keys().next().value);
  }
  reconcileBiologyScoreAIPanels();
  alignBiologyScoreCards();
  const run = async () => {
    let failed = [];
    let errorText = '';
    let errors = {};
    try {
      const { failedIds, errors: requestErrors } = await generateBiologyScoreAIAnswers(requested, {
        automatic: !force,
        shouldContinue: () => state.currentProfile === profileId,
        onBatch: async (group, result) => {
          const records = group.filter(score => result.answers[score.id]).map(score => ({ score, answer: result.answers[score.id], materialFingerprint: materials.get(score.id) }));
          if (records.length) await writeScoreAIAnswers(records, profileId, originData);
          for (const score of group) {
            const keys = assessmentRequestKeys(score, profileId);
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

// Expanded reading panels are deliberately excluded from row measurements.
// Each row follows its longest natural summary; mobile cards size individually.
function alignBiologyScoreCards() {
  if (typeof document === 'undefined') return;
  const cards = [...document.querySelectorAll('.biology-score-compact > .biology-score-summary')];
  cards.forEach(card => /** @type {HTMLElement} */ (card).style.removeProperty('--biology-summary-height'));
  const rows = new Map();
  for (const card of cards) {
    if (!card.getClientRects().length) continue;
    const top = Math.round(card.getBoundingClientRect().top);
    if (!rows.has(top)) rows.set(top, []);
    rows.get(top).push(card);
  }
  for (const row of rows.values()) {
    const height = Math.max(...row.map(card => card.getBoundingClientRect().height));
    row.forEach(card => card.style.setProperty('--biology-summary-height', `${height}px`));
  }
}

// These assays share schema suffixes; keep their ordered fallback paths together.
function fattyAcidPaths(marker, biostarksMarker = '') {
  const paths = ['fattyAcids', 'spadiaFA', 'omegaquantFA', 'zinzinoFA', 'metabolomixFA', 'fattyAcidsTest'].map(group => `${group}.${marker}`);
  if (biostarksMarker) paths.push(`biostarksFA.${biostarksMarker}`);
  return paths;
}

export const SCORE_DEFINITIONS = [
  {
    id: 'biologicalCoherence', title: 'Biological Coherence', kicker: 'System-level signal', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'overview',
    summary: 'A single read across your marker patterns. Strong domains show where your system is coherent; strained ones point to where retesting or deeper context helps.', compute: (data, def, options = {}) => computeBiologicalCoherence(data, def, SCORE_DEFINITIONS, (input, defs) => computeBiologyScoresInternal(input, defs, options)),
  },
  {
    id: 'metabolicFlexibility', title: 'Metabolic Flexibility', kicker: 'Glucose-insulin strain', evidence: 'production', panelTier: 'minimum', coherenceDomain: 'metabolic', coherenceWeight: 1.2,
    summary: 'A practical fasting-lab proxy for fuel flexibility, anchored on glucose-insulin pressure and triglyceride/HDL handling.',
    compute: computeWeightedComposite,
    inputs: [
      { key: 'homaIR', label: 'HOMA-IR', weight: 1.7, paths: 'diabetes.homaIR', core: true },
      { key: 'insulin', label: 'Fasting insulin', weight: 1.45, paths: 'diabetes.insulin', core: true },
      { key: 'glucose', label: 'Fasting glucose', weight: 0.95, paths: 'biochemistry.glucose', core: true },
      { key: 'hba1c', label: 'HbA1c', weight: 0.85, paths: 'diabetes.hba1c' },
      { key: 'tgHdlRatio', label: 'TG/HDL ratio', weight: 1.15, paths: 'calculatedRatios.tgHdlRatio', core: true },
      { key: 'tag', label: 'Triglycerides', weight: 0.75, paths: 'lipids.triglycerides' },
      { key: 'hdl', label: 'HDL', weight: 0.55, paths: 'lipids.hdl' },
      { key: 'cPeptide', label: 'C-peptide', weight: 0.35, paths: 'diabetes.cPeptide' },
      { key: 'fructosamine', label: 'Fructosamine', weight: 0.3, paths: 'diabetes.fructosamine' },
    ],
  },
  {
    id: 'thyroidCoherence', title: 'Thyroid Coherence', kicker: 'Signal quality', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'endocrine', coherenceWeight: 1.0,
    summary: 'TSH and Free T4 core pattern with additional Free T3, antibody and conversion context.', compute: computeThyroidCoherence,
  },
  {
    id: 'cardiovascularLipoprotein', title: 'Cardiovascular Risk', kicker: 'Lipoprotein pattern', evidence: 'production', panelTier: 'minimum', coherenceDomain: 'cardiovascular', coherenceWeight: 1.1,
    summary: 'ApoB and related lipoprotein patterns; a marker summary, not an event-risk calculation.',
    compute: computeWeightedComposite,
    inputs: [
      { key: 'apoB', label: 'ApoB', weight: 2.0, paths: ['lipids.apoB', 'lipids.apoB_'], core: true },
      { key: 'apoBA1Ratio', label: 'ApoB/ApoA1 ratio', weight: 1.5, paths: ['calculatedRatios.apoBapoAIRatio', 'calculatedRatios.apoBA1Ratio'], core: true },
      { key: 'apoA1', label: 'ApoA1', weight: 1.0, paths: ['lipids.apoAI', 'lipids.apoA1'] },
      { key: 'lpA', label: 'Lp(a)', weight: 1.0, paths: ['lipids.lpA', 'lipids.lpa', 'lipids.lp_a'] },
      { key: 'ldl', label: 'LDL cholesterol', weight: 0.8, paths: ['lipids.ldl', 'lipids.ldlCholesterol', 'calculatedRatios.ldl'] },
      { key: 'nonHdl', label: 'Non-HDL cholesterol', weight: 0.8, paths: 'lipids.nonHdl' },
      { key: 'cholHdlRatio', label: 'Total cholesterol/HDL ratio', weight: 0.6, paths: ['calculatedRatios.cholHdlRatio', 'lipids.cholHdlRatio'] },
      { key: 'homocysteine', label: 'Homocysteine', weight: 0.5, paths: 'coagulation.homocysteine', recencyRequired: false },
      { key: 'hsCrp', label: 'hs-CRP', weight: 0.4, paths: 'proteins.hsCRP', recencyRequired: false },
      { key: 'triglycerides', label: 'Triglycerides', weight: 0.4, paths: 'lipids.triglycerides', recencyRequired: false },
    ],
  },
  {
    id: 'redoxStress', title: 'Inflammatory Load', kicker: 'Metabolic burden context', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'inflammation', coherenceWeight: 1.0,
    summary: 'CRP or hs-CRP anchors inflammation; liver-metabolic and nutrient markers add context.', compute: computeWeightedComposite,
    inputs: [
      { key: 'hsCrp', label: 'hs-CRP', weight: 1.55, paths: 'proteins.hsCRP', core: true },
      { key: 'crp', label: 'CRP', weight: 0.55, paths: 'proteins.crp' },
      { key: 'ggt', label: 'GGT', weight: 1.25, paths: 'biochemistry.ggt', core: true },
      { key: 'uricAcid', label: 'Uric acid', weight: 0.6, paths: 'biochemistry.uricAcid' },
      { key: 'ferritin', label: 'Ferritin', weight: 0.45, paths: 'iron.ferritin' },
      { key: 'homocysteine', label: 'Homocysteine', weight: 0.55, paths: 'coagulation.homocysteine' },
      { key: 'bilirubin', label: 'Bilirubin', weight: 0.25, paths: 'biochemistry.bilirubinTotal' },
      { key: 'vitaminD', label: '25-OH vitamin D', weight: 0.3, paths: 'vitamins.vitaminD' },
      { key: 'selenium', label: 'Selenium', weight: 0.25, paths: 'electrolytes.selenium' },
      { key: 'seleniumUrine', label: 'Urine selenium', weight: 0.25, paths: 'nutrientElements.selenium' },
      { key: 'seleniumRBC', label: 'RBC selenium', weight: 0.25, paths: 'biostarksMineral.selenium' },
    ],
  },
  {
    id: 'lipidMembrane', title: 'Lipid Membrane', kicker: 'Fatty-acid architecture', evidence: 'contextual', panelTier: 'extended', coherenceDomain: 'membrane', coherenceWeight: 1.0,
    summary: 'Assay-specific fatty-acid patterns, including omega-3 status and lipid balance.', compute: computeWeightedComposite,
    inputs: [
      { key: 'omega3Index', label: 'Omega-3 index', weight: 2.0, core: true, paths: fattyAcidPaths('omega3Index', 'omega3Index') },
      { key: 'dha', label: 'DHA', weight: 1.15, paths: fattyAcidPaths('dhaC22_6', 'dha') },
      { key: 'epa', label: 'EPA', weight: 0.9, paths: fattyAcidPaths('epaC20_5', 'epa') },
      { key: 'aaEpa', label: 'AA/EPA ratio', weight: 0.55, paths: fattyAcidPaths('aaEpaRatio') },
      { key: 'omega6to3', label: 'Omega-6/3 ratio', weight: 0.45, paths: fattyAcidPaths('omega6to3Ratio') },
      { key: 'dpa', label: 'DPA', weight: 0.25, paths: fattyAcidPaths('dpaC22_5') },
      { key: 'linoleic', label: 'Linoleic acid', weight: 0.25, paths: fattyAcidPaths('linoleicC18_2', 'linoleicAcid') },
      { key: 'arachidonic', label: 'Arachidonic acid', weight: 0.25, paths: fattyAcidPaths('arachidonicC20_4') },
    ],
  },
  {
    id: 'bloodFlowViscosity', title: 'Blood Flow Context', kicker: 'Flow context', evidence: 'experimental', panelTier: 'minimum', coherenceDomain: 'blood', coherenceWeight: 0.8,
    summary: 'Blood concentration and clotting-context signals; experimental and not a direct blood-viscosity measurement.', compute: computeBloodFlowSignals,
  },
  {
    id: 'ironHandling', title: 'Iron Handling', kicker: 'Transport + storage', evidence: 'production', panelTier: 'minimum', coherenceDomain: 'blood', coherenceWeight: 1.2,
    summary: 'Rule-based iron availability, storage, overload, inflammation, and red-cell utilization context.', compute: computeIronHandling,
  },
  ...TIER1_BIOLOGY_SCORE_DEFINITIONS.map(def => ({ ...def, compute: computeWeightedComposite })),
  ...TIER2_BIOLOGY_SCORE_DEFINITIONS.map(def => ({ ...def, compute: computeWeightedComposite })),
];

function computeBiologyScoresInternal(data, definitions, options = {}) {
  const profileContext = options.profileContext || getBiologyProfileContext(options);
  const computeOptions = { ...options, profileContext };
  return definitions.map((def) => {
    const result = addScoreInterpretation(def.compute(data, def, computeOptions));
    const rows = [...result.available, ...result.missing];
    const labels = core => [...new Set(rows.filter(i => !!i.core === core).map(i => i.coreGroupLabel || i.label))];
    return { ...getBiologyScoreCopy(def.id), ...result, basicInputs: labels(true), extendedInputs: labels(false) };
  });
}

export function computeBiologyScores(data, options = {}) {
  const components = computeBiologyScoresInternal(data, SCORE_DEFINITIONS.filter(d => d.id !== 'biologicalCoherence'), options);
  const overview = computeBiologicalCoherence(data, SCORE_DEFINITIONS[0], SCORE_DEFINITIONS, (_data, defs) => components.filter(s => defs.some(d => d.id === s.id)));
  // Keep a separate historical overview when no current domain can be computed.
  // Current score/coverage remain unchanged for AI and other data consumers.
  if (!Number.isFinite(overview.rawScore) && overview.available.length === 0) {
    const historical = components.filter(s => Number.isFinite(s.rawScore) && ['stale', 'mixed-dates'].includes(s.recencyStatus));
    if (historical.length) {
      const snapshot = computeBiologicalCoherence(data, SCORE_DEFINITIONS[0], SCORE_DEFINITIONS,
        (_data, defs) => components.filter(s => defs.some(d => d.id === s.id)).map(s => historical.includes(s) ? { ...s, score: s.rawScore } : s));
      const markers = historical.filter(s => s.panelTier !== 'extended').flatMap(s => s.available.filter(i => i.core && !i.profileContextOnly));
      const recency = assessScoreRecency(markers);
      if (Number.isFinite(snapshot.rawScore)) overview.historicalSnapshot = { ...snapshot, score: null, presentationDates: markers.map(i => i.date),
        recencyStatus: recency.status, recencyBadge: recency.badge, recencyMessage: recency.message };
    }
  }
  const displayed = overview.historicalSnapshot || overview;
  const contributorIds = new Set(displayed.available.flatMap(domain => domain.contributorIds || []));
  const historicalOverview = !Number.isFinite(displayed.score) && Number.isFinite(displayed.rawScore);
  for (const score of components) {
    const included = contributorIds.has(score.id);
    const optional = score.panelTier === 'extended';
    const reason = score.recencyStatus === 'stale' ? 'Older results' : score.recencyStatus === 'mixed-dates' ? 'Mixed dates' : score.recencyStatus === 'unknown-date' ? 'Check dates' : 'Needs inputs or context';
    score.overviewMembership = { included, optional, label: optional ? 'Optional · Outside overview' : included ? historicalOverview ? 'In historical overview' : Number.isFinite(displayed.rawScore) ? 'In overview' : 'Ready for overview' : `Excluded · ${reason}` };
  }
  overview.membership = components.filter(s => s.panelTier !== 'extended').map(s => ({ id: s.id, title: s.title, domain: s.coherenceDomain, ...s.overviewMembership }));
  if (overview.historicalSnapshot) overview.historicalSnapshot.membership = overview.membership;
  return [overview, ...components].map(score => ({ ...score, aiRangeMode: state.rangeMode }));
}

export function getBiologyScoreMapping() {
  return SCORE_DEFINITIONS.map((def) => ({
    id: def.id,
    title: def.title,
    evidence: def.evidence || 'experimental',
    panelTier: def.panelTier || 'minimum',
    coherenceDomain: def.coherenceDomain || null,
    coherenceWeight: def.coherenceWeight || 1,
    inputs: getScoreInputs(def).map((input) => ({
      key: input.key,
      label: input.label,
      weight: input.weight,
      paths: Array.isArray(input.paths) ? input.paths : [input.paths],
      recencyRequired: input.recencyRequired !== false,
      core: input.core === true,
      coreGroup: input.coreGroup || '',
      coreGroupLabel: input.coreGroupLabel || '',
      evidenceGroup: input.evidenceGroup,
      contextOnly: input.contextOnly || '',
      coreSex: Array.isArray(input.coreSex) ? input.coreSex : [],
    })),
    formula: def.id === 'biologicalCoherence' ? 'fixed-domain-core-composite' : 'grouped-core-range-fit',
  }));
}

export function getBiologyScoreWidgetDefinitions() {
  return SCORE_DEFINITIONS.map((def) => ({
    id: `biology-score-${def.id}`,
    scoreId: def.id,
    source: 'Biology Scores',
    title: def.title,
    description: def.summary,
    size: def.id === 'biologicalCoherence' ? 'full' : 'half',
  }));
}

function contextScoreData(ctx) {
  if (!ctx) return {};
  return filterDatesByRange(ctx.data || {}, { fallbackToAll: false });
}

function contextForScores(ctx) {
  return ctx ? { ...ctx, data: contextScoreData(ctx) } : ctx;
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
    const summaryHtml = renderScoreAISummary(score);
    replaceScoreMarkup(teaser, summaryHtml);
    const freshHtml = renderScoreAIAnswer(score);
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

if (typeof globalThis !== 'undefined' && typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-sync-applied', scheduleBiologyScoreAIReconcile);
  globalThis.addEventListener('resize', alignBiologyScoreCards);
}

export function getBiologyScoreLensWidgets(ctx) {
  const scoreCtx = contextForScores(ctx);
  const scores = computeBiologyScores(scoreCtx?.data || {}).filter(score => score.id !== 'biologicalCoherence');
  return scores.map(score => ({ id: `biology-score-detail-${score.id}`, title: score.title, description: '', body: renderScoreDetail(score), size: 'full', opts: { source: 'Biology Scores', dashboardId: `biology-score-${score.id}`, compactScore: true } }));
}

export function getBiologyScoreLensGroups(ctx) {
  const groups = groupBiologyScores(computeBiologyScores(contextScoreData(ctx)));
  const widgets = new Map(getBiologyScoreLensWidgets(ctx).map(widget => [widget.id, widget]));
  return Object.fromEntries(Object.entries(groups).map(([key, scores]) => [key, scores.map(score => widgets.get(`biology-score-detail-${score.id}`))]));
}

export function renderBiologicalCoherenceLensHero(ctx) {
  return renderBiologicalCoherenceLensHeroImpl(contextForScores(ctx), computeBiologyScores);
}

export function renderDashboardBiologicalCoherenceWidget(ctx) {
  return renderDashboardBiologicalCoherenceWidgetImpl(contextForScores(ctx), computeBiologyScores);
}

export function renderDashboardBiologyScoreWidget(ctx, scoreId) {
  return renderDashboardBiologyScoreWidgetImpl(contextForScores(ctx), scoreId, computeBiologyScores);
}

export function renderBiologyScoresWidget(ctx) {
  return renderBiologyScoresWidgetImpl(contextForScores(ctx), computeBiologyScores);
}

export function renderBiologyScoresLens(ctx) {
  const html = renderBiologyScoresLensImpl(contextForScores(ctx), computeBiologyScores);
  scheduleBiologyScoreAIReconcile();
  return html;
}

// Re-export the render implementations for callers that want the injected-compute variant.
export {
  renderBiologyScoreCoveragePlanner,
  renderBiologyScoresActionSummary,
};
