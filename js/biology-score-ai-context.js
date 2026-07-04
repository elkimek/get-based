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

function scoreSectionName(label) {
  const words = String(label || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (!words.length) return '';
  return words.map((word, index) => {
    const text = word.replace(/[^a-z0-9]/gi, '');
    if (!text) return '';
    const lower = text.charAt(0).toLowerCase() + text.slice(1);
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');
}

function scoreSectionAliases(score) {
  const aliases = [scoreSectionName(score.title), score.id];
  if (score.id === 'oneCarbonCoherence') aliases.push('oneCarbon');
  if (score.id === 'redoxStress') aliases.push('inflammation');
  return aliases.filter(Boolean);
}

function formatBiologyScoreLine(score) {
  const scoreText = Number.isFinite(score.score) ? `${score.score}/100` : 'not current';
  const toneText = score.tone ? TONE_LABELS[score.tone] : 'not scored';
  const coverageText = `${Math.round((score.coverage || 0) * 100)}% coverage`;
  const recencyText = score.recencyStatus && score.recencyStatus !== 'fresh' ? `; ${score.recencyBadge}` : '';
  const impacts = (score.available || [])
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
  return line;
}

function formatBiologicalCoherenceLine(score) {
  if (!score) return '';
  const scoreText = Number.isFinite(score.score) ? `${score.score}/100` : 'not currently scored';
  const toneText = score.tone ? TONE_LABELS[score.tone] : 'not scored';
  const coverageText = `${Math.round((score.coverage || 0) * 100)}% domain coverage`;
  const domainSummary = (score.flags || []).find(flag => /minimum domains live/i.test(flag));
  const weakest = (score.available || [])
    .filter(item => Number.isFinite(item.partial))
    .slice()
    .sort((a, b) => Number(a.partial) - Number(b.partial))
    .slice(0, 2)
    .map(item => `${item.label} ${Math.round(item.partial)}/100`);
  const missing = shortList((score.missing || []).map(item => item.label), 3);
  let line = `- Biological Coherence: ${scoreText}, ${toneText}, ${coverageText}`;
  if (domainSummary) line += `; ${domainSummary}`;
  if (weakest.length) line += `; weakest domains: ${weakest.join(', ')}`;
  if (missing) line += `; missing domains: ${missing}`;
  return line;
}

function appendAgentScoreSections(lines, scores, usedSections) {
  const ordered = scores
    .filter(score => score.id !== 'biologicalCoherence' && (score.score != null || score.coverage > 0))
    .slice()
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  const primaryNames = [];
  for (const score of ordered) {
    const aliases = scoreSectionAliases(score);
    if (aliases[0]) primaryNames.push(aliases[0]);
    const scoreLine = formatBiologyScoreLine(score);
    for (const name of aliases) {
      const key = name.toLowerCase();
      if (usedSections.has(key)) continue;
      usedSections.add(key);
      lines.push(
        '',
        `[section:${name}]`,
        `## ${score.title}`,
        'Biology Score subscore; same value shown in the Biology Scores UI.',
        scoreLine,
        `[/section:${name}]`
      );
    }
  }
  return primaryNames;
}

export function buildBiologyScoresAIContext(data, options = {}) {
  const scores = computeBiologyScores(data || {}, options);
  const coherence = scores.find(score => score.id === 'biologicalCoherence');
  const live = scores.filter(score => score.id !== 'biologicalCoherence' && (score.score != null || score.coverage > 0));
  if (live.length === 0 && !(coherence && (coherence.score != null || coherence.coverage > 0))) return '';
  const coherenceLine = coherence ? formatBiologicalCoherenceLine(coherence) : '';
  const lines = [
    '[section:biologyScores]',
    '## Biology Scores',
    'Deterministic 0-100 derived lab pattern scores; not diagnoses.',
  ];
  if (coherenceLine) lines.push(coherenceLine);
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 5;
  const ordered = live.slice().sort((a, b) => (Number.isFinite(a.score) ? a.score : -1) - (Number.isFinite(b.score) ? b.score : -1));
  for (const score of ordered.slice(0, limit)) {
    lines.push(formatBiologyScoreLine(score));
  }
  const detailScores = scores.filter(score => score.id !== 'biologicalCoherence');
  const planner = buildBiologyScoreCoveragePlannerModel(detailScores, coherence);
  const baseline = shortList(planner.bundles.baselineFirst.labels, 5) || planner.bundles.baselineFirst.emptyText;
  const optional = shortList(planner.bundles.optionalUpgrades.labels, 5) || planner.bundles.optionalUpgrades.emptyText;
  const advanced = shortList(planner.bundles.advancedDepth.labels, 6) || planner.bundles.advancedDepth.emptyText;
  lines.push(`Coverage planning: use the same Coverage Planner as the UI. Baseline first: ${baseline}. Optional: ${optional}. Advanced: ${advanced}. Do not recommend markers already satisfied by equivalent core groups.`);
  const scoreGapLines = planner.scoreRows.slice(0, 4).map(row => `${row.score.title}: ${shortList(labelMarkers(row.usefulMissing), 3)} (${row.coveragePct}% coverage)`).join('; ');
  if (scoreGapLines) lines.push(`Coverage planner score gaps: ${scoreGapLines}.`);
  lines.push('[/section:biologyScores]');
  const usedSections = new Set(['biologyscores']);
  if (coherenceLine) {
    lines.push(
      '',
      '[section:biologicalCoherence]',
      '## Biological Coherence',
      'System-level Biology Scores aggregate; same value shown in the Biology Scores UI.',
      coherenceLine,
      '[/section:biologicalCoherence]',
      '',
      '[section:biologyCoherence]',
      '## Biology Coherence',
      'Alias for Biological Coherence; same system-level Biology Scores aggregate shown in the UI.',
      coherenceLine,
      '[/section:biologyCoherence]'
    );
    usedSections.add('biologicalcoherence');
    usedSections.add('biologycoherence');
  }
  if (options.includeScoreSections || options.ignoreContextToggles) {
    const primaryNames = appendAgentScoreSections(lines, scores, usedSections);
    if (primaryNames.length) {
      lines.splice(3, 0, `Individual Biology Score sections are available by name, including: ${shortList(primaryNames, 12)}.`);
    }
  }
  return lines.join('\n') + '\n\n';
}
