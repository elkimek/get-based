import type { CoverageScore } from './biology-score-coverage-planner.js';
import type { ScorePart, ScoreResult } from './biology-score-types.js';
import type { parseAnswer, generationDetails } from './biology-score-ai-protocol.js';

export interface AIExplanationScore extends CoverageScore, Pick<ScoreResult, 'score' | 'tone' | 'flags'> {
  available: ScorePart[];
  historicalSnapshot?: AIExplanationScore;
  aiViews?: { score: AIExplanationScore; labels: string[] }[];
  rawScore?: number | null; recencyStatus?: string; recencyBadge?: string;
  algorithmVersion?: string; evidence?: string; scoreConfidenceLabel?: string; boundary?: string;
  methodology?: string; panelLabel?: string; scopeLabel?: string; question?: string;
  basicInputs?: string[]; extendedInputs?: string[];
}
type AIAnswer = NonNullable<ReturnType<typeof parseAnswer>> & { generation: ReturnType<typeof generationDetails> };
interface BiologyAIDeps {
  callClaudeAPI: typeof callAssistantFeatureAI;
  hasAIProvider: typeof hasAssistantFeatureProvider;
  isAIPaused: typeof isAIPaused;
  automaticEnabled: () => boolean;
}
interface BatchOptions { automatic?: boolean; onBatch?: ((group: AIExplanationScore[], result: Awaited<ReturnType<typeof generateBatch>>) => void | Promise<void>) | null; shouldContinue?: () => boolean }

import { configureRuntimeFunctions } from './runtime-callbacks.js';
// biology-score-ai.js — embedded AI interpretation for deterministic Biology Scores.

import { effectiveMissingMarkers } from './biology-score-coverage-planner.js';
import { specimenLabel } from './biology-score-panel-policy.js';
import { isAIPaused } from './api.js';
import { callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getProfiles } from './profile.js';
import { state } from './state.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { AGENT_HOST_MAX_PROMPT_CHARS } from '../shared/agent-host-protocol.js';

// Leave room for transport role labels and response schema. Keep every
// score's complete comparison evidence together; never truncate lab facts.
const REQUEST_CHARS = AGENT_HOST_MAX_PROMPT_CHARS - 4_096;
// Bound latency and output as well as input. A 19-score JSON response is fragile:
// truncation used to lose every answer and automatically purchase a second pass.
const BATCH_CHARS = 24_000;
const BATCH_SCORES = 4;
export function biologyAIRequestOptions() {
  return { reasoningEffort: 'low', strictTokenLimit: true, requestRetries: 0,
    requestTimeoutMs: 120_000, forceNonStream: true, signal: AbortSignal.timeout(120_000) };
}
const incompleteMessage = 'The AI response was incomplete. Saved insights are unchanged; update missing insights to retry.';
const oversizedScoreMessage = 'This score’s comparison is too large for one AI request. Its saved explanation is unchanged; other scores can still refresh.';

const biologyScoreAIDeps: BiologyAIDeps = {
  callClaudeAPI: callAssistantFeatureAI,
  hasAIProvider: hasAssistantFeatureProvider,
  isAIPaused,
  automaticEnabled: () => false,
};

export function configureBiologyScoreAIDeps(deps: Partial<BiologyAIDeps> = {}) {
  return configureRuntimeFunctions(biologyScoreAIDeps, deps, ["callClaudeAPI","hasAIProvider","isAIPaused","automaticEnabled"]);
}

function formatRangeBound(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '–';
  return String(Number.parseFloat(n.toPrecision(6)));
}

function formatTargetRange(item: ScorePart) {
  const min = item?.range && Number.isFinite(item.range.min) ? Number(item.range.min) : null;
  const max = item?.range && Number.isFinite(item.range.max) ? Number(item.range.max) : null;
  if (min == null && max == null) return '';
  const unit = item?.unit ? ` ${item.unit}` : '';
  if (min == null) return `≤${formatRangeBound(max)}${unit}`;
  if (max == null) return `≥${formatRangeBound(min)}${unit}`;
  return `${formatRangeBound(min)}–${formatRangeBound(max)}${unit}`;
}

function singleViewScoreLine(score: AIExplanationScore) {
  score = score.historicalSnapshot || score;
  const scoreText = Number.isFinite(score.score) ? `${score.score}/100` : Number.isFinite(score.rawScore) && ['stale', 'mixed-dates'].includes(score.recencyStatus!) ? `${score.rawScore}/100 (historical ${score.recencyStatus} estimate, not current)` : 'not current';
  const toneText = score.tone || 'not scored';
  const coverageText = `${Math.round((score.coverage || 0) * 100)}% coverage`;
  const recency = score.recencyStatus && score.recencyStatus !== 'fresh' ? `; recency: ${score.recencyBadge}` : '';
  const coreWeight = score.available.filter(i => i.core && !i.profileContextOnly).reduce((n, i) => n + (i.effectiveWeight || 0), 0);
  const used = score.available.map(item => {
    const fit = item.profileContextOnly || !Number.isFinite(item.partial) ? 'context only / excluded from score' : `fit ${Math.round(item.partial!)}/100`;
    const target = formatTargetRange(item);
    const rangeLabel = item.rangeLabel || 'scoring range';
    const contribution = item.core && !item.profileContextOnly && coreWeight ? `; core share ${(100 * item.effectiveWeight! / coreWeight).toFixed(1)}%; −${((100 - item.partial!) * item.effectiveWeight! / coreWeight).toFixed(1)} points` : '';
    const assay = [specimenLabel(item), item.method].filter(Boolean).join(' / ');
    return `${item.label}${assay ? ` [${assay}]` : ''}: ${item.displayValue}${item.unit ? ` ${item.unit}` : ''}${target ? `; ${rangeLabel} ${target}` : ''}, ${fit}, date ${item.date || 'unknown'}; ${item.core ? 'core' : 'additional'}; ${item.contextReason || item.evidenceRole || ''}${contribution}`;
  }).join('\n');
  const missing = effectiveMissingMarkers(score).map(item => `${item.coreGroupLabel || item.label} (${item.core ? 'core requirement' : 'optional context'})`).join(', ') || 'none';
  const flags = score.flags?.join('\n') || 'none';
  return `Model: ${score.algorithmVersion}; ${score.evidence} heuristic. Core status: ${score.scoreConfidenceLabel}. Interpretation boundary: ${score.boundary || ''} ${score.methodology}. Route: ${score.panelLabel || score.scopeLabel || 'core marker pattern'}; headline uses core only. Additional results can support, differ from, or add another dimension to the core pattern; they do not guarantee higher confidence.\nQuestion: ${score.question || ''}\nScore: ${scoreText}; tone: ${toneText}; ${coverageText}${recency}\nMinimum useful panel: ${(score.basicInputs || []).join(', ')}\nAdditional context panel: ${(score.extendedInputs || []).join(', ')}\nUsed inputs:\n${used || 'none'}\nMissing inputs: ${missing}\nFlags:\n${flags}`;
}

export function scoreLine(score: AIExplanationScore) {
  if (!score.aiViews?.length) return singleViewScoreLine(score);
  const [first, ...rest] = score.aiViews;
  const baseline = singleViewScoreLine(first!.score);
  const lines = new Set(baseline.split('\n'));
  return `COMPARISON SCOPE: one interpretation across all the views below. Labels are scoring mode / date filter. All = all results, 1y/6m/3m = selected lookback. Identical views are grouped.\nViews: ${first!.labels.join(', ')}\n${baseline}\n\n${rest.map(view => {
    // Keep only changed lines, so shared marker/context/method text is not
    // repeated for every view. Lines include their own marker labels.
    const presented = view.score.historicalSnapshot || view.score;
    const changes = singleViewScoreLine(view.score).split('\n').filter(line => line && !lines.has(line)).map(line => line.startsWith('Model:')
      ? `Core status: ${presented.scoreConfidenceLabel}; route: ${presented.panelLabel || 'core marker pattern'}.`
      : line);
    return `Views: ${view.labels.join(', ')} — changed values follow (absent inputs are listed under Missing inputs):\n${changes.join('\n') || 'Same interpretation.'}\nComplete flags for this view: ${(view.score.historicalSnapshot || view.score).flags?.join('; ') || 'none'}`;
  }).join('\n\n')}`;
}

export function canAutomaticallyExplainBiologyScores() {
  return !isProfileReadBlocked(state.currentProfile) && biologyScoreAIDeps.automaticEnabled() && biologyScoreAIDeps.hasAIProvider() && !biologyScoreAIDeps.isAIPaused()
    && !getProfiles().find(profile => profile.id === state.currentProfile)?.tags?.includes('demo');
}

function requireProvider() {
  if (!biologyScoreAIDeps.hasAIProvider()) throw new Error('Connect an AI provider first.');
  if (biologyScoreAIDeps.isAIPaused()) throw new Error('AI features are paused.');
}

export async function generateBiologyScoreAIAnswer(score: AIExplanationScore | null | undefined) {
  if (!score) throw new Error('Score not found');
  requireProvider();
  const messages = [{ role: 'user', content: scoreLine(score) }];
  if (messages[0]!.content.length > REQUEST_CHARS) throw new Error(oversizedScoreMessage);
  const identity = getAssistantFeatureIdentity();
  const { system, answerSchema, parseAnswer, generationDetails } = await import('./biology-score-ai-protocol.js');
  const result = await biologyScoreAIDeps.callClaudeAPI({ system, messages, jsonMode: true, jsonSchema: answerSchema, maxTokens: 700, ...biologyAIRequestOptions() }) as { text: string; usage?: unknown };
  const answer = parseAnswer(result.text);
  if (!answer) throw new Error(incompleteMessage);
  return { ...answer, generation: generationDetails(identity, result, 1) };
}

// Share one pass when it fits; large profiles use bounded groups of whole scores.
export async function generateBiologyScoreAIAnswers(scores: readonly AIExplanationScore[], { automatic = false, onBatch = null, shouldContinue = () => true }: BatchOptions = {}) {
  requireProvider();
  const answers: Record<string, AIAnswer> = {};
  const errors: Record<string, string> = {};
  const batches: AIExplanationScore[][] = [];
  const prompts = new Map(scores.map(score => [score.id, `Score ID: ${score.id}\n${scoreLine(score)}`]));
  let batch: AIExplanationScore[] = [], size = 0;
  for (const score of scores) {
    const length = prompts.get(score.id)?.length || 0;
    if (length > REQUEST_CHARS) { errors[score.id] = oversizedScoreMessage; continue; }
    if (batch.length && (batch.length >= BATCH_SCORES || size + 2 + length > BATCH_CHARS)) { batches.push(batch); batch = []; size = 0; }
    size += (size ? 2 : 0) + length; batch.push(score);
  }
  if (batch.length) batches.push(batch);
  let stopped = '';
  for (const group of batches) {
    if (stopped) {
      for (const score of group) errors[score.id] = stopped;
      continue;
    }
    if (!shouldContinue()) {
      for (const score of group) errors[score.id] = 'Profile changed. Return to this profile to refresh its unfinished insights.';
      continue;
    }
    const result = await generateBatch(group, prompts, automatic);
    if (result.requestFailed) stopped = 'AI request failed. Remaining insights were not requested; saved insights are unchanged.';
    try { await onBatch?.(group, result); }
    catch (error) {
      stopped = 'Could not save the explanation. Retry saving before requesting more insights.';
      for (const score of group) {
        delete result.answers[score.id];
        result.errors[score.id] = error instanceof Error ? error.message : 'Could not save the explanation. Please retry.';
      }
    }
    Object.assign(answers, result.answers); Object.assign(errors, result.errors);
  }
  return { answers, errors, failedIds: scores.filter(score => !answers[score.id]).map(score => score.id) };
}

async function generateBatch(scores: readonly AIExplanationScore[], prompts: ReadonlyMap<string, string>, automatic: boolean) {
  const answers: Record<string, AIAnswer> = {}, errors: Record<string, string> = {};
  let requestFailed = false;
  const identity = getAssistantFeatureIdentity();
  try {
    const { system, answerSchema, parseAnswer, parseBatch, generationDetails } = await import('./biology-score-ai-protocol.js');
    const schema = { type: 'object', additionalProperties: false, required: scores.map(s => s.id),
      properties: Object.fromEntries(scores.map(s => [s.id, answerSchema])) };
    const result = await biologyScoreAIDeps.callClaudeAPI({
      system: `${system} For this shared pass, return an object keyed by each requested score ID. Each value has summary and explanation. Keep each score's evidence separate.`,
      messages: [{ role: 'user', content: scores.map(s => prompts.get(s.id)).join('\n\n') }],
      jsonMode: true, jsonSchema: schema, maxTokens: 700 * scores.length,
      ...biologyAIRequestOptions(), consentKind: automatic ? 'automatic-insight' : 'text',
    }) as { text: string; usage?: unknown };
    const parsed = parseBatch(result.text);
    const generation = generationDetails(identity, result, scores.length);
    for (const score of scores) {
      const answer = parseAnswer(JSON.stringify((parsed as Record<string, unknown> | null | undefined)?.[score.id]));
      if (answer) answers[score.id] = { ...answer, generation };
      else errors[score.id] = incompleteMessage;
    }
  } catch (error) {
    requestFailed = true;
    for (const score of scores) errors[score.id] = error instanceof Error ? error.message : incompleteMessage;
  }
  return { answers, errors, requestFailed };
}
