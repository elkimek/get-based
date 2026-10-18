import {escapeAttr} from './utils.js';
import {markerDetailActionAttrs} from './marker-detail-actions.js';
import type {MarkerDetailActionName,MarkerDetailActionFields,MarkerDetailActionView} from './marker-detail-view.js';
export function captureMarkerDetailText(value:unknown):string{return value==null?'':String(value);}
/** Observe each original helper String conversion once at its native position.
 * The helper still owns filtering, names, entry order and throwing. No HTML
 * decoding/parsing: the separately captured scalars form genuine attributes. */
export function projectMarkerDetailAction(action:MarkerDetailActionName,fields:MarkerDetailActionFields={}):MarkerDetailActionView {
 const captured:Partial<Record<keyof MarkerDetailActionFields,string>>={};
 const forwarded=Object.fromEntries(Object.entries(fields).map(([name,value])=>[name,
  value!==undefined&&value!==null&&value!==''&&value!==false
   ?{[Symbol.toPrimitive](){const text=String(value);captured[name as keyof MarkerDetailActionFields]=text;return text;}}
   :value]));
 const actual=arguments.length===1?markerDetailActionAttrs(action):markerDetailActionAttrs(action,forwarded);
 const expected=[`data-marker-detail-action="${escapeAttr(action)}"`,...Object.entries(captured).map(([name,value])=>`data-marker-detail-${name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${escapeAttr(value)}"`)].join(' ');
 if(actual!==expected)throw new Error('Unqualified native Marker Detail action');
 return {action,id:captured.id??null,date:captured.date??null,type:captured.type??null,field:captured.field??null,value:captured.value??null,dotKey:captured.dotKey??null,showAllHistory:captured.showAllHistory??null,historyLimit:captured.historyLimit??null,scrollToHistory:captured.scrollToHistory??null};
}
