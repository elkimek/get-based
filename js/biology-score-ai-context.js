// @ts-nocheck
// biology-score-ai-context.js — compact Biology Scores context for AI chat.

import { computeBiologyScores } from './biology-scores.js';
import { TONE_LABELS } from './biology-score-engine.js';
import { buildBiologyScoreCoveragePlannerModel, labelMarkers, markerDisplayLabel } from './biology-score-coverage-planner.js';

function summarizeContextFlag(flag) {
  const text = String(flag || '');
  if (/Light context/i.test(text)) return 'Light context considered.';
  if (/Genetic context/i.test(text)) return 'Genetic context considered.';
  if (/Body context/i.test(text)) return 'Body/wearable context considered.';
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

function shortList(labels, max = 5) {
  const list = (labels || []).filter(Boolean);
  if (!list.length) return '';
  return `${list.slice(0, max).join(', ')}${list.length > max ? ', …' : ''}`;
}

export function buildBiologyScoresAIContext(data, options = {}) {
  const scores = computeBiologyScores(data || {});
  const live = scores.filter(score => score.score != null || score.coverage > 0);
  if (live.length === 0) return '';
  const lines = [
    '[section:biologyScores]',
    '## Biology Scores',
    'Deterministic 0-100 derived lab pattern scores; not diagnoses.',
  ];
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 5;
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
      .slice(0, 1)
      .map(row => `${row.item.label} ${Math.round(row.item.partial)}/100`);
    const missing = shortList(score.missing?.map(item => markerDisplayLabel(item)), 2);
    let line = `- ${score.title}: ${scoreText}, ${toneText}, ${coverageText}${recencyText}`;
    if (impacts.length) line += `; drag: ${impacts.join('; ')}`;
    const contextFlags = (score.flags || []).filter(flag => /Genetic context|Light context|Body context/i.test(flag)).slice(0, 1).map(summarizeContextFlag);
    if (contextFlags.length) line += `; context: ${contextFlags.join('; ')}`;
    if (missing) line += `; missing: ${missing}`;
    lines.push(line);
  }
  const detailScores = scores.filter(score => score.id !== 'biologicalCoherence');
  const coherence = scores.find(score => score.id === 'biologicalCoherence');
  const planner = buildBiologyScoreCoveragePlannerModel(detailScores, coherence);
  const baseline = shortList(planner.bundles.baselineFirst.labels, 5) || planner.bundles.baselineFirst.emptyText;
  const optional = shortList(planner.bundles.optionalUpgrades.labels, 5) || planner.bundles.optionalUpgrades.emptyText;
  const advanced = shortList(planner.bundles.advancedDepth.labels, 6) || planner.bundles.advancedDepth.emptyText;
  lines.push(`Coverage planning: use the same Coverage Planner as the UI. Baseline first: ${baseline}. Optional: ${optional}. Advanced: ${advanced}. Do not recommend markers already satisfied by equivalent core groups.`);
  const scoreGapLines = planner.scoreRows.slice(0, 4).map(row => `${row.score.title}: ${shortList(labelMarkers(row.usefulMissing), 3)} (${row.coveragePct}% coverage)`).join('; ');
  if (scoreGapLines) lines.push(`Coverage planner score gaps: ${scoreGapLines}.`);
  lines.push('[/section:biologyScores]');
  return lines.join('\n') + '\n\n';
}
