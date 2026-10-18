import type {DashboardMiniSparkView} from './dashboard-owned-widgets.js';
/** Display-only snapshots in native interpolation order; domain services own marker calculations and selection. */
interface MarkerView {readonly id:string;readonly accessibleLabel:string;readonly name:string;readonly value:string;readonly sparkline:DashboardMiniSparkView}
export interface DashboardSingleMarkerView extends MarkerView {readonly kind:'single-marker';readonly widgetId:string;readonly statusClass:string;readonly dotStatus:string;readonly unit:string|null;readonly trendArrow:string;readonly reason:string}
export interface DashboardSpotlightView extends MarkerView {readonly kind:'spotlight';readonly range:string;readonly priority:string;readonly unit:string}
export interface DashboardPriorityView extends MarkerView {readonly kind:'priority';readonly statusClass:string;readonly dotStatus:string;readonly priority:string;readonly unit:string}
export type DashboardLabMarkerView=DashboardSingleMarkerView|DashboardSpotlightView|DashboardPriorityView;
