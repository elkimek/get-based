import {renderHTML} from './components/DashboardKeyTrends.svelte.html.js';
import type {DashboardMiniSparkView} from '../types/dashboard-owned-widgets.js';

export interface DashboardKeyTrendRowView {
  readonly statusClass: string;
  readonly id: string | null;
  readonly accessibleLabel: string;
  readonly dotStatus: string;
  readonly name: string;
  readonly category: string;
  readonly sparkline: DashboardMiniSparkView;
  readonly value: string;
  readonly unit: string;
  readonly trendArrow: string;
  readonly reason: string;
}
export interface DashboardKeyTrendsView {
  readonly rows: readonly DashboardKeyTrendRowView[];
}
export function renderDashboardKeyTrends(view: DashboardKeyTrendsView): string {
  return renderHTML({view});
}
