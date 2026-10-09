import type {BiologyCompatibilityScore} from './biology-summary-presentation.js';
import type {BiologyRenderScore} from './biology-score-render.js';
import type {BiologyContextSectionView} from './biology-context-presentation.js';
import type {BiologyCoherenceView} from './biology-overview-presentation.js';
import type {BiologyScoreDetailView} from './biology-card-presentation.js';
import type {BiologyNextCheck,BiologyCoverageView} from './biology-planning-presentation.js';
import type {LensWidgetToolsView} from './lens-shell-presentation.js';
import type {LabDateRangeView} from './lab-date-range-presentation.js';
import {groupBiologyScores} from './biology-score-render.js';
import {projectBiologyCoherence} from './biology-overview-presentation.js';
import {projectBiologyScoreDetail} from './biology-card-presentation.js';
import {projectBiologyNextChecks,projectBiologyCoverage} from './biology-planning-presentation.js';
import {projectLabDateRange} from './lab-date-range-presentation.js';
export type BiologyPageGroupKey = 'baseline' | 'advanced' | 'waiting';
export interface BiologyPageCard {id: string; detail: BiologyScoreDetailView; tools: LensWidgetToolsView}
export interface BiologyPageGroup {key: BiologyPageGroupKey; title: string; description: string; emptyText: string; cards: BiologyPageCard[]}
export interface BiologyPageView {
  context: BiologyContextSectionView; range: LabDateRangeView;
  coherence: BiologyCoherenceView | null; checks: BiologyNextCheck[]; coverage: BiologyCoverageView;
  groups: Record<BiologyPageGroupKey,BiologyPageGroup>;
}
export interface BiologyPageInput {
  records: BiologyCompatibilityScore[]; planningScores: BiologyRenderScore[];
  context: BiologyContextSectionView; range: unknown; order: Record<BiologyPageGroupKey,string[]>;
}
const copy = {
  baseline: ['Baseline scores','Flagged patterns and lower scores first; older estimates follow.','No baseline scores available yet. Open Needs inputs below to see what is missing.'],
  advanced: ['Optional scores','Additional perspectives, outside Biological Coherence.','No optional scores available yet. Their marker requirements are under Needs inputs.'],
  waiting: ['Needs inputs','Open Details to see the missing markers or context needed to score.',''],
} as const;
/** Pure composition of independent calculation, context and presentation snapshots. */
export function projectBiologyPage(input: BiologyPageInput): BiologyPageView {
  const byId = new Map(input.records.map(record => [`biology-score-detail-${record.score.id}`,record]));
  const groups = {} as Record<BiologyPageGroupKey,BiologyPageGroup>;
  for(const key of ['baseline','advanced','waiting'] as const){
    const records = input.order[key].map(id => byId.get(id)).filter(record => !!record);
    const [title,description,emptyText] = copy[key];
    groups[key] = {key,title,description,emptyText,cards: records.map((record,index) => ({
      id:`biology-score-detail-${record.score.id}`,detail:projectBiologyScoreDetail(record.score,record.ai),
      tools:{dashboard:record.dashboardToggle,move:records.length >= 2 ? {route:'biology-scores',id:`biology-score-detail-${record.score.id}`,index,count:records.length} : null},
    }))};
  }
  const coherence = input.records.find(record => record.score.id === 'biologicalCoherence');
  const details = input.planningScores.filter(score => score.id !== 'biologicalCoherence');
  const live = details.filter(score => Number.isFinite(score.score)).sort((a,b) => b.score! - a.score!);
  const waiting = details.filter(score => !Number.isFinite(score.score));
  const planningCoherence = input.planningScores.find(score => score.id === 'biologicalCoherence');
  return {context:input.context,range:projectLabDateRange(input.range),groups,
    coherence:coherence ? projectBiologyCoherence(coherence.score,coherence.ai,coherence.dashboardToggle) : null,
    checks:projectBiologyNextChecks(live,waiting,planningCoherence),coverage:projectBiologyCoverage(details,planningCoherence)};
}
export function biologyPageDefaultOrder(records: readonly BiologyCompatibilityScore[]): Record<BiologyPageGroupKey,string[]> {
  const groups = groupBiologyScores(records.map(record => record.score));
  return {baseline:groups.baseline.map(score => `biology-score-detail-${score.id}`),advanced:groups.advanced.map(score => `biology-score-detail-${score.id}`),waiting:groups.waiting.map(score => `biology-score-detail-${score.id}`)};
}
