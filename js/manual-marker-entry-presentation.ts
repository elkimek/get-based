import {renderHTML as renderFormHTML} from './components/ManualMarkerEntry.svelte.html.js';
import {renderHTML as renderUnitsHTML} from './components/ManualMarkerEntryUnits.svelte.html.js';
const text=(value:unknown):string=>value==null?'':String(value);
export interface ManualEntryUnitsView {
 readonly multiple:boolean;
 readonly rows:readonly Readonly<{value:string;label:string;selected:boolean}>[];
 readonly unit:string;
}
export type ManualEntryActionName='show-detail-modal'|'save-manual-entry'|'save-and-add-manual-entry';
export interface ManualEntryAction<A extends ManualEntryActionName=ManualEntryActionName> {
 readonly action:A; readonly id:string;
}
export interface ManualEntryView {
 readonly category:string;readonly name:string;readonly unit:string;
 readonly date:string;readonly today:string;readonly placeholder:string;
 readonly sampleTime:string;readonly fasting:string;readonly reference:string;
 readonly unitPicker:ManualEntryUnitsView;
 readonly close:ManualEntryAction<'show-detail-modal'>;
 readonly save:ManualEntryAction<'save-manual-entry'>;
 readonly add:ManualEntryAction<'save-and-add-manual-entry'>;
 readonly cancel:ManualEntryAction<'show-detail-modal'>;
}
/** Lazy primitive reads retain their original template positions; children are genuine typed views. */
export interface ManualEntryInput {
 readonly category:()=>unknown;readonly closeAction:()=>ManualEntryAction<'show-detail-modal'>;
 readonly name:()=>unknown;readonly unit:()=>unknown;
 readonly reference:string;readonly date:string;readonly today:string;
 readonly unitPicker:ManualEntryUnitsView;readonly placeholder:unknown;readonly sampleTime:unknown;readonly fasting:string;
 readonly saveAction:()=>ManualEntryAction<'save-manual-entry'>;
 readonly addAction:()=>ManualEntryAction<'save-and-add-manual-entry'>;
 readonly cancelAction:()=>ManualEntryAction<'show-detail-modal'>;
}
export function projectManualEntryUnits(options:readonly unknown[],fallback:()=>unknown):ManualEntryUnitsView {
 if(options.length>1){
  const rows=options.map((unit,index)=>{const value=text(unit),label=text(unit);return {value,label,selected:index===0};});
  return {multiple:true,rows,unit:''};
 }
 return {multiple:false,rows:[],unit:text(fallback())};
}
function action<A extends ManualEntryActionName>(view:ManualEntryAction<A>,expected:A):ManualEntryAction<A> {
 const name=view.action,id=view.id;
 if(name!==expected||typeof id!=='string'||id==='')throw new TypeError('Unexpected manual-entry delegated action');
 return {action:name,id};
}
export function projectManualMarkerEntry(input:ManualEntryInput):ManualEntryView {
 const category=text(input.category()),close=action(input.closeAction(),'show-detail-modal');
 const name=text(input.name()),unit=text(input.unit()),placeholder=text(input.placeholder),sampleTime=text(input.sampleTime);
 const save=action(input.saveAction(),'save-manual-entry'),add=action(input.addAction(),'save-and-add-manual-entry'),cancel=action(input.cancelAction(),'show-detail-modal');
 return {category,name,unit,date:input.date,today:input.today,placeholder,sampleTime,fasting:input.fasting,
  reference:input.reference,unitPicker:input.unitPicker,close,save,add,cancel};
}
/** Public synchronous serializers retain their native entrypoints; Svelte owns every form child. */
export function renderManualEntryUnits(options:readonly unknown[],fallback:()=>unknown):string{return renderUnitsHTML({view:projectManualEntryUnits(options,fallback)});}
export function renderManualMarkerEntry(input:ManualEntryInput):string{return renderFormHTML({view:projectManualMarkerEntry(input)});}
