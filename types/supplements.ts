import type { FormIngredientReader, CollectedFormPeriod } from '../js/supplement-form-ui.js';
import type { QualityTestView } from '../js/supplement-quality.js';
import type { SupplementDoseView, SupplementScheduleView } from '../js/supplement-medication-domain.js';
// Original restored field operations, not a validated persistence DTO.
export interface PeriodOperations extends Record<string, unknown> {
 start?: unknown; end?: unknown; dose?: string | SupplementDoseView | null; ingredientDoses?: SupplementDoseView[] | null; schedule?: SupplementScheduleView | null;
}
export interface SupplementOperations extends Record<string, unknown> {
 id?: unknown; schemaVersion?: unknown; name?: unknown; type?: unknown; dosage?: unknown; note?: unknown;
 startDate?: unknown; endDate?: unknown; periods?: unknown; currentDose?: string | SupplementDoseView | null;
 ingredients?: FormIngredientReader[] | null; inactiveIngredients?: unknown[] | null; qualityTests?: QualityTestView[] | null;
 sourceUrl?: unknown; importProvenance?: (Record<string, unknown> & {url?: unknown}) | null; servingSize?: {value?: unknown;unit?: unknown} | null;
 schedule?: SupplementScheduleView | null; lifecycle?: {state?: unknown;reason?: unknown} | null; timesPerDay?: unknown;
}
export interface SupplementProfileOperations extends Record<string, unknown> { supplements?: SupplementOperations[] | null }
export type EditedSupplementOperations = { [Key in keyof SupplementOperations]:
 Key extends 'ingredients' | 'qualityTests' ? unknown[] | null : SupplementOperations[Key]
} & { periods: (CollectedFormPeriod | PeriodOperations)[]; schedule: SupplementScheduleView; lifecycle: {state?: unknown;reason?: unknown} };
export type RawPeriods = (input: unknown) => PeriodOperations[];
export type RawPeriodSchedule = (previous: unknown, periods: unknown, schedule: unknown) => PeriodOperations[];
export type RawIngredientChange = (entry: unknown, today: string, saved: unknown) => ReturnType<typeof import('../js/supplement-medication-domain.js').recordIngredientDoseChange>;
export type RawIngredientCollector = (pending: ReturnType<typeof import('../js/supplement-import-controller.js').getPendingSupplementImport>) => ReturnType<typeof import('../js/supplement-form-ui.js').collectIngredients>;
export type RawQualityCollector = (pending: ReturnType<typeof import('../js/supplement-import-controller.js').getPendingSupplementImport>) => ReturnType<typeof import('../js/supplement-form-ui.js').collectQualityTests>;
export type RawReplace = (data: unknown, path: string, index: number, item: unknown) => ReturnType<typeof import('../js/data-merge.js').replaceImportedArrayItem>;
export type RawDelete = (data: unknown, path: string, index: number) => ReturnType<typeof import('../js/data-merge.js').deleteImportedArrayItem>;
export type RawSave = (profile: Parameters<typeof import('../js/data.js').saveImportedDataForProfile>[0], data: unknown, options: Parameters<typeof import('../js/data.js').saveImportedDataForProfile>[2]) => ReturnType<typeof import('../js/data.js').saveImportedDataForProfile>;
export type RawStatus = (record: unknown) => ReturnType<typeof import('../js/supplement-medication-domain.js').getSupplementStatus>;
export type RawId = (record: unknown) => ReturnType<typeof import('../js/supplement-medication-domain.js').getSupplementRecordId>;
export type RawConfirmPeriod = (record: unknown, index: number) => ReturnType<typeof import('../js/supplement-medication-domain.js').confirmIngredientDosePeriod>;
