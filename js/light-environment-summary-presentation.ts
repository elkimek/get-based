// Typed presentation contracts; the existing model/store adapter supplies live values.
export interface EnvironmentSummaryHeader {
  color: string;
  label: string;
  parts: readonly string[];
}
export type EnvironmentSummaryView = EnvironmentSummaryHeader & (
  | { kind: 'load'; interp: string; trustedBurdenHTML: string | null }
  | { kind: 'assessment'; lead: string; actionLabel: string; hasRooms: boolean;
      metrics: readonly { label: string; value: string; sub: string }[] }
);
