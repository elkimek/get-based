import type {LensHeaderView} from './lens-shell-presentation.js';
import type {LensContentGrid} from './lens-page-shell-core.js';
import type {LabDateRangeView} from './lab-date-range-presentation.js';
import type {LensActionsView} from './lens-content-presentation.js';
import type {DashboardPriorityView} from '../types/dashboard-lab-marker-views.js';
import {lensWidgetHasContent,type LensDataWidgetContent} from './lens-widget-content.js';
export type {LensDataWidgetContent} from './lens-widget-content.js';
export type LensDataPageView =
  | {readonly kind: 'labs-empty'; readonly header: LensHeaderView; readonly range: LabDateRangeView}
  | {readonly kind: 'labs'; readonly header: LensHeaderView; readonly range: LabDateRangeView;
      readonly priority: DashboardPriorityView | null; readonly grid: LensContentGrid<LensDataWidgetContent>}
  | {readonly kind: 'genome' | 'body' | 'insight'; readonly header: LensHeaderView; readonly actions: LensActionsView;
      readonly grid: LensContentGrid<LensDataWidgetContent>};

/** Unloaded/empty feature snapshots retain the existing shared empty state. */
export function lensDataWidgetHasContent(content:LensDataWidgetContent):boolean {
 return lensWidgetHasContent(content);
}
