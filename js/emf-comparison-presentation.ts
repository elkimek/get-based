import {renderHTML} from './components/EMFComparison.svelte.html.js';
/** Native calculations/coercions finish in the controller before genuine nodes read these snapshots. */
export type EMFComparisonCell =
 | {readonly kind:'empty'}
 | {readonly kind:'paired';readonly beforeColor:string;readonly beforeText:string;readonly arrowColor:string;readonly arrow:string;readonly afterColor:string;readonly afterText:string}
 | {readonly kind:'added';readonly afterColor:string;readonly afterText:string}
 | {readonly kind:'removed';readonly beforeColor:string;readonly beforeText:string};
export interface EMFComparisonRow {readonly label:string;readonly cells:readonly EMFComparisonCell[]}
export interface EMFComparisonView {readonly before:string;readonly after:string;readonly earlier:{readonly count:string;readonly suffix:string}|null;readonly columns:readonly string[];readonly rows:readonly EMFComparisonRow[];readonly interpret:boolean}
/** Match the native escapeHTML pre-encoding conversion; contextual escaping belongs to the owner. */
export function emfComparisonText(value:unknown):string{return value===null||value===undefined?'':String(value);}
export function qualifyEMFComparisonAction(native:string):void{if(native!=='data-emf-action="interpret-comparison"')throw new Error('Unqualified native EMF interpretation action');}
export function renderEMFComparisonPresentation(view:EMFComparisonView):string{return renderHTML({view});}
