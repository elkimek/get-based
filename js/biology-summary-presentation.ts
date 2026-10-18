import type {BiologyRenderScore} from './biology-score-render.js';
import type {BiologyAIState} from './biology-ai-presentation.js';
import type {LensDashboardToggleView} from './lens-page-shell-core.js';
import type {BiologyCoherenceView} from './biology-overview-presentation.js';
import type {BiologyScoreDetailView} from './biology-card-presentation.js';
import type {BiologyNextCheck, BiologyCoverageView} from './biology-planning-presentation.js';
import {TONE_LABELS, clamp} from './biology-score-engine.js';
import {getScorePresentation, projectBiologyScoreDetail} from './biology-card-presentation.js';
import {biologyMarkerTitle, biologyEvidenceBadge} from './biology-reading-presentation.js';
import {markerDisplayLabel} from './biology-score-coverage-planner.js';
import {projectBiologyCoherence} from './biology-overview-presentation.js';
import {projectBiologyNextChecks, projectBiologyCoverage} from './biology-planning-presentation.js';

export interface BiologySummaryStatus {kind: string; label: string; value: string; tone: string}
export interface BiologySummaryMarker {id: string | null; label: string; title: string}
export interface BiologySummaryCardView {
  id: string; title: string; kicker: string; summary: string; tone: string;
  value: string; pin: number | null; statuses: BiologySummaryStatus[];
  seen: BiologySummaryMarker[]; missing: BiologySummaryMarker[]; extraMissing: number;
}
export interface BiologySummaryHeroView {lead: string; count: string; labels: string[]; lens: boolean}
export interface BiologySummaryWidgetView {hero: BiologySummaryHeroView; cards: BiologySummaryCardView[]}
export interface BiologyCompatibilityScore {score: BiologyRenderScore; ai: BiologyAIState; dashboardToggle: LensDashboardToggleView | null}
export interface BiologyCompatibilityLensView {
  hero: BiologySummaryHeroView; coherence: BiologyCoherenceView | null;
  checks: BiologyNextCheck[]; coverage: BiologyCoverageView; details: BiologyScoreDetailView[];
}
export type BiologySummaryProps =
  | {kind: 'widget'; view: BiologySummaryWidgetView}
  | {kind: 'lens'; view: BiologyCompatibilityLensView};

const text = (value: unknown): string => value == null ? '' : String(value);
function confidence(score: BiologyRenderScore) {
  if (score.scoreConfidenceLabel) return {label: score.scoreConfidenceLabel, tone: score.scoreConfidence || 'unknown'};
  if ((score.recencyStatus || 'fresh') !== 'fresh') return {label: 'Retest needed', tone: score.recencyStatus || 'stale'};
  const coverage = Number(score.coverage || 0);
  return coverage >= .8 ? {label: 'High confidence', tone: 'high'}
    : coverage >= .55 ? {label: 'Medium confidence', tone: 'medium'} : {label: 'Low confidence', tone: 'low'};
}
export function projectBiologySummaryCard(score: BiologyRenderScore): BiologySummaryCardView {
  const invalid = score.recencyStatus && score.recencyStatus !== 'fresh';
  const directional = score.evidence === 'experimental' && Number(score.coverage || 0) < .25;
  const percentage = Math.round((score.coverage || 0) * 100);
  const coverage = `${percentage}%${directional ? ' · thin evidence' : percentage < 45 && !invalid ? ' · partial panel' : percentage === 100 ? ' · core complete' : ''}`;
  const certainty = confidence(score);
  const statuses: BiologySummaryStatus[] = [
    {kind: 'tone', label: 'Pattern', value: text(directional ? 'Directional only' : invalid ? 'Retest first' : score.tone ? TONE_LABELS[score.tone as keyof typeof TONE_LABELS] : 'Need inputs'), tone: directional ? 'directional' : invalid ? score.recencyStatus || 'stale' : score.tone || 'unknown'},
    {kind: 'coverage', label: 'Coverage', value: coverage, tone: score.coverageLabel || 'low'},
    {kind: 'confidence', label: 'Confidence', value: certainty.label, tone: certainty.tone},
  ];
  if (invalid) statuses.push({kind: 'recency', label: 'Recency', value: text(score.recencyBadge || 'Retest needed'), tone: score.recencyStatus || 'stale'});
  statuses.push({kind: 'evidence', label: 'Evidence', value: biologyEvidenceBadge(score.evidence), tone: score.evidence || 'unknown'});
  const marker = (item: BiologyRenderScore['available'][number] | BiologyRenderScore['missing'][number], muted: boolean): BiologySummaryMarker => ({
    id: item.id && !muted ? text(item.id) : null, label: text(markerDisplayLabel(item)), title: text(biologyMarkerTitle(item)),
  });
  return {
    id: score.id, title: text(score.title), kicker: text(score.kicker), summary: text(score.summary), tone: score.tone || 'unknown',
    value: String(getScorePresentation(score).value ?? '—'), pin: Number.isFinite(score.score) ? clamp(score.score!, 0, 100) : null,
    statuses, seen: score.available.slice(0, 4).map(item => marker(item, false)),
    missing: score.missing.slice(0, 4).map(item => marker(item, true)), extraMissing: Math.max(0, score.missing.length - 4),
  };
}
export function projectBiologySummaryWidget(scores: readonly BiologyRenderScore[]): BiologySummaryWidgetView {
  const useful = scores.filter(score => score.score != null || score.coverage > 0);
  const live = useful.filter(score => Number.isFinite(score.score));
  const best = [...live].sort((a, b) => b.score! - a.score!)[0];
  const weakest = [...live].sort((a, b) => a.score! - b.score!)[0];
  return {
    hero: {lead: best ? `Best current signal: ${best.title} (${best.score}/100). ${weakest && weakest.id !== best.id ? `Most strained: ${weakest.title} (${weakest.score}/100).` : ''}` : 'Add labs to turn marker ranges into biology-level pattern scores.', count: `${useful.length}/${scores.length} live`, labels: [], lens: false},
    cards: (useful.length ? useful : scores.slice(0, 4)).map(projectBiologySummaryCard),
  };
}
export function projectBiologyCompatibilityLens(records: readonly BiologyCompatibilityScore[], labels: readonly string[]): BiologyCompatibilityLensView {
  const coherence = records.find(record => record.score.id === 'biologicalCoherence');
  const detailRecords = records.filter(record => record.score.id !== 'biologicalCoherence');
  const details = detailRecords.map(record => record.score);
  const live = details.filter(score => Number.isFinite(score.score)).sort((a, b) => b.score! - a.score!);
  const waiting = details.filter(score => !Number.isFinite(score.score));
  const strongest = live[0], weakest = [...live].sort((a, b) => a.score! - b.score!)[0];
  return {
    hero: {lead: strongest ? `Strongest current signal: ${strongest.title} (${strongest.score}/100). ${weakest && weakest.id !== strongest.id ? `Most strained: ${weakest.title} (${weakest.score}/100).` : ''}` : 'No overview score is live yet. Import labs or add missing markers to turn raw results into simple biology-level signals.', count: `${live.length}/${details.length} score signals`, labels: [...labels], lens: true},
    coherence: coherence ? projectBiologyCoherence(coherence.score, coherence.ai, coherence.dashboardToggle) : null,
    checks: projectBiologyNextChecks(live, waiting, coherence?.score), coverage: projectBiologyCoverage(details, coherence?.score),
    details: detailRecords.map(record => projectBiologyScoreDetail(record.score, record.ai, record.dashboardToggle)),
  };
}
