import type {ControlsPreferences} from './dashboard-widget-controls.js';
import type {DashboardWidgetEntry, DashboardWidgetFrameView} from '../js/dashboard-widget-presentation.js';
import type {DashboardActionBarView} from '../js/dashboard-action-bar-presentation.js';
import type {DashboardOnboardingBannerView, DashboardOnboardingReminderView} from '../js/dashboard-welcome-presentation.js';
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
 buildDashboardWidgetContext(data:unknown):unknown;getDashboardWidgetPrefs():ControlsPreferences;
 getVisibleDashboardWidgetViews(ctx:DashboardPageContext,prefs:ControlsPreferences):readonly DashboardWidgetEntry[];
 projectOnboardingBanner():DashboardOnboardingBannerView|null;projectAIConnectionReminder():DashboardOnboardingReminderView|null;
 projectDashboardControlButtons(options?:{includeReset:boolean}):DashboardActionBarView;
 projectDashboardWidget(entry:DashboardWidgetEntry,prefs:ControlsPreferences,index:number,entries:readonly DashboardWidgetEntry[]):DashboardWidgetFrameView|null;
 isDashboardOrganizeMode():unknown;loadFocusCard(options:{refreshStale:boolean}):unknown;loadContextCardTips():unknown;
 ensureActiveDeviceTicker?: (()=>unknown)|undefined;resumeActiveTickerIfNeeded?: (()=>unknown)|undefined;
 startEmptyTour?: ((auto:boolean)=>unknown)|undefined;startTour?: ((auto:boolean)=>unknown)|undefined;
}
