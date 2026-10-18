import {renderHTML} from './components/WearableDetailChrome.svelte.html.js';
export interface WearableManualEntryView {
 readonly date:string;readonly shortDate:string;readonly value:string;readonly unit:string|null;
 readonly tags:readonly string[]|null;readonly note:string|null;readonly deleteLabel:string;readonly deleteDate:string;readonly metric:string;
}
export type WearableManualEntriesView = Readonly<{kind:'compact-empty'|'empty';metric:string}>
 | Readonly<{kind:'list';metric:string;count:number;rows:readonly WearableManualEntryView[]}>;
export interface WearableDetailStatView {readonly tooltip:string|null;readonly label:string;readonly value:string;readonly sub:string|null}
export type WearableDetailFeedbackView = Readonly<{kind:'zeroActivity'|'emfHint'}>
 | Readonly<{kind:'emptyChart';window:string}>
 | Readonly<{kind:'emptyChartWithManual';window:string;olderHint:string}>;
export type WearableDetailSourceView = Readonly<{kind:'single';metric:string;name:string}>
 | Readonly<{kind:'paired';systolic:string;diastolic:string}>;
export interface WearableDetailRangeView {readonly active:boolean;readonly metric:string;readonly range:string;readonly label:string}
export interface WearableDetailView {
 readonly label:string;readonly subLabel:string|null;readonly sourceName:string;readonly delta:string;readonly trend:string;
 readonly sourceSwap:WearableDetailSourceView|null;readonly ranges:readonly WearableDetailRangeView[];
 readonly emptyHint:WearableDetailFeedbackView|null;readonly stats:readonly WearableDetailStatView[];
 readonly manualEntries:WearableManualEntriesView|null;readonly emfHint:WearableDetailFeedbackView|null;
}
/** Native modal/chart delegates consume this serialized genuine component tree. */
export function renderWearableDetailView(view:WearableDetailView):string{return renderHTML({view});}
