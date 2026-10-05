import type { getLensSummary } from '../js/lens.js';
export interface LabSourceGroup { name: unknown; count: number; products: unknown[]; sections: unknown[] }
export interface LabSourceStats { coreMarkers: number; totalMarkers: number; groups: LabSourceGroup[] }
export interface ContextImportMarker { mappedKey?: unknown; suggestedKey?: unknown; suggestedCategoryLabel?: unknown }
export interface ContextImportSnapshot { id?: unknown; markers?: unknown; testType?: unknown }
/** Views of only the original unchecked persisted-property reads, not validation. */
export interface ContextImportedReader extends Record<string, unknown> {
 genetics?: { snps?: unknown; apoe?: unknown; mtdna?: unknown } | null;
 importSnapshots?: Array<ContextImportSnapshot | null | undefined> | null;
 entries?: Iterable<{ markerSources?: Record<string, { snapshotId?: unknown } | null | undefined> | null } | null | undefined> | null;
 customMarkers?: Record<string, { categoryLabel?: unknown } | null | undefined> | null;
 lightEnvironment?: { rooms?: unknown; screens?: unknown } | null;
 sunDefaults?: { completedAt?: unknown } | null;
 interpretiveLens?: unknown;
}
export interface ContextSourceToggle {
 key: string; toggleKey?: string; title: unknown; description: unknown; status: unknown; checked: boolean;
 disabled?: boolean; attrs?: Record<string, unknown>; child?: boolean; affects?: readonly unknown[]; controlHtml?: string;
}
export interface ContextSourceSummary {
 insightOn: boolean; hasInsight: boolean; supplementsOn: boolean; hasSupplements: boolean;
 labStats: LabSourceStats; labOn: boolean; genomeSummaryOn: boolean; genomePriorityOn: boolean;
 genomeOn: boolean; hasGenomeSummary: boolean; hasGenome: boolean; lightOn: boolean; bodyOn: boolean;
 hasBody: boolean; nutritionOn: boolean; hasNutrition: boolean;
}
export interface AnswerGroundingReader {
 lensSet: boolean; kbSet: boolean; kbEnabled: boolean; kbSummary: ReturnType<typeof getLensSummary> | null; check: string;
}
export interface ContextActiveCategoryReader {
 group?: unknown; label?: unknown;
 markers?: Record<string, import('../js/data-view-types.js').ActiveMarker>;
}
export type LabGroupRenderOperations = Omit<LabSourceGroup, 'name'> & {
 name: { toLowerCase(): { replace(pattern: RegExp, replacement: string): unknown } };
};
