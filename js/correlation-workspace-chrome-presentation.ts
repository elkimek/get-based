import {renderHTML} from './components/CorrelationWorkspaceChrome.svelte.html.js';
import {renderHTML as renderReadout} from './components/CorrelationWorkspaceReadout.svelte.html.js';
import {renderHTML as renderUsage} from './components/CorrelationWorkspaceUsageSegments.svelte.html.js';
import type {CorrelationControlsView} from './correlation-workspace-controls-presentation.js';
export interface CorrelationAnalysisPanel {readonly role:'tabpanel';readonly 'aria-labelledby':string;readonly tabindex:0}
export interface CorrelationWorkspaceView {readonly kind:"workspace";readonly controls:CorrelationControlsView;readonly notices:readonly CorrelationDoseNotice[];readonly plotsHidden:boolean;readonly panels:readonly CorrelationTimelinePanel[];readonly inspectorHidden:boolean;readonly inspectLabel:string;readonly unpinHidden:boolean;readonly inspectValue:string;readonly inspectMin:string;readonly inspectMax:string;readonly methodHidden:boolean;readonly analysisTab:string;readonly analysisOpen:boolean;readonly pairTabs:CorrelationPairTabs|null;readonly panel:CorrelationAnalysisPanel|null;readonly pairSummary:string;readonly scatterUnavailable:CorrelationScatterUnavailable|null;readonly scatterHidden:boolean;readonly history:CorrelationHistory|null;}
export interface CorrelationCurrentDose {readonly kind:"current-dose";readonly name:string;readonly id:string;readonly doses:CorrelationCurrentDoseList|CorrelationNoCurrentDose;}
export interface CorrelationCurrentDoseList {readonly kind:"current-dose-list";readonly items:readonly CorrelationCurrentDoseItem[];}
export interface CorrelationCurrentDoseItem {readonly kind:"current-dose-item";readonly ingredient:string;readonly amount:string;readonly since:string;}
export interface CorrelationNoCurrentDose {readonly kind:"no-current-dose";}
export interface CorrelationDoseNotice {readonly kind:"dose-notice";readonly name:string;readonly message:string;readonly confirmation:CorrelationConfirmDose|null;readonly id:string;readonly reviewLabel:string;}
export interface CorrelationConfirmDose {readonly kind:"confirm-dose";readonly dose:string;readonly periods:readonly CorrelationConfirmPeriod[];}
export interface CorrelationConfirmPeriod {readonly kind:"confirm-period";readonly start:string;readonly end:string;readonly id:string;readonly index:string;}
export interface CorrelationTimelinePanel {readonly kind:"timeline-panel";readonly classSuffix:string;readonly headingHidden:boolean;readonly heading:string;readonly plot:CorrelationPlot|null;readonly tracks:readonly CorrelationUsageTrack[];}
export interface CorrelationPlot {readonly kind:"plot-chart";readonly scaleLabel:string;readonly classSuffix:string;readonly index:string;readonly name:string;}
export interface CorrelationUsageTrack {readonly kind:"usage-timeline";readonly id:string;readonly name:string;}
export interface CorrelationPairTabs {readonly kind:"pair-tabs";readonly items:readonly CorrelationPairTab[];}
export interface CorrelationPairTab {readonly kind:"pair-tab";readonly index:string;readonly actionIndex:string;readonly selected:boolean;readonly tabindex:number;readonly marker:string;readonly therapy:string;}
export interface CorrelationScatterUnavailable {readonly kind:"scatter-unavailable";}
export interface CorrelationHistory {readonly kind:"history";readonly items:readonly CorrelationCurrentDose[];}
export interface CorrelationReadout {readonly kind:"readout";readonly name:string;readonly value:string;}
export interface CorrelationUsageSegment {readonly kind:"usage-segment";readonly accessibility:{readonly role:"img";readonly tabindex:0};readonly usage:string;readonly left:string;readonly width:string;readonly label:string;readonly title:string;}
/** Native escapeHTML's pre-encoding conversion; genuine nodes own encoding. */
export function correlationText(value:unknown):string{return value===null||value===undefined?'':String(value);}
/** Native map skips holes; only present projected rows are real child nodes. */
export function presentCorrelationRows<T>(values:readonly T[]):T[]{return values.filter(()=>true);}
export function renderCorrelationWorkspaceChrome(view:CorrelationWorkspaceView):string{return renderHTML({view});}
export function renderCorrelationWorkspaceReadout(rows:readonly CorrelationReadout[]):string{return renderReadout({rows});}
export function renderCorrelationWorkspaceUsageSegments(rows:readonly CorrelationUsageSegment[]):string{return renderUsage({rows});}
