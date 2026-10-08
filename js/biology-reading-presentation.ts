import type { BiologyRenderScore } from './biology-score-render.js';
import type { ScorePart } from './biology-score-types.js';
import { resolveScoreTone } from './biology-score-engine.js';
import { effectiveMissingMarkers, markerDisplayLabel } from './biology-score-coverage-planner.js';
import { specimenLabel } from './biology-score-panel-policy.js';

export interface BiologyReadingFact { label: string; value: string }
export interface BiologyMarkerReading {
  id: string | null; title: string; label: string; specimen: string;
  result: string; unit: string; range: string; rangeLabel: string; date: string;
  color: string; fit: string; contribution: string;
}
export interface BiologyMarkerSection { core: boolean; rows: BiologyMarkerReading[]; missing: string }
export interface BiologyWeightReading { label: string; family: string; assigned: string; share: string; role: string }
export interface BiologyMethodologyView {
  lead: string; description: string; facts: BiologyReadingFact[]; evidence: string;
  sourceUrl: string | null; algorithm: string; expandedFit: string; weights: BiologyWeightReading[];
}
export type BiologyReadingProps =
  | {kind: 'markers'; sections: BiologyMarkerSection[]}
  | {kind: 'methodology'; view: BiologyMethodologyView}
  | {kind: 'facts'; facts: BiologyReadingFact[]}
  | {kind: 'notes'; flags: readonly string[]};

export function biologyMarkerTitle(item: Partial<ScorePart>) {
  return item.displayValue != null
    ? `${item.label}: ${item.displayValue}${item.unit ? ` ${item.unit}` : ''}`
    : item.label;
}

export function biologyEvidenceBadge(evidence: BiologyRenderScore['evidence']) {
  if (evidence === 'production') return 'Established marker biology · heuristic score';
  if (evidence === 'contextual') return 'Contextual proxy · heuristic score';
  if (evidence === 'experimental') return 'Exploratory pattern · heuristic score';
  return 'Unrated';
}

export function biologyScoreColor(value: BiologyRenderScore['score'], tone: BiologyRenderScore['tone'] = resolveScoreTone(value)) {
  return !Number.isFinite(value) ? 'var(--text-muted)' : tone === 'excellent' || tone === 'good' ? 'var(--green, #34d399)' : tone === 'strained' ? 'var(--yellow, #fbbf24)' : 'var(--red, #f87171)';
}

function rangeText(item: Partial<ScorePart>) {
  const bound = (value: number | null | undefined) => Number.isFinite(value) ? String(Number(Number(value).toPrecision(5))) : '—';
  if (item.range?.min == null && item.range?.max == null) return 'Not available';
  return `${item.range?.min == null ? `≤${bound(item.range?.max)}` : item.range?.max == null ? `≥${bound(item.range?.min)}` : `${bound(item.range.min)}–${bound(item.range.max)}`} ${item.unit || ''}`.trim();
}

export function projectBiologyFacts(facts: readonly (readonly [unknown, unknown])[]): BiologyReadingFact[] {
  return facts.map(([label, value]) => ({label: String(label ?? ''), value: String(value ?? '')}));
}

export function projectBiologyMarkerSections(score: BiologyRenderScore): BiologyMarkerSection[] {
  // Marker contribution retains the original fallback rule. Methodology's
  // configured/effective weight display below deliberately preserves zero.
  const coreWeight = score.available.filter(item => item.core && !item.profileContextOnly).reduce((sum, item) => sum + (item.effectiveWeight || item.weight || 0), 0);
  const row = (item: BiologyRenderScore['available'][number]): BiologyMarkerReading => {
    const weight = item.effectiveWeight || item.weight || 0;
    const impact = item.core && !item.profileContextOnly && coreWeight ? (100 - item.partial!) * weight / coreWeight : null;
    return {
      id: item.id || null, title: biologyMarkerTitle(item) || '', label: markerDisplayLabel(item),
      specimen: [specimenLabel(item), item.method].filter(Boolean).join(' · '),
      result: String(item.displayValue ?? ''), unit: item.unit || '', range: rangeText(item), rangeLabel: item.rangeLabel || '', date: item.date || 'Unknown',
      color: biologyScoreColor(item.profileContextOnly ? null : item.partial), fit: item.profileContextOnly ? 'Context only' : `${Math.round(item.partial!)}/100`,
      contribution: item.contextReason || (impact == null ? item.evidenceRole || 'Additional context' : `−${impact.toFixed(1)} core points`),
    };
  };
  const missing = effectiveMissingMarkers(score);
  return [true, false].map(core => ({core, rows: score.available.filter(item => !!item.core === core).map(row), missing: missing.filter(item => !!item.core === core).map(item => item.coreGroupLabel || item.label).join(', ')}));
}

const methodologyFacts = [
      ['Core score', 'Weighted range fit of available core markers. Related measurements share a capped family weight. Missing core markers make the result provisional.'],
      ['Additional markers', 'Support the core pattern, differ from it, or add a separate dimension. More tests do not automatically mean more confidence.'],
      ['Range fit', 'Within the selected range = 100. Departure reduces fit linearly to a minimum of 0. The number describes range agreement, not a health probability.'],
      ['Collection window', 'Current scores use results from the last 180 days, with core draws within 90 days of each other. Older and mixed-date estimates keep their date labels.'],
] as const;
export function projectBiologyMethodology(score: BiologyRenderScore): BiologyMethodologyView {
  const coreWeight = score.available.filter(item => item.core && !item.profileContextOnly).reduce((sum, item) => sum + (item.effectiveWeight ?? item.weight ?? 0), 0);
  const familyLabel = (value: unknown) => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
  return {
    lead: score.question || score.summary, description: score.methodology || score.summary,
    facts: projectBiologyFacts(methodologyFacts), evidence: biologyEvidenceBadge(score.evidence), sourceUrl: score.sourceUrl || null,
    algorithm: score.algorithmVersion || 'legacy', expandedFit: Number.isFinite(score.refinedScore) ? String(score.refinedScore) : 'unavailable',
    weights: score.available.map(item => ({label: item.label, family: familyLabel(item.evidenceGroup || item.key), assigned: String(item.configuredWeight ?? item.weight ?? 0),
      share: item.core && !item.profileContextOnly && coreWeight ? `${((item.effectiveWeight ?? item.weight ?? 0) / coreWeight * 100).toFixed(1)}%` : '—', role: item.core ? 'Core' : 'Additional'})),
  };
}
