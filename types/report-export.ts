// Shared report preparation and detached JSON reader contracts.
import type { WearableSummarySnapshot } from '../js/wearables-summary-model.js';
import type { ActiveData } from '../js/data-view-types.js';
import type { ReportOptions, ReportDataSnapshot, ReportContextSection } from '../js/export-report-data.js';
import type { ReportSources } from '../js/export-report-sections.js';
import type { ProfileNote } from './app-state.js';
import type { SupplementRecord } from './supplement-data.js';
import type { getAllFlaggedMarkers } from '../js/marker-analysis.js';
import type { buildReportHeaderFacts } from '../js/export-report.js';

export interface ReportAISummary {
  text: string; generatedAt?: unknown; model?: unknown; provider?: unknown; modelId?: unknown; agentId?: unknown;
}
export interface ReportCoreOptions extends Omit<ReportOptions, 'sections' | 'appendixSections' | 'genomeVariants' | 'contextTitles'> {
  sections?: unknown; appendixSections?: unknown; genomeVariants?: unknown; contextTitles?: unknown;
  rangeMode?: string | undefined; aiSummary?: unknown;
}
export interface NormalizedReportOptions {
  preset: string; presetLabel?: string | undefined; dateRange?: string | undefined; rangeMode: string;
  sections: string[]; categoryKeys: unknown[] | null; appendixSections: string[];
  purpose: string; contextTitles: string[] | null; genomeMode?: string | null | undefined;
  genomeVariants: string[]; aiSummary: ReportAISummary | null;
  startDate?: string | null; endDate?: string;
}
export interface ReportTextContext extends ReportContextSection { title: string; text: string }
export type ReportHeaderProfile = Pick<ReportDataSnapshot['profile'], 'name'> & Partial<Omit<ReportDataSnapshot['profile'], 'name'>> & { [field: string]: unknown };
/** JSON serialization keeps non-finite numbers as null and drops undefined object fields. */
type JSONOptionalKey<Value, Key extends keyof Value> = string extends Key ? false
  : number extends Key ? false
  : {} extends Pick<Value, Key> ? true
  : unknown extends Value[Key] ? [keyof Value[Key]] extends [never] ? true : false
  : Value[Key] extends (...args: never[]) => unknown ? true
  : undefined extends string ? false : undefined extends Value[Key] ? true : false;
export type JSONDetached<Value> = Value extends (...args: never[]) => unknown ? never
  : Value extends number ? number | null
  : Value extends readonly (infer Item)[] ? Array<Item extends (...args: never[]) => unknown ? null : JSONDetached<Exclude<Item, undefined>> | (undefined extends Item ? null : never)>
  : Value extends object ? { [Key in keyof Value as JSONOptionalKey<Value, Key> extends true ? never : Key]: JSONDetached<Value[Key]> }
    & { [Key in keyof Value as JSONOptionalKey<Value, Key> extends true ? Key : never]?: JSONDetached<Exclude<Value[Key], undefined>> }
  : Value;
interface ReportPreparationFacts<Summary = ReportAISummary | null> {
  reportOptions: Omit<NormalizedReportOptions, 'aiSummary'> & { aiSummary: Summary }; data: ActiveData; profile: ReportHeaderProfile;
  profileName: string; sexLabel: string; flags: ReturnType<typeof getAllFlaggedMarkers>;
  notes: ProfileNote[]; supps: SupplementRecord[]; contextSections: ReportTextContext[];
  reportData: ReportDataSnapshot; extraSources: ReportSources;
  headerFacts: ReturnType<typeof buildReportHeaderFacts>; detailsLoaded?: boolean;
}
export type PreparedReportPayload<Summary = ReportAISummary | null> = JSONDetached<ReportPreparationFacts<Summary>>;
export type DetachedReportDataSnapshot = JSONDetached<ReportDataSnapshot>;
export interface ReportPresetView {
  label?: string; subtitle?: string; description?: string; sections?: string[];
  categoryMode?: string; dateRange?: string;
}
export interface ReportLifecycle {
  payload?: PreparedReportPayload;
  onProgress?: (stage: 'preparing' | 'approval' | 'generating' | 'rendering') => unknown;
  isCurrent?: () => boolean;
}
export interface HeaderFactsInput {
  profile: ReportHeaderProfile; reportOptions: Pick<NormalizedReportOptions, 'sections' | 'startDate' | 'endDate' | 'dateRange' | 'presetLabel' | 'rangeMode'>;
  dateRange: string | undefined; sexLabel: string; unitLabel: string;
}
export type HeightInfo = { height: number | string; unit?: unknown };
export type MetricSnapshot = NonNullable<WearableSummarySnapshot['metrics']>;
export interface WeightCandidate { valueKg: number | null; date: string; source: unknown }
export interface TextCandidate { value: string; date: string }
