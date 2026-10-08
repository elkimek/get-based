import type { BiologyRenderScore } from './biology-score-render.js';
import { buildBiologyScoreCoveragePlannerModel, effectiveContextMarkers, effectiveMissingMarkers, markerDisplayLabel, optionalMarkerReason } from './biology-score-coverage-planner.js';

export interface BiologyNextCheck { label: string; text: string; scoreId?: string | undefined }
export interface BiologyPlanningMarker { label: string; title: string }
export interface BiologyPlanningBundle { title: string; markers: BiologyPlanningMarker[]; emptyText: string }
export interface BiologyCoverageView {
  baselineCoverage: number;
  progress: number;
  baselineIntro: string;
  questions: { label: string; reason: string }[];
  priority: BiologyPlanningBundle | null;
  bundles: BiologyPlanningBundle[];
}
export type BiologyPlanningProps = { kind: 'checks'; rows: BiologyNextCheck[] } | { kind: 'coverage'; view: BiologyCoverageView };

/** Reading priorities preserve the existing score and collection-context rules. */
export function projectBiologyNextChecks(live: readonly BiologyRenderScore[], waiting: readonly BiologyRenderScore[], coherence: BiologyRenderScore | null | undefined = null): BiologyNextCheck[] {
  if (!live.length && !waiting.length) return [];
  const weakest = live.slice().sort((a, b) => a.score! - b.score!)[0];
  const weakestCoherenceDomain = (coherence?.available || [])
    .filter(item => item.primaryScoreId && Number.isFinite(Number(item.partial)))
    .slice()
    .sort((a, b) => Number(a.partial || 0) - Number(b.partial || 0))[0];
  const openFirst = weakestCoherenceDomain
    ? { id: weakestCoherenceDomain.primaryScoreId, title: weakestCoherenceDomain.label }
    : weakest
      ? { id: weakest.id, title: weakest.title }
      : null;
  const lowConfidence = live.filter(score => score.scoreConfidence && score.scoreConfidence !== 'high').sort((a, b) => a.score! - b.score!);
  const stale = waiting.find(score => score.recencyStatus && score.recencyStatus !== 'fresh');
  const nextMissing = lowConfidence
    .flatMap(score => effectiveMissingMarkers(score).filter(item => item.core).map(item => ({ ...item, scoreTitle: score.title })))
    [0]
    || lowConfidence.flatMap(score => effectiveMissingMarkers(score).slice(0, 1).map(item => ({ ...item, scoreTitle: score.title })))[0]
    || waiting.flatMap(score => effectiveMissingMarkers(score).slice(0, 1).map(item => ({ ...item, scoreTitle: score.title })))[0];
  const contextCheck = [...live, ...waiting].filter(s => s.panelTier !== 'extended').flatMap(s => effectiveContextMarkers(s, { unresolvedOnly: true }).filter(i => i.core).map(i => ({ ...i, score: s })))[0];
  return [
    openFirst ? { label: 'Open first', text: `${openFirst.title}: lowest range fit in your available results.`, scoreId: openFirst.id } : null,
    contextCheck ? { label: 'Review collection context', text: `${contextCheck.score.title}: ${markerDisplayLabel(contextCheck)} needs collection or profile details. Check the existing result before ordering more tests.`, scoreId: contextCheck.score.id } : nextMissing ? { label: 'Complete the core panel', text: `${markerDisplayLabel(nextMissing)} would improve coverage${nextMissing.scoreTitle ? ` for ${nextMissing.scoreTitle}` : ''}.` } : null,
    stale ? { label: 'Retest together', text: `${stale.title}: ${stale.recencyBadge || 'some inputs are stale or date-mismatched'}.`, scoreId: stale.id } : null,
  ].filter(row => row !== null);
}

/** Presentation projection; the shared planner remains authoritative for UI and chat. */
export function projectBiologyCoverage(detailScores: readonly BiologyRenderScore[], coherence: BiologyRenderScore | null | undefined): BiologyCoverageView {
  const { baselineCoverage, baselineIntro, coreShortlist, optionalUpgrades, advancedDepth } = buildBiologyScoreCoveragePlannerModel(detailScores, coherence);
  const bundle = (title: string, markers: typeof coreShortlist, emptyText: string): BiologyPlanningBundle => ({title, emptyText,
    markers: markers.map(item => ({label: markerDisplayLabel(item), title: item.contextReason || (!item.core ? optionalMarkerReason(item) : '') || (item.scoreTitle ? `${item.scoreTitle}: ${item.label}` : item.label) || ''})),
  });
  return { baselineCoverage, progress: Math.max(0, Math.min(100, baselineCoverage)), baselineIntro,
    questions: !coreShortlist.length ? optionalUpgrades.slice(0, 2).map(item => ({label: markerDisplayLabel(item), reason: optionalMarkerReason(item)})) : [],
    priority: coreShortlist.length ? bundle('Baseline first', coreShortlist.slice(0, 4), '') : null,
    bundles: [bundle('Baseline first', coreShortlist, 'Baseline core markers covered'), bundle('Optional context', optionalUpgrades, 'No obvious baseline upgrades'), bundle('Optional score panels', advancedDepth, 'Optional score markers covered')],
  };
}
