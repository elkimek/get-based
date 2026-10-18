import {formatValue} from './utils.js';
import type {LabQuickHit,LabRenderHit,LabPersistedReader} from '../types/dashboard-lab-widget-renderers.js';
import type {DashboardMiniSparkView,DashboardQuickMarkerTileView,DashboardNotesView} from '../types/dashboard-owned-widgets.js';
function nativeText(value:unknown):string {return value===null||value===undefined?'':String(value);}
export function projectDashboardMiniSparkline(values:unknown[]|null|undefined,status:unknown,width=120,height=30):DashboardMiniSparkView {
 const points=(values||[]).filter(v=>v!==null&&Number.isFinite(Number(v))).slice(-10).map(Number);
 if(points.length<2)return {kind:'empty',status:'',points:'',width,height,cx:'',cy:''};
 const min=Math.min(...points),max=Math.max(...points),span=max-min||1;
 const coords=points.map((value,index)=>{
  const x=points.length===1?width/2:(index/(points.length-1))*width;
  const y=height-2-((value-min)/span)*(height-5);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
 }).join(' ');
 const statusText=nativeText(status),pointsText=nativeText(coords);
 const cx=nativeText(coords.split(' ').at(-1)?.split(',')[0]||String(width));
 const cy=nativeText(coords.split(' ').at(-1)?.split(',')[1]||'0');
 return {kind:'svg',status:statusText,points:pointsText,width,height,cx,cy};
}
/** Assignments retain the native interpolation/read/coercion order. */
export function projectDashboardQuickMarkerTile(hit:LabQuickHit&LabRenderHit,scoreLabel:string):DashboardQuickMarkerTileView {
 const reason=`${scoreLabel} · ${hit.priorityReason||'latest tracked marker'}`;
 const statusClass=nativeText(hit.status),id=nativeText(hit.id);
 const accessibleLabel=nativeText(hit.marker.name+': '+formatValue(hit.value)+' '+(hit.marker.unit||''));
 const dotStatus=nativeText(hit.status),name=nativeText(hit.marker.name),value=nativeText(formatValue(hit.value));
 const unit=hit.marker.unit?nativeText(hit.marker.unit):null;
 const trendArrow=nativeText(hit.trend.arrow||'→');
 const sparkline=projectDashboardMiniSparkline(hit.marker.values,hit.status,120,34),reasonText=nativeText(reason);
 return {id,statusClass,accessibleLabel,dotStatus,name,value,unit,trendArrow,sparkline,reason:reasonText};
}
export function projectDashboardNotes(notes:readonly {note:NonNullable<LabPersistedReader['notes']>[number];idx:number}[]):DashboardNotesView {
 const rows:DashboardNotesView['rows'][number][]=[];
 for(const {note,idx} of notes){
  const dateLabel=new Date(note.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const preview=nativeText(note.text.length>200?note.text.slice(0,200)+'...':note.text);
  rows.push({index:idx,dateLabel,preview});
 }
 return {kind:'notes',rows};
}
