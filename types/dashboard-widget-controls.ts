import type {getStatus} from '../js/utils.js';
export interface ControlsWidget {id:unknown;title?:unknown;description?:unknown;source?:unknown;size?:unknown;customMarkerWidget?:unknown}
export interface ControlsPreferences {order:unknown[];hidden:unknown[]}
export interface ControlsMarkerOption {id:string;name:unknown;category:unknown;value:unknown;unit:unknown;status:ReturnType<typeof getStatus>}
export interface ControlsBiometricOption {id:unknown;label:unknown;sub:unknown;value:unknown;unit:unknown;change:unknown}
interface ControlsMarker {hidden?:unknown;values:unknown[];name?:unknown;unit?:unknown}
interface ControlsData {categories?:Record<string,{markers?:Record<string,ControlsMarker>;label?:unknown}>}
export interface ControlsDependencies {
 state:{currentView?:unknown};
 getActiveData():ControlsData;
 getAvailableDashboardFixedWidgets():ControlsWidget[];
 getAvailableDashboardFixedWidgetIds():unknown[];
 getDashboardWidgetPrefs():ControlsPreferences;
 saveDashboardWidgetPrefs(prefs:unknown):unknown;
 resetDashboardWidgetPrefs():unknown;
 dashboardMarkerWidgetId(markerId:unknown):unknown;
 dashboardMarkerIdFromWidgetId(widgetId:unknown):unknown;
 isDashboardMarkerWidgetId(widgetId:unknown):unknown;
 getDashboardMarkerById(data:unknown,id:unknown):unknown;
 markerHasData(marker:unknown):unknown;
 getLatestValueIndex(values:unknown[]):number;
 getEffectiveRangeForDate(marker:unknown,index:number):{min:unknown;max:unknown};
 canonicalMetric(id:unknown):{sub?:unknown}|null|undefined;
 getDashboardBiometricSelection():unknown[];
 saveDashboardBiometricSelection(selected:unknown[]):unknown;
 getDashboardBiometricMetricOrder():Iterable<unknown>;
 getDashboardBiometricTile(id:unknown,options:{allowEmptyManual:boolean}):{label:unknown;value:unknown;unit:unknown;change:unknown}|null|undefined;
 rerenderDashboardFromWidgetChange():unknown;
}
export interface ControlsEventReader {
 target?:HTMLElement|null;
 key?:unknown;
 currentTarget?:unknown;
 preventDefault():unknown;
 dataTransfer?:{setData(format:string,value:unknown):unknown;setDragImage?(element:unknown,x:number,y:number):unknown;getData(format:string):unknown}|null;
}
// Private map operation view: each read follows the original has/set or filtered key iteration.
export interface ControlsFixedGroups {
 has(source:unknown):boolean;set(source:unknown,widgets:ControlsWidget[]):unknown;get(source:unknown):ControlsWidget[];keys():Iterable<unknown>;
}
