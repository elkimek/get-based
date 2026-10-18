import {renderHTML} from './components/DashboardLabSummary.svelte.html.js';

export interface DashboardBioAgeView {
  readonly kind: 'bio-age'; readonly interactive: boolean; readonly id: string | null; readonly accessibleLabel: string | null;
  readonly display: string; readonly name: string; readonly chronological: string; readonly difference: string;
  readonly phenoValue: string; readonly bortzValue: string; readonly width: string;
}
export interface DashboardCorrelationPairView {
  readonly directionClass: 'db-correlation-cell-pos' | 'db-correlation-cell-neg'; readonly id: string | null;
  readonly name: string; readonly coefficient: string; readonly value: string; readonly unit: string | null;
}
export type DashboardCorrelationView = Readonly<{kind: 'correlation-empty'}> | Readonly<{
  kind: 'correlations'; target: string; pairs: readonly DashboardCorrelationPairView[];
}>;
export interface DashboardTrendAlertView {
  readonly tone: string; readonly arrow: string; readonly label: string; readonly accessibleLabel: string;
  readonly id: string | null; readonly name: string; readonly category: string; readonly spark: string;
}
export interface DashboardCriticalAlertView {
  readonly tone: string; readonly label: string; readonly accessibleLabel: string; readonly route: string | null;
  readonly name: string; readonly value: string; readonly unit: string; readonly minimum: string; readonly maximum: string;
}
export interface DashboardAlertsView {
  readonly kind: 'alerts'; readonly total: number;
  readonly trends: readonly DashboardTrendAlertView[]; readonly critical: readonly DashboardCriticalAlertView[];
}
export type DashboardLabSummaryView = DashboardBioAgeView | DashboardCorrelationView | DashboardAlertsView;

/** Capture scalar display and action data before the view renders. */
export function summaryText(value: unknown): string { return value == null ? '' : String(value); }
export function summaryAttribute(value: unknown): string | null { return value == null || value === '' ? null : String(value); }
export function renderDashboardLabSummary(view: DashboardLabSummaryView | null): string {
  return view ? renderHTML({view}) : '';
}
