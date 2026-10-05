import type { getImportBenchmarkProviderLabel } from '../js/import-benchmarks.js';
/** Raw saved fields; nested shapes are operation readers, never validated output promises. */
export interface NumericFields extends Record<string,unknown> {}
export interface SettingsBenchmarkReader extends Record<string,unknown> {
  costInfo?:NumericFields|null|undefined; timings?:NumericFields|null|undefined;
  usage?:NumericFields|null|undefined; diagnostics?:NumericFields|null|undefined; runtime?:NumericFields|null|undefined;
}
export interface SnapshotOperations extends SettingsBenchmarkReader {markers?:{length:unknown}|null|undefined}
export interface EntryOperations {
 date:unknown; markers?:Record<string,unknown>|null|undefined; markerSources?:Record<string,{snapshotId?:unknown}|null|undefined>|null|undefined; sourceFile?:unknown;
}
/** These private scalar views permit the original arithmetic/method operators without normalizing their raw operands. */
export interface UsageOperations {totalCost:number;requestCount:number;totalInputTokens:number;totalOutputTokens:number}
export interface DiscrepancyOperations {
 scope?:unknown; markerName?:unknown; section?:unknown; issues:Array<{label?:unknown;expected?:unknown;actual?:unknown;note?:unknown}|null|undefined>;
}
export interface DifferenceValue {raw:number;label:string}
export type ProviderLabelReader=(snapshot:unknown)=>ReturnType<typeof getImportBenchmarkProviderLabel>;
export interface BenchmarkMetric {group:string;key: 'referenceExactMarkerPercent'|'referenceFieldAccuracyPercent'|'referencePrecisionPercent'|'referenceRecallPercent'|'referenceF1Percent'|'referenceMappingAccuracyPercent'|'referenceValueAccuracyPercent'|'referenceUnitAccuracyPercent'|'referenceRangeAccuracyPercent'|'referenceDateAccuracyPercent'|'referencePipelineExactMarkerPercent'|'referencePipelineFieldAccuracyPercent'|'detectedMarkerCount'|'importedMarkerCount'|'acceptedRate'|'cleanImportRate'|'reviewIssueRate'|'correctedMappingCount'|'correctedValueCount'|'correctedUnitCount'|'excludedMarkerCount'|'unmappedMarkerCount'|'totalMs'|'analysisMs'|'throughput'|'inputTokens'|'outputTokens'|'piiMs'|'pdfExtractionMs'|'modelLoadMs'|'timeToFirstTokenMs';label:string;hint:string;direction:string;optional?:boolean;diffMode?:string|undefined;zeroIsMissing?:boolean;format:(value:number|null)=>string}
