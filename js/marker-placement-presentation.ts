import {renderHTML as renderSummaryHTML} from './components/MarkerPlacementSummary.svelte.html.js';
import {renderHTML as renderOptionsHTML} from './components/MarkerPlacementOptions.svelte.html.js';
import {renderHTML as renderFormHTML} from './components/MarkerPlacementForm.svelte.html.js';
import {escapeAttr} from './utils.js';
import {markerDetailActionAttrs} from './marker-detail-actions.js';
import type {MarkerPlacementChoice} from './marker-detail-placement.js';
import type {PlacementActionView,PlacementOptionGroup,PlacementSummaryView,PlacementFormView} from './marker-placement-view.js';
export interface PlacementFormInput {marker:{name?:unknown};choices:MarkerPlacementChoice[];unavailableCount:number;}
function text(value:unknown):string{return value==null?'':String(value);}
/** Observe the one native ID String conversion inside the unchanged helper.
 * The original scalar receives exactly the same String hint/receiver once.
 * No attributes are parsed/decoded and no helper/action/domain body changes. */
function action(action:PlacementActionView['action'],id?:unknown):PlacementActionView {
 let captured:string|null=null;
 const present=id!==undefined&&id!==null&&id!==''&&id!==false;
 const scalar=present?{[Symbol.toPrimitive](){captured=String(id);return captured;}}:id;
 const attributes=id===undefined?markerDetailActionAttrs(action):markerDetailActionAttrs(action,{id:scalar});
 const expected=`data-marker-detail-action="${escapeAttr(action)}"`+(captured===null?'':` data-marker-detail-id="${escapeAttr(captured)}"`);
 if(attributes!==expected)throw new Error('Unqualified native marker placement action');
 return {action,id:captured};
}
export function projectPlacementSummary(id:string,currentLabel:unknown,nativeLabel:unknown,moved:boolean,markerName:()=>unknown):PlacementSummaryView {
 const current=text(currentLabel),name=text(markerName()||'marker'),open=action('open-marker-placement',id);
 const native=moved?{label:text(nativeLabel),restore:action('restore-marker-placement',id)}:null;
 return {currentLabel:current,markerName:name,open,native};
}
export function renderPlacementSummary(id:string,currentLabel:unknown,nativeLabel:unknown,moved:boolean,markerName:()=>unknown):string {
 return renderSummaryHTML({view:projectPlacementSummary(id,currentLabel,nativeLabel,moved,markerName)});
}
export function projectPlacementOptions(choices:MarkerPlacementChoice[]):readonly PlacementOptionGroup[] {
 const groups=[{label:'In this profile',options:choices.filter(choice=>choice.inProfile)},{label:'Other compatible categories',options:choices.filter(choice=>!choice.inProfile)}].filter(group=>group.options.length>0);
 return groups.map(({label,options})=>{const groupLabel=text(label);const rows=options.map(choice=>{const value=text(choice.categoryKey),selected=!!choice.selected,label=text(choice.label);return {value,selected,label};});return {label:groupLabel,rows};});
}
export function renderPlacementOptions(choices:MarkerPlacementChoice[]):string{return renderOptionsHTML({groups:projectPlacementOptions(choices)});}
export function projectPlacementForm(id:string,context:PlacementFormInput,currentLabel:unknown,nativeLabel:unknown,moved:boolean):PlacementFormView {
 const back=action('show-detail-modal',id),markerName=text(context.marker.name),close=action('close-modal');
 const groups=projectPlacementOptions(context.choices),current=text(currentLabel),native=text(nativeLabel);
 // Keep all three native unavailableCount reads and its template String hint.
 const help=context.unavailableCount?`${context.unavailableCount} calculated, incompatible, or conflicting ${context.unavailableCount===1?'category is':'categories are'} hidden.`:'';
 const restore=moved?action('restore-marker-placement',id):null,cancel=action('show-detail-modal',id),save=action('save-marker-placement',id);
 return {back,markerName,close,groups,currentLabel:current,nativeLabel:native,help,restore,cancel,save};
}
export function renderPlacementForm(id:string,context:PlacementFormInput,currentLabel:unknown,nativeLabel:unknown,moved:boolean):string {
 return renderFormHTML({view:projectPlacementForm(id,context,currentLabel,nativeLabel,moved)});
}
