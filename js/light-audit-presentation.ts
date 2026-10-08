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
