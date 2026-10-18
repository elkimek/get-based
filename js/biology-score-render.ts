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

// Public synchronous HTML facades; typed Svelte components own all Biology presentation.

import {renderHTML as renderOverview} from './components/BiologyOverviewPresentation.svelte.html.js';
import {projectBiologyCoherence, projectBiologyDashboardScore, projectBiologyDashboardCoherence} from './biology-overview-presentation.js';

import {renderHTML as renderCard} from './components/BiologyCardPresentation.svelte.html.js';
import {getScorePresentation, projectBiologyScoreDetail} from './biology-card-presentation.js';
export {getScorePresentation} from './biology-card-presentation.js';

import { renderHTML as renderPlanning } from './components/BiologyPlanningPresentation.svelte.html.js';
import { projectBiologyNextChecks, projectBiologyCoverage } from './biology-planning-presentation.js';
import {renderHTML as renderSummary} from './components/BiologySummaryPresentation.svelte.html.js';
import {projectBiologySummaryWidget, projectBiologyCompatibilityLens} from './biology-summary-presentation.js';
import {projectBiologyContextLabels} from './biology-context-presentation.js';
import { getBiologyAIState } from './biology-score-sections.js';
import { getBiologyProfileContext } from './profile-context.js';
import { getLensDashboardToggleView } from './lens-page-shell-core.js';

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

export function projectDashboardBiologyScoreWidget(ctx: ScoreContext, scoreId: string, computeBiologyScores: ComputeScores) {
  const score = computeBiologyScores((ctx?.data || {}) as ScoringData).find(item => item.id === scoreId);
  return score ? projectBiologyDashboardScore(score) : null;
}
export function projectDashboardBiologicalCoherenceWidget(ctx: ScoreContext, computeBiologyScores: ComputeScores) {
  const score = computeBiologyScores((ctx?.data || {}) as ScoringData).find(item => item.id === 'biologicalCoherence');
  return score ? projectBiologyDashboardCoherence(score) : null;
}
export function renderDashboardBiologyScoreWidget(ctx: ScoreContext, scoreId: string, computeBiologyScores: ComputeScores) {
  const view = projectDashboardBiologyScoreWidget(ctx, scoreId, computeBiologyScores);
  return view ? renderOverview({kind: 'dashboard-score', view}) : '';
}
export function renderDashboardBiologicalCoherenceWidget(ctx: ScoreContext, computeBiologyScores: ComputeScores) {
  const view = projectDashboardBiologicalCoherenceWidget(ctx, computeBiologyScores);
  return view ? renderOverview({kind: 'dashboard-coherence', view}) : '';
}

/** Legacy summary widget — still exported for backward compatibility. The dashboard
 * now uses renderDashboardBiologyScoreWidget for individual score cards and
 * renderDashboardBiologicalCoherenceWidget for the coherence hero. */
export function renderBiologyScoresWidget(ctx: ScoreContext, computeBiologyScores: ComputeScores) {
  const scores = computeBiologyScores((ctx?.data || {}) as ScoringData);
  return renderSummary({kind: 'widget', view: projectBiologySummaryWidget(scores)});
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
  const labels = projectBiologyContextLabels(getBiologyProfileContext());
  const coherence = scores.find(score => score.id === 'biologicalCoherence');
  const ordered = [...(coherence ? [coherence] : []), ...scores.filter(score => score.id !== 'biologicalCoherence')];
  const records = ordered.map(score => ({score, ai: getBiologyAIState(score), dashboardToggle: getLensDashboardToggleView(`biology-score-${score.id}`)}));
  return renderSummary({kind: 'lens', view: projectBiologyCompatibilityLens(records, labels)});
}
