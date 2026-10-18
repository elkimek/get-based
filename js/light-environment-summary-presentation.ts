import type{ReviewAIView}from'./light-review-ai-presentation.js';
// Typed presentation contracts; the existing model/store adapter supplies live values.
export interface EnvironmentSummaryHeader {
  readonly color: string;
  readonly label: string;
  readonly parts: readonly string[];
}
export type EnvironmentSummaryView = EnvironmentSummaryHeader & (
  | { kind: 'load'; interp: string; burden: Readonly<ReviewAIView> | null }
  | { kind: 'assessment'; lead: string; actionLabel: string; hasRooms: boolean;
      metrics: readonly { label: string; value: string; sub: string }[] }
);
