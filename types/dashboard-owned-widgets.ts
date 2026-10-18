import type {DashboardBiometricsOverviewView} from './dashboard-biometric-views.js';
import type {DashboardInsightsView} from './dashboard-insights-view.js';
import type {DashboardSingleMarkerView,DashboardSpotlightView} from './dashboard-lab-marker-views.js';
/** Readonly display values; native services own domain data and actions. */
export interface DashboardMiniSparkView {readonly kind:'empty'|'svg';readonly status:string;readonly points:string;readonly width:number;readonly height:number;readonly cx:string;readonly cy:string}
export interface DashboardQuickMarkerTileView {readonly id:string;readonly statusClass:string;readonly accessibleLabel:string;readonly dotStatus:string;readonly name:string;readonly value:string;readonly unit:string|null;readonly trendArrow:string;readonly sparkline:DashboardMiniSparkView;readonly reason:string}
export interface DashboardQuickMarkersView {readonly kind:'quick-markers';readonly rows:readonly DashboardQuickMarkerTileView[]}
export interface DashboardNoteCardView {readonly index:number;readonly dateLabel:string;readonly preview:string}
export interface DashboardNotesView {readonly kind:'notes';readonly rows:readonly DashboardNoteCardView[]}
export type DashboardOwnedWidgetView=DashboardBiometricsOverviewView|DashboardInsightsView|DashboardQuickMarkersView|DashboardNotesView|DashboardSingleMarkerView|DashboardSpotlightView;
export interface DashboardOwnedWidgetEntry {readonly def:{readonly id:unknown};readonly ownedView?:DashboardOwnedWidgetView}
