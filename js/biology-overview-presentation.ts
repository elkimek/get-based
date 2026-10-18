import type {BiologyRenderScore} from './biology-score-render.js';
import type {BiologyAIState, BiologyAISummaryView, BiologyAIAnswerView} from './biology-ai-presentation.js';
import type {BiologyScoreMetricView} from './biology-card-presentation.js';
import type {BiologyReadingFact} from './biology-reading-presentation.js';
import type {LensDashboardToggleView} from './lens-page-shell-core.js';
import {clamp} from './biology-score-engine.js';
import {getScorePresentation, biologyScoreSentence, projectBiologyScoreMetric} from './biology-card-presentation.js';
import {biologyScoreColor, projectBiologyFacts} from './biology-reading-presentation.js';
import {projectBiologyAISummary, projectBiologyAIAnswer} from './biology-ai-presentation.js';

export interface BiologyOverviewDomain {
  id: string;
  label: string;
  value: number;
  width: number;
  color: string;
}
export interface BiologyContributor {
  id: string;
  title: string;
  sharedBloodDomain: boolean;
  included: boolean;
  label: string;
}
export interface BiologyContributorsView {
  included: number;
  rows: BiologyContributor[];
}
export interface BiologyCoherenceView {
  metric: BiologyScoreMetricView;
  explanation: string;
  coverage: string;
  aiSummary: BiologyAISummaryView;
  aiAnswer: BiologyAIAnswerView;
  domains: BiologyOverviewDomain[];
  contributors: BiologyContributorsView;
  facts: BiologyReadingFact[];
  flags: readonly string[];
  dashboardToggle: LensDashboardToggleView | null;
}
export interface BiologyDashboardScoreView {
  id: string;
  title: string;
  value: number | string;
  status: string;
  meta: string;
  detail: string;
  width: string;
  color: string;
}
export interface BiologyDashboardDomain {
  id: string;
  label: string;
  title: string;
  width: number;
  value: number;
  color: string;
  tone: 'good' | 'fair' | 'poor';
}
export interface BiologyDashboardCoherenceView {
  headline: BiologyDashboardScoreView;
  domains: BiologyDashboardDomain[];
}
export type BiologyOverviewProps =
  | {kind: 'coherence'; view: BiologyCoherenceView}
  | {kind: 'dashboard-score'; view: BiologyDashboardScoreView}
  | {kind: 'dashboard-coherence'; view: BiologyDashboardCoherenceView};

export function projectBiologyContributors(score: BiologyRenderScore): BiologyContributorsView {
  const rows = (score.membership || []).map(item => ({
    id: item.id,
    title: item.title,
    sharedBloodDomain: item.domain === 'blood',
    included: item.included,
    label: item.label,
  }));
  return {included: rows.filter(item => item.included).length, rows};
}

export function projectBiologyCoherence(
  source: BiologyRenderScore,
  ai: BiologyAIState,
  dashboardToggle: LensDashboardToggleView | null,
): BiologyCoherenceView {
  const score = source.historicalSnapshot || source;
  const domains = (score.available || []).filter(item => Number.isFinite(item.partial));
  const presentation = getScorePresentation(score);
  return {
    metric: projectBiologyScoreMetric(score),
    explanation: score.anchorWarning || (presentation.historical
      ? `${presentation.status} · ${presentation.period}`
      : score.coverage < 1 ? 'Your available core domains, brought together.' : 'Your core domains at a glance.'),
    coverage: `${domains.length}/${domains.length + score.missing.length} domains · ${Math.round(score.coverage * 100)}% core coverage`,
    aiSummary: projectBiologyAISummary(source, ai),
    aiAnswer: projectBiologyAIAnswer(source, ai),
    domains: domains.map(item => ({
      id: item.primaryScoreId || '',
      label: item.label,
      value: item.partial!,
      width: clamp(item.partial!, 0, 100),
      color: biologyScoreColor(item.partial),
    })),
    contributors: projectBiologyContributors(source),
    facts: projectBiologyFacts([
      ['What is combined', '13 baseline scores form 12 domains: Iron Handling and Blood Flow Context share one domain. An overview needs at least 3 domains and 25% core coverage. Available domain results remain visible below that threshold. Excluded domains remain reflected in coverage; open Overview contributors to see exactly which scores are included.'],
      ['What the colors mean', 'Green: strong range fit (70–100). Amber: review pattern (50–69). Red: lower range fit (0–49). These describe range agreement, not clinical severity.'],
      ['Coverage stays separate', 'Missing core inputs reduce coverage. Additional tests add context without increasing a domain’s vote. Five optional scores stay outside the baseline.'],
      ['Dates stay visible', presentation.historical ? `${presentation.status}: ${presentation.period}. This estimate combines the available historical results, not a current simultaneous panel.` : 'Current domains use the collection-date limits. Historical and mixed-date estimates are labeled separately.'],
    ]),
    flags: score.flags || [],
    dashboardToggle,
  };
}

function dashboardHeadline(score: BiologyRenderScore, meta: string, detail: string): BiologyDashboardScoreView {
  const presentation = getScorePresentation(score);
  const tone = presentation.tone;
  return {
    id: score.id,
    title: score.title,
    value: presentation.value ?? '—',
    status: presentation.status,
    meta,
    detail,
    width: (Number.isFinite(presentation.value) ? clamp(presentation.value!, 0, 100) : 0).toFixed(0),
    color: tone === 'excellent' || tone === 'good' ? 'var(--green, #22c55e)'
      : tone === 'strained' ? 'var(--yellow, #f59e0b)'
        : tone === 'poor' || tone === 'concerning' || tone === 'severe' ? 'var(--red, #ef4444)' : 'var(--text-muted)',
  };
}

export function projectBiologyDashboardScore(score: BiologyRenderScore): BiologyDashboardScoreView {
  const presentation = getScorePresentation(score);
  const meta = `${score.coreCovered ?? 0}/${score.coreTotal ?? 0} core${score.overviewMembership ? ` · ${score.overviewMembership.label}` : ''}`;
  const detail = presentation.historical ? `${presentation.period}. Open to review the markers.` : biologyScoreSentence(score);
  return dashboardHeadline(score, meta, detail);
}

export function projectBiologyDashboardCoherence(source: BiologyRenderScore): BiologyDashboardCoherenceView {
  const score = source.historicalSnapshot || source;
  const domains = (score.available || []).filter(item => Number.isFinite(item.partial))
    .sort((a, b) => Number(b.partial || 0) - Number(a.partial || 0));
  const weakest = domains.slice().sort((a, b) => Number(a.partial || 0) - Number(b.partial || 0))[0];
  const missingCount = score.missing?.length || 0;
  const presentation = getScorePresentation(score);
  const meta = `${domains.length}/${domains.length + missingCount} domains${presentation.historical ? ` · ${presentation.period}` : ''}`;
  const insight = weakest ? `Review first: ${weakest.label} (${weakest.partial}/100).` : 'Open Biology Scores to review missing markers or collection context.';
  return {
    headline: dashboardHeadline(score, meta, insight),
    domains: domains.map(item => {
      const pct = clamp(Number(item.partial || 0), 0, 100);
      return {
        id: item.primaryScoreId || '',
        label: item.label,
        title: item.primaryScoreId ? `Jump to ${item.label} score` : `${item.label} — no individual score available yet`,
        width: pct,
        value: Math.round(pct),
        color: biologyScoreColor(pct),
        tone: pct >= 70 ? 'good' : pct >= 50 ? 'fair' : 'poor',
      };
    }),
  };
}
