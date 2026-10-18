import {formatValue} from './utils.js';
import {projectDashboardMiniSparkline} from './dashboard-owned-widget-projection.js';
import type {LabRenderHit} from '../types/dashboard-lab-widget-renderers.js';
import type {DashboardSingleMarkerView,DashboardSpotlightView,DashboardPriorityView} from '../types/dashboard-lab-marker-views.js';
function nativeText(value:unknown):string {return value===null||value===undefined?'':String(value);}
/** Assignments retain every native expression, repeated getter and coercion in its original order. */
export function projectDashboardSingleMarker(hit:LabRenderHit,rangeText:string,widgetMarkerId:string):DashboardSingleMarkerView {
 const statusClass=nativeText(hit.status),id=nativeText(hit.id);
 const accessibleLabel=nativeText(hit.marker.name+': '+formatValue(hit.value)+' '+(hit.marker.unit||''));
 const dotStatus=nativeText(hit.status),name=nativeText(hit.marker.name),value=nativeText(formatValue(hit.value));
 const unit=hit.marker.unit?nativeText(hit.marker.unit):null;
 const trendArrow=nativeText(hit.trend.arrow||'→'),sparkline=projectDashboardMiniSparkline(hit.marker.values,hit.status,120,34),reason=nativeText(rangeText);
 return {kind:'single-marker',widgetId:'marker_'+widgetMarkerId,statusClass,id,accessibleLabel,dotStatus,name,value,unit,trendArrow,sparkline,reason};
}
export function projectDashboardSpotlight(hit:LabRenderHit,rangeText:string,priorityText:string):DashboardSpotlightView {
 const id=nativeText(hit.id),accessibleLabel=nativeText(hit.marker.name+': '+formatValue(hit.value)+' '+(hit.marker.unit||''));
 const name=nativeText(hit.marker.name),range=nativeText(rangeText),priority=nativeText(priorityText),value=nativeText(formatValue(hit.value)),unit=nativeText(hit.marker.unit||'');
 const sparkline=projectDashboardMiniSparkline(hit.marker.values,hit.status,420,150);
 return {kind:'spotlight',id,accessibleLabel,name,range,priority,value,unit,sparkline};
}
export function projectDashboardPriority(hit:LabRenderHit,priorityText:string):DashboardPriorityView {
 const statusClass=nativeText(hit.status),id=nativeText(hit.id),accessibleLabel=nativeText(hit.marker.name+': '+formatValue(hit.value)+' '+(hit.marker.unit||''));
 const dotStatus=nativeText(hit.status),name=nativeText(hit.marker.name),priority=nativeText(priorityText),sparkline=projectDashboardMiniSparkline(hit.marker.values,hit.status,120,28);
 const value=nativeText(formatValue(hit.value)),unit=nativeText(hit.marker.unit||'');
 return {kind:'priority',statusClass,id,accessibleLabel,dotStatus,name,priority,sparkline,value,unit};
}
