// @ts-check
// biology-score-ai.js — embedded AI interpretation for deterministic Biology Scores.

import { isAIPaused } from './api.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from './ai-feature-routing.js';

const biologyScoreAIDeps = {
  callClaudeAPI: callAssistantFeatureAI,
  hasAIProvider: hasAssistantFeatureProvider,
  isAIPaused,
};

export function configureBiologyScoreAIDeps(deps = {}) {
  const previous = { ...biologyScoreAIDeps };
  if (typeof deps.callClaudeAPI === 'function') biologyScoreAIDeps.callClaudeAPI = deps.callClaudeAPI;
  if (typeof deps.hasAIProvider === 'function') biologyScoreAIDeps.hasAIProvider = deps.hasAIProvider;
  if (typeof deps.isAIPaused === 'function') biologyScoreAIDeps.isAIPaused = deps.isAIPaused;
  return previous;
}

/** @param {number | string | null | undefined} value */
function formatRangeBound(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '–';
  return String(Number.parseFloat(n.toPrecision(6)));
}

/** @param {any} item */
function formatTargetRange(item) {
  const min = item?.range && Number.isFinite(item.range.min) ? Number(item.range.min) : null;
  const max = item?.range && Number.isFinite(item.range.max) ? Number(item.range.max) : null;
  if (min == null && max == null) return '';
  const unit = item?.unit ? ` ${item.unit}` : '';
  if (min == null) return `≤${formatRangeBound(max)}${unit}`;
  if (max == null) return `≥${formatRangeBound(min)}${unit}`;
  return `${formatRangeBound(min)}–${formatRangeBound(max)}${unit}`;
}

/** @param {any} score */
function scoreLine(score) {
  const scoreText = Number.isFinite(score.score) ? `${score.score}/100` : 'not current';
  const toneText = score.tone || 'not scored';
  const coverageText = `${Math.round((score.coverage || 0) * 100)}% coverage`;
  const recency = score.recencyStatus && score.recencyStatus !== 'fresh' ? `; recency: ${score.recencyBadge}` : '';
  const used = score.available.map(item => {
    const fit = item.profileContextOnly || !Number.isFinite(item.partial) ? 'context only / excluded from score' : `fit ${Math.round(item.partial)}/100`;
    const target = formatTargetRange(item);
    const rangeLabel = item.rangeLabel || 'scoring range';
    return `${item.label}: ${item.displayValue}${item.unit ? ` ${item.unit}` : ''}${target ? `; ${rangeLabel} ${target}` : ''}, ${fit}, date ${item.date || 'unknown'}`;
  }).join('\n');
  const missing = score.missing.map(item => item.label).join(', ') || 'none';
  const flags = score.flags?.join('\n') || 'none';
  return `Question: ${score.question || ''}\nScore: ${scoreText}; tone: ${toneText}; ${coverageText}${recency}\nMinimum useful panel: ${(score.basicInputs || []).join(', ')}\nExtended confidence panel: ${(score.extendedInputs || []).join(', ')}\nUsed inputs:\n${used || 'none'}\nMissing inputs: ${missing}\nFlags:\n${flags}`;
}

/** @param {any} score */
export async function generateBiologyScoreAIAnswer(score) {
  if (!score) throw new Error('Score not found');
  const hasProvider = biologyScoreAIDeps.hasAIProvider();
  if (!hasProvider) throw new Error('Connect an AI provider first.');
  if (biologyScoreAIDeps.isAIPaused()) throw new Error('AI features are paused.');
  const system = `You explain deterministic getbased Biology Scores. The code already computed the score. Do not recalculate it, diagnose, prescribe, or overclaim. Answer the score question in 3-5 concise bullets. Use only the provided optimal/reference/cycle-phase ranges when describing thresholds; never invent alternate cutoffs or "ideal" ranges. Mention: what the pattern suggests, confidence/coverage limits, missing extended markers if important, and one practical next check/retest direction. Keep it readable for non-expert users.`;
  const { text } = await biologyScoreAIDeps.callClaudeAPI({
    system,
    messages: [{ role: 'user', content: scoreLine(score) }],
    maxTokens: 360,
    forceNonStream: true,
  });
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
