import type{EnvironmentAIView}from'./light-environment-ai-presentation.js';
// Presentation-only contracts. Snapshot grading, persistence and actions remain
// owned by light-env-audits.ts; components never read live environment state.
export interface LightAuditSeverityView {
  readonly color: string;
  readonly label: string;
}
export interface LightAuditChannelView {
  readonly key: string;
  readonly label: string;
  readonly text: string;
}
export interface LightAuditRoomView {
  readonly name: string;
  readonly severity: LightAuditSeverityView;
  readonly channels: readonly LightAuditChannelView[];
}
export interface LightAuditDetailView {
  readonly date: string;
  readonly label: string;
  readonly ai: Readonly<EnvironmentAIView> | null;
  readonly rooms: readonly LightAuditRoomView[];
}
export interface LightAuditCardView {
  readonly id: string;
  readonly actionId: string | undefined;
  readonly expanded: boolean;
  readonly ariaLabel: string;
  readonly date: string;
  readonly label: string;
  readonly meta: string;
  readonly severity: LightAuditSeverityView;
  readonly aiDot: Readonly<EnvironmentAIView> | null;
  readonly detail: LightAuditDetailView | null;
}

export function auditActionValue(value: unknown): string | undefined {
  return value == null || value === false || value === '' ? undefined : String(value);
}

export interface LightAuditArrowView {
  readonly glyph: string;
  readonly tone: 'good' | 'bad' | 'neutral';
}
export interface LightAuditComparisonRowView {
  readonly label: string;
  readonly title: string | undefined;
  readonly before: string;
  readonly after: string;
  readonly arrow: LightAuditArrowView;
}
export interface LightAuditComparisonRoomView {
  readonly name: string;
  readonly before: LightAuditSeverityView | null;
  readonly after: LightAuditSeverityView | null;
  readonly verdict: 'improved' | 'regressed' | 'measured' | 'unchanged';
  readonly rows: readonly LightAuditComparisonRowView[];
}
export interface LightAuditComparisonView {
  readonly before: string;
  readonly after: string;
  readonly oldId: string | undefined;
  readonly newId: string | undefined;
  readonly hasAI: boolean;
  readonly note: string;
  readonly rooms: readonly LightAuditComparisonRoomView[];
}
export interface LightAuditBlockView {
  readonly open: boolean;
  readonly count: number;
  readonly compareMode: boolean;
  readonly cards: readonly LightAuditCardView[];
  readonly comparison: LightAuditComparisonView | null;
  readonly historyLabel: string;
}

// Preserve channel-specific direction and the caller's proxy deadband. This
// projection does not imply that a higher/lower lux or CCT is universally good.
export function auditComparisonArrow(delta: number, better: string): LightAuditArrowView {
  const glyph = delta < 0 ? '↓' : delta > 0 ? '↑' : '=';
  const improved = better === 'lower' ? delta < 0 : better === 'higher' && delta > 0;
  const regressed = better === 'lower' ? delta > 0 : better === 'higher' && delta < 0;
  return { glyph, tone: improved ? 'good' : regressed ? 'bad' : 'neutral' };
}
