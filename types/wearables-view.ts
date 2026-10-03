import type { canonicalMetric } from '../js/wearable-adapters.js';
import type { WearableMetricSummary } from '../js/wearables-summary-model.js';

export type CanonicalMetric = NonNullable<ReturnType<typeof canonicalMetric>> & { ariaLabel?: unknown };
// Private unchecked operations on persisted summaries, not validated DTO output.
// Numeric and comparison views preserve the original coercions and thrown errors.
export interface MetricOperations extends Omit<Partial<WearableMetricSummary>, 'baseline' | 'primarySource'> {
  baseline: number; primarySource: string;
}
export interface SummaryOperations { sources?: Record<string, { coverageDays?: number; lastSyncAt?: number | null }> | null; metrics?: Record<string, MetricOperations> | null }
export interface CardOptions { interactive?: unknown; pairedMetric?: MetricOperations | null | undefined }
export interface DisplayItem { id: string; empty: boolean }
export interface ActionTarget extends HTMLElement { closest<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K] | null; closest(selector: string): ActionTarget | null }
export interface ProfileCacheReader { find(predicate: (row: { id?: unknown; tags?: unknown }) => unknown): { id?: unknown; tags?: unknown } | undefined }
