import type {DashboardWidgetEntry,DashboardWidgetFrameView} from '../js/dashboard-widget-presentation.js';
import type {DashboardActionBarView} from '../js/dashboard-action-bar-presentation.js';
import type {ControlsPreferences} from './dashboard-widget-controls.js';
import type { getStatus, getTrend } from '../js/utils.js';
export interface MobileMarkerReader { values?:unknown; name?:unknown;unit?:unknown;singlePoint?:unknown;singleDateLabel?:unknown }
export interface MobileDataReader { categories?:Record<string,{markers?:Record<string,MobileMarkerReader>|null;label?:unknown}>|null; dates?:{length?:unknown;[index:number]:unknown}|null;dateLabels?:{[index:number]:unknown}|null }
export interface MobileContextReader { data:MobileDataReader;filteredData:MobileDataReader;keyMarkers?:Iterable<{cat:unknown;key:unknown}>|null;trendAlerts:{id:unknown;name?:unknown;concern:unknown;spark?:{join(separator:string):unknown}|null}[];criticalFlags:{id:unknown;status?:unknown;name?:unknown;rawValue?:unknown;unit?:unknown}[] }
export interface MobileSummary {id:string;name:unknown;category:unknown;value:unknown;unit:unknown;date:unknown;status:ReturnType<typeof getStatus>;statusLabel:string;tone:string;trend:ReturnType<typeof getTrend>;values:unknown}
export interface MobileInsight {id?:unknown;tone:string;eyebrow:string;title:unknown;body:unknown;meta:unknown}
export interface MobileMetricReader {latest?:unknown;baseline?:unknown}
export interface MobileWearableReader {metrics?:Record<string,MobileMetricReader>|null;sources?:unknown}
export interface MobileCanonReader {sub?:unknown;unit?:unknown}
// Existing callback invocation operations, not guarantees on Object.assign snapshots.
export interface MobileCallbacks {
 buildDashboardWidgetContext(data:unknown):unknown;
 getDashboardWidgetPrefs():ControlsPreferences;
 getVisibleDashboardWidgetViews(ctx:unknown,prefs:ControlsPreferences):readonly DashboardWidgetEntry[];
 projectDashboardControlButtons(options:{includeReset:unknown}):DashboardActionBarView|null;
 isDashboardOrganizeMode():unknown;
 projectDashboardWidget(entry:DashboardWidgetEntry,prefs:ControlsPreferences,index:number,entries:readonly DashboardWidgetEntry[]):DashboardWidgetFrameView|null;
 setupDropZone():unknown; loadCommitHash():unknown; navigate(route:string):unknown;toggleMobileSidebar():unknown;loadContextCardTips():unknown;
 loadCatalog():{then(callback:(catalog:unknown)=>void):unknown};cacheCatalog(catalog:unknown):unknown;
}
