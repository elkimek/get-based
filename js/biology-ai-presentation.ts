import type {BiologySectionScore, BiologySectionAnswer} from './biology-score-sections.js';
import {resolveScoreTone} from './biology-score-engine.js';

/** Presentation consumes snapshots; request, cache and durable-save owners stay in sections. */
export interface BiologyAIState {
  record: BiologySectionAnswer | null; processing: boolean; refreshReason: string;
  retry: boolean; error: string; encryption: boolean;
}
export interface BiologyQuestionView {question: string; core: string[]; additional: string[]}
export interface BiologyAISummaryView {
  id: string; processing: boolean; color: string; statusLabel: string; status: string;
  summary: string; skeleton: boolean; action: string; label: string; actionLabel: string;
  refreshReason: string; error: string;
}
export interface BiologyAIAnswerView {
  id: string; processing: boolean; heading: string; label: string;
  refreshReason: string; provenance: string; text: string;
}
export type BiologyAIProps =
  | {kind: 'question'; view: BiologyQuestionView}
  | {kind: 'summary'; view: BiologyAISummaryView}
  | {kind: 'answer'; view: BiologyAIAnswerView};

export function projectBiologyQuestion(score: BiologySectionScore): BiologyQuestionView {
  return {question: String(score.question || `What does ${score.title} say about this biology pattern?`),
    core: (score.basicInputs || []).map(value => String(value ?? '')),
    additional: (score.extendedInputs || []).map(value => String(value ?? ''))};
}
export function projectBiologyAISummary(score: BiologySectionScore, state: BiologyAIState): BiologyAISummaryView {
  const {record, processing, refreshReason, error} = state;
  const demo = record?.source === 'demo';
  const summary = typeof record?.summary === 'string' ? record.summary : '';
  const presented = score.historicalSnapshot || score;
  const value = Number.isFinite(presented.score) ? presented.score : ['stale', 'mixed-dates'].includes(presented.recencyStatus!) ? presented.rawScore : null;
  const tone = presented.tone || resolveScoreTone(value!);
  const color = !record?.text || !Number.isFinite(value) ? 'var(--text-muted)' : ['excellent', 'good'].includes(tone!) ? 'var(--green)' : tone === 'strained' ? 'var(--yellow)' : 'var(--red)';
  const overview = score.id === 'biologicalCoherence';
  const retry = overview && state.retry;
  const action = retry ? 'retry-save-score-insights' : overview ? 'update-score-insights' : 'interpret-score-ai';
  const label = demo ? 'Use AI' : retry ? 'Retry saving' : overview ? 'Update missing insights' : record?.text ? 'Refresh' : 'Explain score';
  return {id: score.id, processing, color, action, label, actionLabel: `${label} — ${overview ? 'Biology Scores' : score.title}`,
    statusLabel: processing ? 'Assessing markers' : refreshReason ? 'refresh needed' : demo ? 'Demo insight, generated locally without AI' : record?.text ? 'Saved interpretation' : 'Interpretation not generated',
    status: processing ? 'Assessing' : refreshReason ? 'refresh needed' : demo ? 'Demo insight' : '',
    summary: summary || (record?.text ? 'Refresh to add a short, complete insight. Your full explanation is saved.' : ''),
    skeleton: processing && !summary, refreshReason, error};
}
export function projectBiologyAIAnswer(score: BiologySectionScore, state: BiologyAIState): BiologyAIAnswerView {
  const {record, processing, refreshReason, encryption} = state;
  const demo = record?.source === 'demo';
  const cached = record?.text || '';
  const source = (record?.generation as {modelId?: unknown} | null | undefined)?.modelId;
  const provenance = !record?.updatedAt || demo ? '' : `Saved ${new Date(record.updatedAt as string | number).toLocaleString()}${source ? ` · ${String(source)}` : ''}. Saved with your profile for sync and backups. ${encryption ? 'Local encryption is enabled.' : 'Local encryption is off; enable it in Settings → Data protection.'}`;
  return {id: score.id, processing, heading: demo ? 'Demo explanation' : score.id === 'biologicalCoherence' ? '' : 'AI interpretation',
    label: demo ? 'Explain with AI' : cached ? 'Refresh explanation' : 'Explain score',
    refreshReason, provenance, text: String(cached)};
}
