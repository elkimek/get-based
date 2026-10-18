import type { AIVerdictStatus } from './ai-verdict-engine.js';

export interface SessionAIView {
  readonly mode: 'inline' | 'detail';
  readonly status: AIVerdictStatus;
  readonly action: 'refresh-sun-session' | 'refresh-device-session';
  readonly targetId: string;
  readonly targetIdPresent?: boolean;
  readonly actionOwner: string;
  readonly dot: 'green' | 'yellow' | 'red' | 'gray';
  readonly prefix: string;
  readonly tip: string;
  readonly detail: string;
  readonly message: string;
}

type SavedAnalysis = { dot?: unknown; tip?: unknown; detail?: unknown; errorMessage?: unknown };
type SessionAIInput = Pick<SessionAIView, 'mode' | 'status' | 'action' | 'targetId' | 'actionOwner'> & {
  analysis: SavedAnalysis | null | undefined;
};

// Pure projection: request gates, target completeness and persistence stay in adapters.
export function projectSessionAI(input: SessionAIInput): SessionAIView {
  const { analysis, mode, status } = input;
  const raw = analysis?.dot;
  const dot = raw === 'green' || raw === 'yellow' || raw === 'red' ? raw : 'gray';
  const error = analysis?.errorMessage ? `Analysis failed — ${String(analysis.errorMessage)}` : mode === 'inline' ? 'Analysis failed' : 'Analysis failed.';
  return {
    mode, status, dot,
    action: input.action,
    targetId: input.targetId,
    actionOwner: input.actionOwner,
    prefix: dot === 'green' ? '✓' : dot === 'yellow' ? '⚠' : dot === 'red' ? '▲' : '·',
    tip: String(analysis?.tip || ''),
    detail: String(analysis?.detail || ''),
    message: status === 'analyzing' ? mode === 'inline' ? 'Analyzing…' : 'Analyzing this session…'
      : status === 'error' ? error : 'Not analyzed yet.',
  };
}
