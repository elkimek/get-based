import {renderHTML} from './components/WearableEmptyCard.svelte.html.js';
import {escapeAttr} from './utils.js';
export interface WearableEmptyCardView {
 readonly metric:string;readonly interactive:boolean;readonly accessibleLabel:string;
 readonly label:string;readonly sub:string|null;
}
/** Match native escapeHTML's nullish/String boundary before genuine contextual serialization. */
export function wearableEmptyText(value:unknown):string {return value===null||value===undefined?'':String(value);}
/** Native controller IDs are fixed primitive manual keys; do not parse arbitrary callback HTML. */
export function qualifyWearableEmptyAction(metric:string,interactive:boolean,native:string):void {
 const expected=interactive?`data-wearable-action="open-manual-log" data-wearable-metric="${escapeAttr(metric)}" role="button" tabindex="0"`:'aria-disabled="true"';
 if(native!==expected)throw new Error('Unqualified native wearable empty-card actions');
}
export function renderWearableEmptyCardPresentation(view:WearableEmptyCardView):string {return renderHTML({view});}
