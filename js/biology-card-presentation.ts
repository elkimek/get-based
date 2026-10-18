import type {BiologyRenderScore} from './biology-score-render.js';
import type {LensDashboardToggleView} from './lens-page-shell-core.js';
import type {BiologyAIState, BiologyAISummaryView, BiologyAIAnswerView} from './biology-ai-presentation.js';
import type {BiologyMarkerSection, BiologyMethodologyView} from './biology-reading-presentation.js';
import {TONE_LABELS, resolveScoreTone, coreScoreDrivers} from './biology-score-engine.js';
import {biologyScoreColor, projectBiologyMarkerSections, projectBiologyMethodology} from './biology-reading-presentation.js';
import {projectBiologyAISummary, projectBiologyAIAnswer} from './biology-ai-presentation.js';

export interface BiologyScoreMetricView {
  value: number | null;
  historical: boolean;
  color: string;
}

export interface BiologyScoreDetailView {
  id: string;
  title: string;
  scope: string;
  status: string;
  sentence: string;
  coverage: string;
  metric: BiologyScoreMetricView;
  membership: {label: string; kind: string} | null;
  aiSummary: BiologyAISummaryView;
  aiAnswer: BiologyAIAnswerView;
  dashboardToggle: LensDashboardToggleView | null;
  history: string;
  boundary: string;
  flags: readonly string[];
  markers: BiologyMarkerSection[];
  methodology: BiologyMethodologyView;
  ratio: {label: string; value: string; date: string} | null;
}

export type BiologyCardProps =
  | {kind: 'metric'; view: BiologyScoreMetricView}
  | {kind: 'detail'; view: BiologyScoreDetailView};

export function getScorePresentation(score: BiologyRenderScore) {
  score = score.historicalSnapshot || score;
  const historical = !Number.isFinite(score.score) && Number.isFinite(score.rawScore)
    && ['stale', 'mixed-dates'].includes(score.recencyStatus as string);
  const value = Number.isFinite(score.score) ? score.score : historical ? score.rawScore : null;
  const dates = [...new Set((score.presentationDates || (score.available || []).filter(i => i.core && !i.profileContextOnly).map(i => i.date)).filter(Boolean))].sort();
  const date = (text: string | undefined) => { const d = new Date(`${text}T00:00:00Z`); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''; };
  const period = dates.length ? dates[0] === dates.at(-1) ? date(dates[0]) : `${date(dates[0])} – ${date(dates.at(-1))}` : '';
  const tone = historical ? score.attention && value! >= 70 ? 'strained' : resolveScoreTone(value) : score.tone;
  const status = historical ? score.recencyStatus === 'mixed-dates' ? 'Mixed-date estimate' : 'Historical score'
    : value == null ? 'Needs markers or context' : score.coverage < 1 ? 'Partial panel' : TONE_LABELS[tone as keyof typeof TONE_LABELS] || 'Range fit';
  return { value, historical, period, tone, status };
}

export function biologyScoreSentence(score: BiologyRenderScore) {
  const presentation = getScorePresentation(score);
  if (presentation.historical) return presentation.period;
  if (!Number.isFinite(score.score)) return score.panelLabel ? `Complete the ${score.panelLabel.toLowerCase()} to score this route.` : 'Review the core markers and collection context in Details.';
  const alerted = score.available.find(i => i.referenceDirection);
  if (alerted) return `${alerted.label} is ${alerted.referenceDirection} its reference range${alerted.profileContextOnly ? ' (context result)' : ''}.`;
  if (score.scoreConfidenceWarning) return score.coverage < 1 ? 'The core panel is incomplete; check the missing inputs in Details.' : 'Collection or profile context limits interpretation; check Details.';
  const weakest = coreScoreDrivers(score)[0]?.item;
  if (weakest?.partial! < 35) return `${weakest!.label} is far from the selected range.`;
  return weakest && weakest.partial < 100 ? `${weakest.label} contributes most to the lower fit.` : 'Core markers align with your selected ranges.';
}

export function projectBiologyScoreMetric(score: BiologyRenderScore): BiologyScoreMetricView {
  const {value, tone, historical} = getScorePresentation(score);
  return {value: value ?? null, historical, color: biologyScoreColor(value, tone)};
}
export function projectBiologyScoreDetail(
  score: BiologyRenderScore,
  ai: BiologyAIState,
  dashboardToggle: LensDashboardToggleView | null = null,
): BiologyScoreDetailView {
  const presentation = getScorePresentation(score);
  const membership = score.overviewMembership;
  return {
    id: score.id,
    title: String(score.title ?? ''),
    scope: String(score.panelLabel || score.scopeLabel || ''),
    status: presentation.status,
    sentence: biologyScoreSentence(score),
    coverage: `${score.coreCovered ?? 0}/${score.coreTotal ?? 0} core · ${score.optionalAvailable ?? 0} additional${score.evidence === 'experimental' ? ' · Exploratory' : ''}`,
    metric: projectBiologyScoreMetric(score),
    membership: membership ? {
      label: membership.label,
      kind: membership.optional ? 'optional' : membership.included ? 'included' : 'excluded',
    } : null,
    aiSummary: projectBiologyAISummary(score, ai),
    aiAnswer: projectBiologyAIAnswer(score, ai),
    dashboardToggle,
    history: presentation.historical
      ? `${presentation.status} · ${presentation.period}. ${score.recencyMessage || 'Not a current, simultaneous panel.'}`
      : '',
    boundary: String(score.boundary || ''),
    flags: score.flags || [],
    markers: projectBiologyMarkerSections(score),
    methodology: projectBiologyMethodology(score),
    ratio: score.descriptiveRatio ? {
      label: String(score.descriptiveRatio.label ?? ''),
      value: String(score.descriptiveRatio.value ?? ''),
      date: String(score.descriptiveRatio.date ?? ''),
    } : null,
  };
}
