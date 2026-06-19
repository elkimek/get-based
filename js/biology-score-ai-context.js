// @ts-nocheck
// biology-score-ai-context.js — compact Biology Scores context for AI chat.

import { computeBiologyScores } from './biology-scores.js';
import { TONE_LABELS } from './biology-score-engine.js';
import { buildBiologyScoreCoveragePlannerModel, labelMarkers, markerDisplayLabel } from './biology-score-coverage-planner.js';

export function buildBiologyScoresAIContext(data, options = {}) {
  const scores = computeBiologyScores(data || {});
  const live = scores.filter(score => score.score != null || score.coverage > 0);
  if (live.length === 0) return '';
  const lines = [
    '[section:biologyScores]',
    '## Biology Scores',
    'Deterministic 0-100 derived lab pattern scores. Use as a summary of marker patterns, not as diagnoses. Scores depend on the active range mode.',
  ];
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 7;
  const ordered = live.slice().sort((a, b) => (Number.isFinite(a.score) ? a.score : -1) - (Number.isFinite(b.score) ? b.score : -1));
  for (const score of ordered.slice(0, limit)) {
    const scoreText = Number.isFinite(score.score) ? `${score.score}/100` : 'not current';
    const toneText = score.tone ? TONE_LABELS[score.tone] : 'not scored';
    const coverageText = `${Math.round((score.coverage || 0) * 100)}% coverage`;
    const recencyText = score.recencyStatus && score.recencyStatus !== 'fresh' ? `; ${score.recencyBadge}` : '';
    const impacts = score.available
      .filter(item => !item.profileContextOnly && Number.isFinite(item.partial))
      .map(item => ({ item, impact: Number(item.weight || 0) * (100 - Number(item.partial)) }))
      .sort((a, b) => b.impact - a.impact)
      .filter(row => Number.isFinite(row.impact) && row.impact > 0.05)
      .slice(0, 2)
      .map(row => `${row.item.label} fit ${Math.round(row.item.partial)}/100`);
    const missing = score.missing?.slice(0, 3).map(item => markerDisplayLabel(item)).join(', ');
    let line = `- ${score.title}: ${scoreText}, ${toneText}, ${coverageText}${recencyText}`;
    if (impacts.length) line += `; main drags: ${impacts.join('; ')}`;
    const contextFlags = (score.flags || []).filter(flag => /Genetic context|Light context|Body context/i.test(flag)).slice(0, 2);
    if (contextFlags.length) line += `; app context: ${contextFlags.join('; ')}`;
    if (missing) line += `; missing: ${missing}${score.missing.length > 3 ? ', …' : ''}`;
    lines.push(line);
  }
  const detailScores = scores.filter(score => score.id !== 'biologicalCoherence');
  const coherence = scores.find(score => score.id === 'biologicalCoherence');
  const planner = buildBiologyScoreCoveragePlannerModel(detailScores, coherence);
  const baseline = planner.bundles.baselineFirst.labels.length ? planner.bundles.baselineFirst.labels.join(', ') : planner.bundles.baselineFirst.emptyText;
  const optional = planner.bundles.optionalUpgrades.labels.length ? planner.bundles.optionalUpgrades.labels.join(', ') : planner.bundles.optionalUpgrades.emptyText;
  const advanced = planner.bundles.advancedDepth.labels.length ? planner.bundles.advancedDepth.labels.join(', ') : planner.bundles.advancedDepth.emptyText;
  lines.push(`Coverage planning: use the same Coverage Planner as the UI. Baseline first / best next lab bundle: ${baseline}. Optional upgrades: ${optional}. Advanced depth: ${advanced}. Do not substitute generic tiers or recommend markers already satisfied by equivalent core groups.`);
  const scoreGapLines = planner.scoreRows.slice(0, 6).map(row => `${row.score.title}: ${labelMarkers(row.usefulMissing).join(', ')} (${row.coveragePct}% coverage)`).join('; ');
  if (scoreGapLines) lines.push(`Coverage planner score gaps: ${scoreGapLines}.`);
  lines.push('[/section:biologyScores]');
  return lines.join('\n') + '\n\n';
}
