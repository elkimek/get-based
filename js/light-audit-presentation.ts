// Presentation-only contracts. Snapshot grading, persistence and actions remain
// owned by light-env-audits.ts; components never read live environment state.
export interface LightAuditSeverityView {
  color: string;
  label: string;
}
export interface LightAuditChannelView {
  key: string;
  label: string;
  text: string;
}
export interface LightAuditRoomView {
  name: string;
  severity: LightAuditSeverityView;
  channels: LightAuditChannelView[];
}
export interface LightAuditDetailView {
  date: string;
  label: string;
  trustedAIHTML: string;
  rooms: LightAuditRoomView[];
}
export interface LightAuditCardView {
  id: string;
  actionId: string | undefined;
  expanded: boolean;
  ariaLabel: string;
  date: string;
  label: string;
  meta: string;
  severity: LightAuditSeverityView;
  trustedDotHTML: string;
  detail: LightAuditDetailView | null;
}

export function auditActionValue(value: unknown): string | undefined {
  return value == null || value === false || value === '' ? undefined : String(value);
}

export interface LightAuditArrowView {
  glyph: string;
  tone: 'good' | 'bad' | 'neutral';
}
export interface LightAuditComparisonRowView {
  label: string;
  title: string | undefined;
  before: string;
  after: string;
  arrow: LightAuditArrowView;
}
export interface LightAuditComparisonRoomView {
  name: string;
  before: LightAuditSeverityView | null;
  after: LightAuditSeverityView | null;
  verdict: 'improved' | 'regressed' | 'measured' | 'unchanged';
  rows: LightAuditComparisonRowView[];
}
export interface LightAuditComparisonView {
  before: string;
  after: string;
  oldId: string | undefined;
  newId: string | undefined;
  hasAI: boolean;
  note: string;
  rooms: LightAuditComparisonRoomView[];
}
export interface LightAuditBlockView {
  open: boolean;
  count: number;
  compareMode: boolean;
  cards: LightAuditCardView[];
  comparison: LightAuditComparisonView | null;
  historyLabel: string;
}

// Preserve channel-specific direction and the caller's proxy deadband. This
// projection does not imply that a higher/lower lux or CCT is universally good.
export function auditComparisonArrow(delta: number, better: string): LightAuditArrowView {
  const glyph = delta < 0 ? '↓' : delta > 0 ? '↑' : '=';
  const improved = better === 'lower' ? delta < 0 : better === 'higher' && delta > 0;
  const regressed = better === 'lower' ? delta > 0 : better === 'higher' && delta < 0;
  return { glyph, tone: improved ? 'good' : regressed ? 'bad' : 'neutral' };
}
