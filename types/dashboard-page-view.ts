import type {MobileMarkerReader} from './mobile-dashboard.js';
export interface DashboardPageCategory {singlePoint?:unknown;singleDate?:unknown;markers?:Record<string,MobileMarkerReader>|null;label?:unknown}
export interface DashboardPageData {dates:unknown[];categories:Record<string,DashboardPageCategory>;dateLabels?:unknown[]|null}
export interface DashboardPageContext {data:DashboardPageData}
export interface DashboardPageRuntimeInput {closeChatPanel?:unknown;loadDemoData?:unknown;openChatPanel?:unknown}
export interface DashboardPageRuntimeSnapshot {closeChatPanel:unknown;loadDemoData:unknown;openChatPanel:unknown}
export interface DashboardPageDelegateRoot {addEventListener(type:'click',callback:(event:Event)=>void):unknown}
// Private original invocation operations. Raw injected factory values are not validated.
export interface DashboardPageFactoryOperations {
 setupDropZone():unknown;markerHasData(marker:unknown,index:number,markers:unknown[]):unknown;
 buildDashboardWidgetContext(data:unknown):unknown;getDashboardWidgetPrefs():unknown;
 getVisibleDashboardWidgetEntries(ctx:DashboardPageContext,prefs:unknown):unknown;
 renderOnboardingBanner():unknown;renderAIConnectionReminder():unknown;renderDashboardStickyControls():unknown;
 renderDashboardControlButtons(options:{includeReset:boolean}):unknown;
 renderDashboardWidget(entry:unknown,prefs:unknown,index:number,entries:unknown[]):unknown;
 isDashboardOrganizeMode():unknown;loadFocusCard(options:{refreshStale:boolean}):unknown;loadContextCardTips():unknown;
 ensureActiveDeviceTicker?: (()=>unknown)|undefined;resumeActiveTickerIfNeeded?: (()=>unknown)|undefined;
 startEmptyTour?: ((auto:boolean)=>unknown)|undefined;startTour?: ((auto:boolean)=>unknown)|undefined;
}
