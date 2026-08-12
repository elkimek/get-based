// @ts-check
// biology-scores.js — Biology Scores orchestrator and public API.

import { filterDatesByRange, getActiveData } from './data.js';
import { generateBiologyScoreAIAnswer } from './biology-score-ai.js';
import { computeBiologicalCoherence } from './biology-score-coherence.js';
import { getBiologyScoreCopy } from './biology-score-copy.js';
import { computeBloodFlowSignals } from './biology-score-blood-flow.js';
import { computeWeightedComposite } from './biology-score-engine.js';
import { computeIronHandling } from './biology-score-iron.js';
import { CUSTOM_BIOLOGY_SCORE_MAPPINGS } from './biology-score-mappings.js';

import {
  renderBiologicalCoherenceLensHero as renderBiologicalCoherenceLensHeroImpl,
  renderBiologyScoreCoveragePlanner,
  renderBiologyScoresActionSummary,
  renderBiologyScoresLens as renderBiologyScoresLensImpl,
  renderBiologyScoresWidget as renderBiologyScoresWidgetImpl,
  renderDashboardBiologyScoreWidget as renderDashboardBiologyScoreWidgetImpl,
  renderDashboardBiologicalCoherenceWidget as renderDashboardBiologicalCoherenceWidgetImpl,
  renderScoreDetail,
} from './biology-score-render.js';
import { renderScoreAIAnswer, writeScoreAIAnswer } from './biology-score-sections.js';
import { TIER1_BIOLOGY_SCORE_DEFINITIONS } from './biology-score-tier1-definitions.js';
import { TIER2_BIOLOGY_SCORE_DEFINITIONS } from './biology-score-tier2-definitions.js';
import { computeThyroidCoherence } from './biology-score-thyroid.js';
import { getBiologyProfileContext } from './profile-context.js';
import { state } from './state.js';
import { createNewThread } from './chat-loader.js';
import { renderMarkdown } from './markdown.js';
import { buildBiologyScoreCoveragePlannerModel, formatBiologyScoreCoveragePlannerPrompt } from './biology-score-coverage-planner.js';
import {
  canOpenBiologyScoresChatPanel,
  getBiologyScoresActiveData,
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
    const actionEl = target?.closest('[data-biology-score-action]');
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
}
installBiologyScoreDelegates();

function jumpToScore(scoreId) {
  const target = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToScoreWhenReady(scoreId, maxAttempts = 30) {
  let attempts = 0;
  function tryScroll() {
    const target = document.querySelector(`#biology-score-${CSS.escape(scoreId)}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (++attempts < maxAttempts) {
      requestAnimationFrame(tryScroll);
    }
  }
  requestAnimationFrame(tryScroll);
}

async function runEmbeddedScoreAI(el) {
  const scoreId = el.dataset.biologyScoreId;
  const answerEl = scoreId ? document.querySelector(`[data-biology-score-ai-answer="${CSS.escape(scoreId)}"]`) : null;
  if (!scoreId || !answerEl) return;
  const rawData = getBiologyScoresActiveData();
  const scoreData = filterDatesByRange(rawData, { fallbackToAll: false });
  const score = computeBiologyScores(scoreData).find(item => item.id === scoreId);
  if (!score) throw new Error('Score not found');
  const button = /** @type {HTMLButtonElement | null} */ (el instanceof HTMLButtonElement ? el : null);
  if (button) { button.disabled = true; button.textContent = 'Generating…'; }
  answerEl.textContent = 'Generating AI answer…';
  try {
    const answer = await generateBiologyScoreAIAnswer(score);
    await writeScoreAIAnswer(score, answer);
    const panel = answerEl.closest('.biology-score-ai');
    panel?.querySelector('.biology-score-ai-stale')?.remove();
    answerEl.innerHTML = renderMarkdown(answer);
    if (button) button.textContent = 'Refresh answer';
  } finally { if (button) button.disabled = false; }
}

export const SCORE_DEFINITIONS = [
  {
    id: 'biologicalCoherence', title: 'Biological Coherence', kicker: 'System-level signal', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'overview',
    summary: 'A single read across your marker patterns. Strong domains show where your system is coherent; strained ones point to where retesting or deeper context helps.', compute: (data, def) => computeBiologicalCoherence(data, def, SCORE_DEFINITIONS, computeBiologyScoresInternal),
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
    summary: 'Profile-aware thyroid regulation, Free T3 activity, and T4-to-T3 conversion coherence.', compute: computeThyroidCoherence,
  },
  {
    id: 'cardiovascularLipoprotein', title: 'Cardiovascular Risk', kicker: 'Lipoprotein pattern', evidence: 'production', panelTier: 'minimum', coherenceDomain: 'cardiovascular', coherenceWeight: 1.1,
    summary: 'Atherogenic lipoprotein pattern anchored on ApoB and ApoB/ApoA1 ratio; the strongest outcome-predicted cardiovascular risk markers available.',
    compute: computeWeightedComposite,
    inputs: [
      { key: 'apoB', label: 'ApoB', weight: 2.0, paths: ['lipids.apoB', 'lipids.apoB_'], core: true },
      { key: 'apoBA1Ratio', label: 'ApoB/ApoA1 ratio', weight: 1.5, paths: ['calculatedRatios.apoBapoAIRatio', 'calculatedRatios.apoBA1Ratio'], core: true },
      { key: 'apoA1', label: 'ApoA1', weight: 1.0, paths: ['lipids.apoAI', 'lipids.apoA1'] },
      { key: 'lpA', label: 'Lp(a)', weight: 1.0, paths: ['lipids.lpA', 'lipids.lpa', 'lipids.lp_a'] },
      { key: 'ldl', label: 'LDL cholesterol', weight: 0.8, paths: ['lipids.ldl', 'lipids.ldlCholesterol', 'calculatedRatios.ldl'] },
      { key: 'cholHdlRatio', label: 'Total cholesterol/HDL ratio', weight: 0.6, paths: ['calculatedRatios.cholHdlRatio', 'lipids.cholHdlRatio'] },
      { key: 'homocysteine', label: 'Homocysteine', weight: 0.5, paths: 'coagulation.homocysteine', recencyRequired: false },
      { key: 'hsCrp', label: 'hs-CRP', weight: 0.4, paths: 'proteins.hsCRP', recencyRequired: false },
      { key: 'triglycerides', label: 'Triglycerides', weight: 0.4, paths: 'lipids.triglycerides', recencyRequired: false },
    ],
  },
  {
    id: 'redoxStress', title: 'Inflammatory Load', kicker: 'Metabolic burden context', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'inflammation', coherenceWeight: 1.0,
    summary: 'Inflammation and liver-metabolic burden anchored on hs-CRP and GGT; other markers are context, not direct redox measurement.', compute: computeWeightedComposite,
    inputs: [
      { key: 'hsCrp', label: 'hs-CRP', weight: 1.55, paths: 'proteins.hsCRP', core: true },
      { key: 'crp', label: 'CRP', weight: 0.55, paths: 'proteins.crp' },
      { key: 'ggt', label: 'GGT', weight: 1.25, paths: 'biochemistry.ggt', core: true },
      { key: 'uricAcid', label: 'Uric acid', weight: 0.6, paths: 'biochemistry.uricAcid' },
      { key: 'ferritin', label: 'Ferritin', weight: 0.45, paths: 'iron.ferritin' },
      { key: 'homocysteine', label: 'Homocysteine', weight: 0.55, paths: 'coagulation.homocysteine' },
      { key: 'bilirubin', label: 'Bilirubin', weight: 0.25, paths: 'biochemistry.bilirubinTotal' },
      { key: 'vitaminD', label: '25-OH vitamin D', weight: 0.3, paths: 'vitamins.vitaminD' },
      { key: 'selenium', label: 'Selenium', weight: 0.25, paths: ['nutrientElements.selenium', 'biostarksMineral.selenium'] },
    ],
  },
  {
    id: 'lipidMembrane', title: 'Lipid Membrane', kicker: 'Fatty-acid architecture', evidence: 'contextual', panelTier: 'extended', coherenceDomain: 'membrane', coherenceWeight: 1.0,
    summary: 'Cell-membrane lipid quality with emphasis on omega-3/DHA and inflammatory fatty-acid balance.', compute: computeWeightedComposite,
    inputs: [
      { key: 'omega3Index', label: 'Omega-3 index', weight: 2.0, core: true, paths: ['fattyAcids.omega3Index', 'spadiaFA.omega3Index', 'omegaquantFA.omega3Index', 'zinzinoFA.omega3Index', 'metabolomixFA.omega3Index', 'fattyAcidsTest.omega3Index', 'biostarksFA.omega3Index'] },
      { key: 'dha', label: 'DHA', weight: 1.15, paths: ['fattyAcids.dhaC22_6', 'spadiaFA.dhaC22_6', 'omegaquantFA.dhaC22_6', 'zinzinoFA.dhaC22_6', 'metabolomixFA.dhaC22_6', 'fattyAcidsTest.dhaC22_6', 'biostarksFA.dha'] },
      { key: 'epa', label: 'EPA', weight: 0.9, paths: ['fattyAcids.epaC20_5', 'spadiaFA.epaC20_5', 'omegaquantFA.epaC20_5', 'zinzinoFA.epaC20_5', 'metabolomixFA.epaC20_5', 'fattyAcidsTest.epaC20_5', 'biostarksFA.epa'] },
      { key: 'aaEpa', label: 'AA/EPA ratio', weight: 0.55, paths: ['fattyAcids.aaEpaRatio', 'spadiaFA.aaEpaRatio', 'omegaquantFA.aaEpaRatio', 'zinzinoFA.aaEpaRatio', 'metabolomixFA.aaEpaRatio', 'fattyAcidsTest.aaEpaRatio'] },
      { key: 'omega6to3', label: 'Omega-6/3 ratio', weight: 0.45, paths: ['fattyAcids.omega6to3Ratio', 'spadiaFA.omega6to3Ratio', 'omegaquantFA.omega6to3Ratio', 'zinzinoFA.omega6to3Ratio', 'metabolomixFA.omega6to3Ratio', 'fattyAcidsTest.omega6to3Ratio'] },
      { key: 'dpa', label: 'DPA', weight: 0.25, paths: ['fattyAcids.dpaC22_5', 'spadiaFA.dpaC22_5', 'omegaquantFA.dpaC22_5', 'zinzinoFA.dpaC22_5', 'metabolomixFA.dpaC22_5', 'fattyAcidsTest.dpaC22_5'] },
      { key: 'linoleic', label: 'Linoleic acid', weight: 0.25, paths: ['fattyAcids.linoleicC18_2', 'spadiaFA.linoleicC18_2', 'omegaquantFA.linoleicC18_2', 'zinzinoFA.linoleicC18_2', 'metabolomixFA.linoleicC18_2', 'fattyAcidsTest.linoleicC18_2', 'biostarksFA.linoleicAcid'] },
      { key: 'arachidonic', label: 'Arachidonic acid', weight: 0.25, paths: ['fattyAcids.arachidonicC20_4', 'spadiaFA.arachidonicC20_4', 'omegaquantFA.arachidonicC20_4', 'zinzinoFA.arachidonicC20_4', 'metabolomixFA.arachidonicC20_4', 'fattyAcidsTest.arachidonicC20_4'] },
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
  return definitions.map((def) => ({ ...def.compute(data, def, computeOptions), ...getBiologyScoreCopy(def.id, profileContext) }));
}

export function computeBiologyScores(data, options = {}) {
  return computeBiologyScoresInternal(data, SCORE_DEFINITIONS, options);
}

export function getBiologyScoreMapping() {
  return SCORE_DEFINITIONS.map((def) => ({
    id: def.id,
    title: def.title,
    evidence: def.evidence || 'experimental',
    panelTier: def.panelTier || 'minimum',
    coherenceDomain: def.coherenceDomain || null,
    coherenceWeight: def.coherenceWeight || 1,
    inputs: (def.inputs || CUSTOM_BIOLOGY_SCORE_MAPPINGS[def.id] || []).map((input) => ({
      key: input.key,
      label: input.label,
      weight: input.weight,
      paths: Array.isArray(input.paths) ? input.paths : [input.paths],
      recencyRequired: input.recencyRequired !== false,
      core: input.core === true,
      coreGroup: input.coreGroup || '',
      coreSex: Array.isArray(input.coreSex) ? input.coreSex : [],
    })),
    formula: def.compute === computeWeightedComposite ? 'weighted-range-composite' : def.id,
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
    const freshHtml = renderScoreAIAnswer(score);
    if (panel.outerHTML !== freshHtml) panel.outerHTML = freshHtml;
  }
}

export function scheduleBiologyScoreAIReconcile() {
  if (typeof globalThis === 'undefined' || typeof document === 'undefined') return;
  const run = () => {
    try { reconcileBiologyScoreAIPanels(); } catch {}
  };
  if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(run);
  else setTimeout(run, 0);
  setTimeout(run, 250);
  setTimeout(run, 1000);
}

if (typeof globalThis !== 'undefined' && typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-sync-applied', scheduleBiologyScoreAIReconcile);
}

export function getBiologyScoreLensWidgets(ctx) {
  const scoreCtx = contextForScores(ctx);
  const scores = computeBiologyScores(scoreCtx?.data || {}).filter(score => score.id !== 'biologicalCoherence');
  const live = scores.filter(s => Number.isFinite(s.score)).sort((a, b) => b.score - a.score);
  const waiting = scores.filter(s => !Number.isFinite(s.score));
  const widgets = live.map(score => ({ id: `biology-score-detail-${score.id}`, title: score.title, description: score.summary, body: renderScoreDetail(score, { showHeading: false }), size: 'full', opts: { source: 'Biology Scores', dashboardId: `biology-score-${score.id}` } }));
  if (waiting.length) widgets.push({ id: 'biology-score-needs-data', title: 'Scores needing more data', description: `${waiting.length} score${waiting.length === 1 ? '' : 's'} not shown in the main list`, body: `<details class="biology-score-unavailable-group"><summary>Show scores that need more markers or a retest</summary>${waiting.map(renderScoreDetail).join('')}</details>`, size: 'full', opts: { source: 'Biology Scores', dashboardId: '' } });
  return widgets;
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
