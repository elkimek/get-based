// @ts-nocheck
// biology-score-ai-context.js — compact Biology Scores context for AI chat.

import { computeBiologyScores } from './biology-scores.js';
import { TONE_LABELS } from './biology-score-engine.js';

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
    const missing = score.missing?.slice(0, 3).map(item => item.label).join(', ');
    let line = `- ${score.title}: ${scoreText}, ${toneText}, ${coverageText}${recencyText}`;
    if (impacts.length) line += `; main drags: ${impacts.join('; ')}`;
    const contextFlags = (score.flags || []).filter(flag => /Genetic context|Light context|Body context/i.test(flag)).slice(0, 2);
    if (contextFlags.length) line += `; app context: ${contextFlags.join('; ')}`;
    if (missing) line += `; missing: ${missing}${score.missing.length > 3 ? ', …' : ''}`;
    lines.push(line);
  }
  const baselineScores = scores.filter(score => score.id !== 'biologicalCoherence' && score.panelTier !== 'extended');
  const missingCore = [];
  const seenCore = new Set();
  for (const score of baselineScores) {
    for (const item of (score.missing || []).filter(m => m.core)) {
      const key = item.coreGroup || item.key || item.label;
      if (!key || seenCore.has(key)) continue;
      seenCore.add(key);
      missingCore.push(`${item.label} (${score.title})`);
      if (missingCore.length >= 10) break;
    }
    if (missingCore.length >= 10) break;
  }
  if (missingCore.length) {
    lines.push(`Coverage planning: to improve baseline Biological Coherence first, prioritize missing core markers: ${missingCore.join(', ')}.`);
  } else {
    lines.push('Coverage planning: baseline core Biology Score markers appear covered; advanced/specialty markers are optional depth and should not be treated as required for baseline coherence.');
  }
  lines.push('[/section:biologyScores]');
  return lines.join('\n') + '\n\n';
}
