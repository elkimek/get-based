import {renderHTML} from './components/MobileDashboardPage.svelte.html.js';
import type {DashboardWidgetFrameView} from './dashboard-widget-presentation.js';
import type {DashboardActionBarView} from './dashboard-action-bar-presentation.js';
import type {LabDateRangeView} from './lab-date-range-presentation.js';

/** The controller captures domain reads and effects; these are literal presentation values. */
export interface MobileDashboardStackView {
 readonly count:string;
 readonly actions:DashboardActionBarView|null;
 readonly hasEntries:boolean;
 readonly widgets:readonly (DashboardWidgetFrameView|null)[];
}
export interface MobileDashboardPageView {
 readonly firstName:string;
 readonly greetingSub:string;
 readonly range:LabDateRangeView|null;
 readonly stack:MobileDashboardStackView;
}
export function renderMobileDashboardPage(view:MobileDashboardPageView):string{return renderHTML({view});}
