import type {CategoryMarkerReader} from './category-view-renderers.js';
export interface CategoryPageMarker extends Omit<CategoryMarkerReader,'values'> {values?:unknown[];hidden?:unknown}
export interface CategoryPageCategory {label?:unknown;markers:Record<string,CategoryPageMarker>;singleDate?:unknown;singleDateLabel?:unknown}
export interface CategoryPageData {categories:Record<string,CategoryPageCategory>;dateLabels:unknown[];dates:unknown[];phaseLabels?:unknown;phaseDisplayLabels?:unknown;phaseCycleDays?:unknown;phaseSources?:unknown}
export type CategoryPageEntries = Array<[string,CategoryPageMarker]>;
export interface CategoryPageDelegateRoot {addEventListener(type:'click',callback:(event:Event)=>void):unknown;addEventListener(type:'keydown',callback:(event:KeyboardEvent)=>void):unknown}
