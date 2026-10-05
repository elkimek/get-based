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
 getDashboardWidgetPrefs():unknown;
 getVisibleDashboardWidgetEntries(ctx:unknown,prefs:unknown):unknown[];
 renderDashboardControlButtons(options:{includeReset:unknown}):unknown;
 isDashboardOrganizeMode():unknown;
 renderDashboardWidget(entry:unknown,prefs:unknown,index:number,entries:unknown[]):unknown;
 setupDropZone():unknown; loadCommitHash():unknown; navigate(route:string):unknown;toggleMobileSidebar():unknown;loadContextCardTips():unknown;
 loadCatalog():{then(callback:(catalog:unknown)=>void):unknown};cacheCatalog(catalog:unknown):unknown;
}
