import type { AIVerdictStatus } from './ai-verdict-engine.js';
import type { VerdictControlView } from './light-verdict-control.js';
export type ReviewAIKind = 'today' | 'dashboard' | 'weekly' | 'burden';
export type ReviewAIVariant = AIVerdictStatus | 'stale' | 'cached' | 'heuristic' | 'unavailable';
export interface ReviewAIView extends VerdictControlView {
  readonly kind: ReviewAIKind;
  readonly variant: ReviewAIVariant;
  readonly dot: 'green' | 'yellow' | 'red' | 'gray';
  readonly prefix: string;
  readonly tip: string;
  readonly detail: string;
  readonly message: string;
  readonly buttonLabel: string;
  readonly helper: string;
  readonly heuristic: string;
  /** Genuine internal summary, or explicit existing exported caller-owned HTML compatibility. */
  readonly fallback: Readonly<WeeklyFallbackView> | Readonly<WeeklyPublicFallbackView> | null;
  readonly trends: readonly string[];
}
export interface WeeklyFallbackView {
  readonly kind: 'weekly-fallback';
  readonly headline: string;
  readonly comparison: string;
  readonly nextStep: string;
  readonly empty: boolean;
}
declare const publicFallbackOwnership:unique symbol;
/** Existing exported API accepts trusted caller-owned HTML. Ownership is not sanitization. */
export type LightPublicFallbackHTML=string & {readonly [publicFallbackOwnership]:true};
export interface WeeklyPublicFallbackView {readonly kind:'weekly-public-fallback';readonly html:LightPublicFallbackHTML}
export interface DashboardLightFallbackView { readonly kind: 'dashboard-fallback' }
export type ReviewPresentation = ReviewAIView | WeeklyFallbackView | DashboardLightFallbackView;
type SavedAnalysis = Partial<Record<'dot' | 'tip' | 'detail' | 'errorMessage', unknown>>;
const actions = { today: 'refresh-day', dashboard: 'refresh-day', weekly: 'refresh-channel-mix', burden: 'refresh-burden' } as const;

// Data/provider/fingerprint gates and requests belong to the stable adapters.
export function projectReviewAI(input: {
  kind: ReviewAIKind;
  status: AIVerdictStatus;
  variant: ReviewAIVariant;
  analysis: SavedAnalysis | null | undefined;
  actionOwner: string;
  heuristic?: unknown;
  fallback?: Readonly<WeeklyFallbackView> | Readonly<{kind:'public-html';value:unknown}> | null;
  trends?: string[];
}): ReviewAIView {
  const { kind, status, variant, analysis } = input;
  const rawDot = analysis?.dot;
  const dot = rawDot === 'green' || rawDot === 'yellow' || rawDot === 'red' ? rawDot : 'gray';
  const error = analysis?.errorMessage ? `Analysis failed — ${String(analysis.errorMessage)}` : 'Analysis failed.';
  const message = kind === 'today' ? status === 'analyzing' ? 'Synthesizing your day…' : status === 'error' ? error : "Get an AI read on today's full picture — sun, devices, environment, trends."
    : kind === 'dashboard' ? status === 'analyzing' ? "Analyzing today's light…" : status === 'error' ? String(analysis?.errorMessage || 'AI verdict failed — retry') : "✨ Get today's AI verdict"
    : kind === 'weekly' ? status === 'error' ? error : 'Comparing the past two weeks…'
    : 'Analyzing your burden mix…';
  const buttonLabel = kind === 'today' ? status === 'ok' ? '↻' : status === 'error' ? 'Try again' : "Run today's verdict"
    : kind === 'weekly' ? variant === 'ok' ? '↻' : status === 'error' ? 'Try again' : variant === 'stale' ? 'Refresh review' : 'Generate weekly review'
    : kind === 'burden' ? status === 'error' ? 'AI verdict failed — retry' : variant === 'stale' ? 'Refresh AI verdict (your setup changed)' : '✨ Get AI verdict' : '↻';
  return {
    kind, status, variant, mode: 'detail', targetId: '', action: actions[kind], actionOwner: input.actionOwner,
    dot, prefix: dot === 'green' ? '✓' : dot === 'yellow' ? '⚠' : dot === 'red' ? '▲' : '·',
    tip: String(analysis?.tip || ''), detail: String(analysis?.detail || ''), message, buttonLabel,
    helper: variant === 'stale' ? 'Your logs changed since this review was generated.' : 'Compares the past 7 days with the 7 before them.',
    heuristic: String(input.heuristic || ''), fallback: input.fallback?.kind === 'public-html' ? {kind:'weekly-public-fallback',html:String(input.fallback.value || '') as LightPublicFallbackHTML} : input.fallback || null,
    trends: status === 'ok' && dot === 'green' ? [] : (input.trends || []).slice(0, 2),
  };
}
