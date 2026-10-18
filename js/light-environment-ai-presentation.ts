import type { AIVerdictStatus } from './ai-verdict-engine.js';
import type { VerdictControlView } from './light-verdict-control.js';
import type { SessionAIView } from './light-session-ai-presentation.js';

export type EnvironmentAIKind = 'measurement' | 'room' | 'screen' | 'audit' | 'audit-dot';
type SavedAnalysis = { dot?: unknown; tip?: unknown; detail?: unknown; errorMessage?: unknown };
export interface EnvironmentAIView extends VerdictControlView {
  readonly kind: EnvironmentAIKind;
  readonly dot: SessionAIView['dot'];
  readonly prefix: string;
  readonly tip: string;
  readonly detail: string;
  readonly message: string;
  readonly buttonLabel: string;
}
const actions = {
  measurement: 'refresh-measurement', room: 'refresh-room', screen: 'refresh-screen',
  audit: 'refresh-audit', 'audit-dot': 'refresh-audit',
} as const;
const copy = {
  measurement: { analyzing: 'Analyzing…', idle: '', button: 'Get AI verdict' },
  room: { analyzing: 'Checking this room…', idle: 'Circadian-friendliness check for this room.', button: 'Analyze' },
  screen: { analyzing: 'Analyzing this screen…', idle: 'Get a circadian-impact verdict for this screen.', button: 'Analyze screen' },
  audit: { analyzing: 'Synthesizing this audit…', idle: 'Get a circadian-friendliness verdict for this entire snapshot.', button: 'Analyze audit' },
  'audit-dot': { analyzing: '', idle: '', button: '' },
};

// Request/provider gates, fingerprints and auto-fire remain owned by adapters.
export function projectEnvironmentAI(input: {
  kind: EnvironmentAIKind;
  status: AIVerdictStatus;
  targetId: string;
  actionOwner: string;
  analysis: SavedAnalysis | null | undefined;
}): EnvironmentAIView {
  const { kind, status, analysis } = input;
  const rawDot = analysis?.dot;
  const dot = rawDot === 'green' || rawDot === 'yellow' || rawDot === 'red' ? rawDot : 'gray';
  const labels = copy[kind];
  const error = kind === 'measurement' ? 'Analysis failed'
    : analysis?.errorMessage ? `Analysis failed — ${String(analysis.errorMessage)}` : 'Analysis failed.';
  return {
    kind, status, dot, action: actions[kind], targetId: input.targetId, actionOwner: input.actionOwner,
    mode: kind === 'measurement' ? 'inline' : 'detail',
    prefix: dot === 'green' ? '✓' : dot === 'yellow' ? '⚠' : dot === 'red' ? '▲' : '·',
    tip: String(analysis?.tip || ''), detail: String(analysis?.detail || ''),
    message: status === 'analyzing' ? labels.analyzing : status === 'error' ? error : labels.idle,
    buttonLabel: status === 'ok' || kind === 'measurement' && status === 'error' ? '↻'
      : status === 'error' ? 'Try again' : labels.button,
  };
}
