import type {getStatus,getTrend} from '../js/utils.js';
export interface LabMarker {values:unknown[];name?:unknown;unit?:unknown;hidden?:unknown;[key:string]:unknown}
export interface LabCategory {markers:Record<string,LabMarker>;label?:unknown;[key:string]:unknown}
export interface LabData {categories:Record<string,LabCategory>}
export interface LabKeyMarker {cat:string;key:string}
export interface LabAlert {id:string;name?:unknown;category?:unknown;concern:string;spark:unknown[];direction:string}
export interface LabFlag {status:string;id:string;name?:unknown;categoryKey:string;value:unknown;rawValue:unknown;unit?:unknown;refMin?:unknown;refMax?:unknown;effectiveMin:unknown;effectiveMax:unknown}
export interface LabContext {data?:unknown;filteredData?:unknown;keyMarkers?:LabKeyMarker[];trendAlerts?:LabAlert[];criticalFlags?:LabFlag[]}
export interface LabHit {id:string;storageId:string;category:unknown;marker:unknown;latestIdx:number;range:{min:unknown;max:unknown};value:unknown;status:ReturnType<typeof getStatus>;trend:ReturnType<typeof getTrend>}
// These private render operation operands are consumed at original helper method/arithmetic sites; copied public hit leaves remain unknown.
export type LabOperationHit=Omit<LabHit,'marker'|'category'> & {marker:LabMarker;category:LabCategory};
export type LabRenderHit = Omit<LabOperationHit,'marker'|'value'> & {marker:LabMarker & {name:string};value:number|null|undefined};
export interface LabPriority {alerts:Map<string,LabAlert>;keyRanks:Map<string,number>;criticalFlags:Set<string>}
export interface LabQuickPriority extends LabPriority {coreRanks:Map<string,number>;goalMatches:Map<string,{score:number;reason:string}>;pins:string[];pinnedIds:Set<string>}
export type LabScoredHit=LabOperationHit & {priorityScore:number;priorityReason:string;priorityKeyRank:number};
export type LabQuickHit=LabScoredHit & {quickMarkerPinned:boolean;quickMarkerCoreRank:number};
export interface LabCorrelationPair {id:string;name:unknown;category:unknown;value:unknown;unit:unknown;r:number}
export interface LabPersistedReader {healthGoals?:Iterable<{text?:unknown;severity?:unknown}>;notes?:Array<{date:string;text:string}>}
