import {renderHTML as renderFormHTML} from './components/CustomMarkerForm.svelte.html.js';
import {renderHTML as renderOptionsHTML} from './components/CustomMarkerOptions.svelte.html.js';
export interface CustomMarkerOptionView {readonly value:string;readonly label:string}
export interface CustomMarkerCategory {readonly label?:unknown}
export interface CustomMarkerFormView {readonly options:readonly CustomMarkerOptionView[]}
/** Object.entries captures category values before independent label coercions, as in the native renderer. */
export function projectCustomMarkerOptions(categories:Record<string,CustomMarkerCategory>):readonly CustomMarkerOptionView[] {
 return Object.entries(categories).map(([value,category])=>{const label=category.label;return {value,label:label==null?'':String(label)};});
}
export function projectCustomMarkerForm(categories:Record<string,CustomMarkerCategory>):CustomMarkerFormView {
 return {options:projectCustomMarkerOptions(categories)};
}
/** Public HTML facades serialize the same genuine option/form owners. No compiler coordinates or child strings. */
export function renderCustomMarkerOptions(categories:Record<string,CustomMarkerCategory>):string{return renderOptionsHTML({rows:projectCustomMarkerOptions(categories)});}
export function renderCustomMarkerForm(categories:Record<string,CustomMarkerCategory>):string{return renderFormHTML({view:projectCustomMarkerForm(categories)});}
