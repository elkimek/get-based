import {renderHTML} from './components/WearableStripBody.svelte.html.js';
import type {WearableEmptyCardView} from './wearable-strip-empty-presentation.js';
import type {WearableSparklineView} from './wearable-strip-sparkline-presentation.js';

export interface WearableMetricCardView {
 readonly metric:string; readonly interactive:boolean; readonly accessibleLabel:string;
 readonly label:string; readonly subLabel:string|null; readonly delta:Readonly<{className:string;text:string}>|null;
 readonly value:string; readonly unit:string|null; readonly unitTight:boolean;
 readonly baselineValue:string; readonly baselineUnit:string;
 readonly staleness:Readonly<{date:string;label:string}>|null; readonly sparkline:WearableSparklineView|null;
 readonly trendClass:string; readonly trendLabel:string; readonly sourceBadge:Readonly<{metric:string;name:string}>|null;
}
export type WearableCardView=Readonly<{kind:'empty';view:WearableEmptyCardView}>|Readonly<{kind:'metric';view:WearableMetricCardView}>;
export interface WearableStripHeaderView {
 readonly manualOnly:boolean; readonly sourceNames:string; readonly coverage:string; readonly showDemo:boolean;
 readonly reorderMode:boolean; readonly lastSync:string|null; readonly sync:boolean; readonly collapsed:boolean; readonly collapseLabel:string;
}
export interface WearableStripItemView {
 readonly metric:string; readonly leftLabel:string; readonly rightLabel:string; readonly canLeft:boolean; readonly canRight:boolean; readonly card:WearableCardView;
}
export interface WearableStripView {
 readonly header:WearableStripHeaderView; readonly cards:readonly WearableStripItemView[];
 readonly waitingNote:string|null; readonly hrvNote:string|null;
}
/** A public synchronous serializer; all first-party child composition belongs to Svelte. */
export function renderWearableStripView(view:WearableStripView):string{return renderHTML({view});}
