import type { BiologySectionScore } from './biology-score-sections.js';
import type { ScoreDefinition, ScorePart, ScoringData } from './biology-score-types.js';
import type { finalizeCustomScore } from './biology-score-engine.js';
import type { computeBiologicalCoherence } from './biology-score-coherence.js';
import type { addScoreInterpretation } from './biology-score-methodology.js';

type ComputedScore = ReturnType<typeof finalizeCustomScore>;
type CoherenceScore = ReturnType<typeof computeBiologicalCoherence>;
type InterpretedScore = ReturnType<typeof addScoreInterpretation>;
type RenderMarker = ScorePart & Partial<Pick<CoherenceScore['available'][number], 'primaryScoreId'>>;
/** Native evidence and metadata consumed by the score cards and lens. */
export interface BiologyRenderScore extends Omit<BiologySectionScore,
  'available' | 'missing' | 'historicalSnapshot' | 'presentationDates' | 'title'>,
  Pick<ScoreDefinition, 'title' | 'kicker' | 'summary'>,
  Partial<Pick<ComputedScore, 'coreCovered' | 'coreTotal' | 'optionalAvailable' | 'coverageLabel' | 'scoreConfidenceWarning' | 'refinedScore' | 'recencyMessage'>>,
  Partial<Pick<InterpretedScore, 'descriptiveRatio' | 'sourceUrl'>> {
  coverage: number;
  available: RenderMarker[];
  missing: Array<Pick<ScorePart, 'key' | 'label'> & Partial<ScorePart>>;
  historicalSnapshot?: BiologyRenderScore;
  presentationDates?: CoherenceScore['presentationDates'];
  membership?: CoherenceScore['membership'];
  overviewMembership?: Pick<NonNullable<CoherenceScore['membership']>[number], 'included' | 'optional' | 'label'>;
}
type ScoreContext = { data?: ScoringData | null } | null | undefined;
type ComputeScores = (data: ScoringData) => BiologyRenderScore[];
type ScoreValue = BiologyRenderScore['score'];

// biology-score-render.ts — HTML rendering for Biology Score cards, details, and dashboard/lens widgets.

import {renderHTML as renderOverview} from './components/BiologyOverviewPresentation.svelte.html.js';
import {projectBiologyCoherence, projectBiologyDashboardScore, projectBiologyDashboardCoherence} from './biology-overview-presentation.js';

import {renderHTML as renderCard} from './components/BiologyCardPresentation.svelte.html.js';
import {getScorePresentation, projectBiologyScoreDetail} from './biology-card-presentation.js';
export {getScorePresentation} from './biology-card-presentation.js';

import { renderHTML as renderPlanning } from './components/BiologyPlanningPresentation.svelte.html.js';
import { projectBiologyNextChecks, projectBiologyCoverage } from './biology-planning-presentation.js';
import { biologyMarkerTitle as getMarkerTitle, biologyEvidenceBadge as getEvidenceBadge } from './biology-reading-presentation.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { getBiologyAIState } from './biology-score-sections.js';
import { getBiologyProfileContext } from './profile-context.js';
import { TONE_LABELS, clamp } from './biology-score-engine.js';
import { getLensDashboardToggleView } from './lens-page-shell.js';
import {
  markerDisplayLabel,
} from './biology-score-coverage-planner.js';

function renderMarkerToken(item: Partial<ScorePart>, muted = false) {
  const title = getMarkerTitle(item);
  const label = markerDisplayLabel(item);
  if (item.id && !muted) {
    return `<button type="button" class="biology-score-token" title="${escapeAttr(title)}" data-biology-score-action="open-marker" data-biology-marker-id="${escapeAttr(item.id)}">${escapeHTML(label)}</button>`;
  }
  return `<span class="biology-score-token${muted ? ' biology-score-token-muted' : ''}" title="${escapeAttr(title)}">${escapeHTML(label)}</span>`;
}

function renderScoreStatusItem(kind: string, label: string, value: unknown, tone = '') {
  return `<span class="biology-score-status biology-score-status-${escapeAttr(kind)}${tone ? ` biology-score-status-${escapeAttr(tone)}` : ''}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></span>`;
}

function isDirectionalOnly(score: BiologyRenderScore) {
  const coverage = Number(score?.coverage || 0);
  return score?.evidence === 'experimental' && coverage < 0.25;
}

function getConfidenceFallback(score: BiologyRenderScore) {
  if (score.scoreConfidenceLabel) return { label: score.scoreConfidenceLabel, tone: score.scoreConfidence || 'unknown' };
  if ((score.recencyStatus || 'fresh') !== 'fresh') return { label: 'Retest needed', tone: score.recencyStatus || 'stale' };
  const coverage = Number(score.coverage || 0);
  if (coverage >= 0.8) return { label: 'High confidence', tone: 'high' };
  if (coverage >= 0.55) return { label: 'Medium confidence', tone: 'medium' };
  return { label: 'Low confidence', tone: 'low' };
}

function renderScoreStatusMeta(score: BiologyRenderScore, { weighted = false } = {}) {
  const recencyInvalid = score.recencyStatus && score.recencyStatus !== 'fresh';
  const directional = isDirectionalOnly(score);
  const parts: string[] = [];
  parts.push(renderScoreStatusItem('tone', 'Pattern', directional ? 'Directional only' : recencyInvalid ? 'Retest first' : (score.tone ? TONE_LABELS[score.tone as keyof typeof TONE_LABELS] : 'Need inputs'), directional ? 'directional' : recencyInvalid ? (score.recencyStatus || 'stale') : (score.tone || 'unknown')));
  const coveragePct = Math.round((score.coverage || 0) * 100);
  const coverageLabel = score.coverageLabel || 'low';
  let coverageValue = `${coveragePct}%${weighted ? ' weighted' : ''}`;
  if (directional) coverageValue += ' · thin evidence';
  else if (coveragePct < 45 && !recencyInvalid) coverageValue += ' · partial panel';
  else if (coveragePct === 100) coverageValue += ' · core complete';
  parts.push(renderScoreStatusItem('coverage', 'Coverage', coverageValue, coverageLabel));
  const confidence = getConfidenceFallback(score);
  parts.push(renderScoreStatusItem('confidence', 'Confidence', confidence.label, confidence.tone));
  if (recencyInvalid) parts.push(renderScoreStatusItem('recency', 'Recency', score.recencyBadge || 'Retest needed', score.recencyStatus || 'stale'));
  parts.push(renderScoreStatusItem('evidence', 'Evidence', getEvidenceBadge(score.evidence), score.evidence || 'unknown'));
  return `<div class="biology-score-meta">${parts.join('')}</div>`;
}

function renderScoreRail(score: ScoreValue, tone: BiologyRenderScore['tone']) {
  const left = Number.isFinite(score) ? clamp(score!, 0, 100) : 0;
  return `<div class="biology-score-rail" aria-hidden="true">
    <div class="biology-score-rail-fill"></div>
    ${Number.isFinite(score) ? `<span class="biology-score-pin biology-score-pin-${escapeAttr(tone || 'unknown')}" style="left: calc(${left}% - 5px)"></span>` : ''}
  </div>`;
}

function renderScoreInputs(score: BiologyRenderScore) {
  const available = score.available.slice(0, 4).map((item) => renderMarkerToken(item)).join('');
  const missing = score.missing.slice(0, 4).map((item) => renderMarkerToken(item, true)).join('');
  if (!available && !missing) return '';
  return `<div class="biology-score-inputs">
    ${available ? `<div><span class="biology-score-input-label">Seen</span>${available}</div>` : ''}
    ${missing ? `<div><span class="biology-score-input-label">Missing</span>${missing}${score.missing.length > 4 ? `<span class="biology-score-token biology-score-token-muted">+${score.missing.length - 4}</span>` : ''}</div>` : ''}
  </div>`;
}


// Priority is a reading order, independent of AI state and clinical urgency.
export function groupBiologyScores<Score extends BiologyRenderScore>(scores: readonly Score[]) {
  const groups: { baseline: Score[]; advanced: Score[]; waiting: Score[] } = { baseline: [], advanced: [], waiting: [] };
  const priority = (score: BiologyRenderScore) => {
    const p = getScorePresentation(score);
    return p.historical ? 2 : score.attention || p.value! < 70 ? 0 : 1;
  };
  for (const score of scores.filter(s => s.id !== 'biologicalCoherence')) {
    const group = getScorePresentation(score).value == null ? 'waiting' : score.panelTier === 'extended' ? 'advanced' : 'baseline';
    groups[group].push(score);
  }
  for (const group of [groups.baseline, groups.advanced]) group.sort((a, b) => priority(a) - priority(b) || getScorePresentation(a).value! - getScorePresentation(b).value! || a.title.localeCompare(b.title));
  groups.waiting.sort((a, b) => Number(a.panelTier === 'extended') - Number(b.panelTier === 'extended') || (b.coverage || 0) - (a.coverage || 0) || a.title.localeCompare(b.title));
  return groups;
}



export function renderScoreDetail(score: BiologyRenderScore, options: { showDashboardToggle?: boolean } = {}) {
  const dashboardToggle = options.showDashboardToggle ? getLensDashboardToggleView(`biology-score-${score.id}`) : null;
  return renderCard({kind: 'detail', view: projectBiologyScoreDetail(score, getBiologyAIState(score), dashboardToggle)});
}

function renderScoreCard(score: BiologyRenderScore) {
  const tone = score.tone || 'unknown';
  const scoreValue = String(getScorePresentation(score).value ?? '—');
  return `<article class="biology-score-card biology-score-card-${escapeAttr(tone)}" role="button" tabindex="0" data-biology-score-action="jump-to-domain" data-biology-score-id="${escapeAttr(score.id)}" aria-label="Open ${escapeAttr(score.title)} in Biology Scores lens">
    <div class="biology-score-card-head">
      <div>
        <div class="biology-score-kicker">${escapeHTML(score.kicker)}</div>
        <h4>${escapeHTML(score.title)}</h4>
      </div>
      <div class="biology-score-value"><strong>${escapeHTML(scoreValue)}</strong><span>/100</span></div>
    </div>
    <p class="biology-score-summary">${escapeHTML(score.summary)}</p>
    ${renderScoreRail(score.score, score.tone)}
    ${renderScoreStatusMeta(score)}
    ${renderScoreInputs(score)}
  </article>`;
}

function renderBiologicalCoherenceHero(score: BiologyRenderScore | null | undefined) {
  if (!score) return '';
  const view = projectBiologyCoherence(score, getBiologyAIState(score), getLensDashboardToggleView('biology-score-biologicalCoherence'));
  return renderOverview({kind: 'coherence', view});
}

/**
 * Render helpers that need to call back into the orchestrator receive a compute
 * function instead of importing ./biology-scores.js to avoid ESM circular-import
 * issues in Node/Vitest.
 */

export function renderBiologicalCoherenceLensHero(ctx: ScoreContext, computeBiologyScores: ComputeScores) {
  const coherence = computeBiologyScores((ctx?.data || {}) as ScoringData).find((score) => score.id === 'biologicalCoherence');
  return renderBiologicalCoherenceHero(coherence);
}

export function renderDashboardBiologyScoreWidget(ctx: ScoreContext, scoreId: string, computeBiologyScores: ComputeScores) {
  const score = computeBiologyScores((ctx?.data || {}) as ScoringData).find(item => item.id === scoreId);
  return score ? renderOverview({kind: 'dashboard-score', view: projectBiologyDashboardScore(score)}) : '';
}

export function renderDashboardBiologicalCoherenceWidget(ctx: ScoreContext, computeBiologyScores: ComputeScores) {
  const score = computeBiologyScores((ctx?.data || {}) as ScoringData).find(item => item.id === 'biologicalCoherence');
  return score ? renderOverview({kind: 'dashboard-coherence', view: projectBiologyDashboardCoherence(score)}) : '';
}

/** Legacy summary widget — still exported for backward compatibility. The dashboard
 * now uses renderDashboardBiologyScoreWidget for individual score cards and
 * renderDashboardBiologicalCoherenceWidget for the coherence hero. */
export function renderBiologyScoresWidget(ctx: ScoreContext, computeBiologyScores: ComputeScores) {
  const scores = computeBiologyScores((ctx?.data || {}) as ScoringData);
  const usefulScores = scores.filter((score) => score.score != null || score.coverage > 0);
  const displayScores = usefulScores.length ? usefulScores : scores.slice(0, 4);
  const best = usefulScores.filter((score) => Number.isFinite(score.score)).sort((a, b) => b.score! - a.score!)[0];
  const weakest = usefulScores.filter((score) => Number.isFinite(score.score)).sort((a, b) => a.score! - b.score!)[0];
  const lead = best
    ? `Best current signal: ${best.title} (${best.score}/100). ${weakest && weakest.id !== best.id ? `Most strained: ${weakest.title} (${weakest.score}/100).` : ''}`
    : 'Add labs to turn marker ranges into biology-level pattern scores.';
  return `<div class="biology-scores-widget">
    <div class="biology-scores-hero">
      <div>
        <p>${escapeHTML(lead)}</p>
      </div>
      <span class="biology-scores-count">${usefulScores.length}/${scores.length} live</span>
    </div>
    <div class="biology-score-grid">
      ${displayScores.map(renderScoreCard).join('')}
    </div>
    <p class="biology-scores-note">Educational pattern score only. Score tone reflects the current marker pattern, coverage reflects missing inputs, and staleness is tracked separately.</p>
  </div>`;
}


export function renderBiologyScoresActionSummary(live: readonly BiologyRenderScore[], waiting: readonly BiologyRenderScore[], coherence: BiologyRenderScore | null | undefined = null) {
  const rows = projectBiologyNextChecks(live, waiting, coherence);
  return rows.length ? renderPlanning({kind: 'checks', rows}) : '';
}

export function renderBiologyScoreCoveragePlanner(detailScores: readonly BiologyRenderScore[], coherence: BiologyRenderScore | null | undefined) {
  return renderPlanning({kind: 'coverage', view: projectBiologyCoverage(detailScores, coherence)});
}

export function renderBiologyScoresLens(ctx: ScoreContext, computeBiologyScores: ComputeScores) {
  const scores = computeBiologyScores((ctx?.data || {}) as ScoringData);
  const coherence = scores.find((score) => score.id === 'biologicalCoherence');
  const detailScores = scores.filter((score) => score.id !== 'biologicalCoherence');
  const live = detailScores.filter((score) => Number.isFinite(score.score)).sort((a, b) => b.score! - a.score!);
  const waiting = detailScores.filter((score) => !Number.isFinite(score.score));
  const strongest = live[0];
  const weakest = live.slice().sort((a, b) => a.score! - b.score!)[0];
  const lead = strongest
    ? `Strongest current signal: ${strongest.title} (${strongest.score}/100). ${weakest && weakest.id !== strongest.id ? `Most strained: ${weakest.title} (${weakest.score}/100).` : ''}`
    : 'No overview score is live yet. Import labs or add missing markers to turn raw results into simple biology-level signals.';
  const pc = getBiologyProfileContext();
  const contextLabels = [[pc.lowMuscleMass, 'Low muscle / creatinine unreliable'], [pc.hormoneTherapy, 'Hormone therapy context'], [pc.cycleStatus && pc.cycleStatus !== 'regular', `Cycle: ${pc.cycleStatus}`], [pc.recentHardTraining, 'Recent hard training'], [pc.acuteInflammationContext, 'Acute illness/injury'], [Number.isFinite(pc.ageYears), `Age: ${pc.ageYears}y`]].filter(x => x[0]).map(x => `<span>${escapeHTML(String(x[1]))}</span>`).join('');
  return `<div class="biology-scores-lens">
    <div class="biology-scores-hero biology-scores-lens-hero"><div>
        <p>${escapeHTML(lead)}</p>
        ${contextLabels ? `<div class="biology-score-context-banner"><strong>Active context modifiers</strong>${contextLabels}</div>` : ''}
      </div>
      <span class="biology-scores-count">${live.length}/${detailScores.length} score signals</span></div>
    ${renderBiologicalCoherenceHero(coherence)}
    ${renderBiologyScoresActionSummary(live, waiting, coherence)}
    ${renderBiologyScoreCoveragePlanner(detailScores, coherence)}
    <div class="biology-score-detail-stack">${detailScores.map(score => renderScoreDetail(score, { showDashboardToggle: true })).join('')}</div>
    <p class="biology-scores-note">Educational pattern score only. This is reference/target-pattern coherence, not an outcome-validated diagnosis. Score tone reflects the current marker pattern; confidence reflects core-marker coverage; staleness is tracked separately.</p>
  </div>`;
}
