import type {CategoryMarkerReader, CategoryNumericMarkerOperations} from './category-view-renderers.js';
export interface CompareMarker extends CategoryMarkerReader {}
// Private operations at original numeric bindings, not a raw producer guarantee.
export interface CompareNumericMarker extends CategoryNumericMarkerOperations {}
export interface CompareCategory {label?:unknown;singlePoint?:unknown;markers:Record<string,CompareMarker>}
export interface CompareData {dates:unknown[];dateLabels:unknown[];categories:Record<string,CompareCategory>}
export interface CompareRange {min?:number|null|undefined;max?:number|null|undefined}
export interface CompareEvent {target:unknown;key?:string;preventDefault():unknown}
export interface CompareDelegateRoot {addEventListener(type:string,listener:(event:Event)=>void):unknown}
export interface CompareDependencies {askAIAboutCorrelations:unknown;renderTableColgroup:unknown;renderScrollableTableShell:unknown;renderCategoryGlyph:unknown}
export type CompareHTMLWriter = Omit<HTMLElement,'innerHTML'> & {innerHTML:unknown};
export interface CompareDateState {compareDate1:unknown;compareDate2:unknown}
