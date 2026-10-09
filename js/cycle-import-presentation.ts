import type {CyclePeriod} from './cycle-summary.js';

export interface CycleImportPeriodView {
  status: 'matched' | 'unmatched'; statusLabel: string;
  start: string; end: string; flow: string; symptoms: string;
}
export interface CycleImportPreviewInput {
  source: unknown; fileName: unknown; firstDate: unknown; lastDate: unknown;
  observationCount: number; periodCount: number; conflictCount: number;
  importCount: number; conflictMode: string; conflictSummary: string;
  warnings: readonly unknown[]; rows: readonly CycleImportPeriodView[]; confirmLabel: string;
}
export interface CycleImportPreviewView extends Omit<CycleImportPreviewInput, 'source' | 'fileName' | 'firstDate' | 'lastDate' | 'warnings'> {
  source: string; fileName: string; firstDate: string; lastDate: string; warnings: readonly string[];
}
export interface CycleImportBatchView {importId: string | undefined; label: string}
export interface CycleImportSourceView {
  source: string; label: string; periodCount: number; observationCount: number;
  importedAt: string | null; batches: readonly CycleImportBatchView[];
  deleteTitle: string | null; deleteAriaLabel: string | null;
}
export interface CycleImportCoverageInput {
  periodCount: number; observationCount: number; firstDate: unknown; lastDate: unknown;
  sources: readonly CycleImportSourceView[];
}
export interface CycleImportCoverageView extends Omit<CycleImportCoverageInput, 'firstDate' | 'lastDate'> {firstDate: string; lastDate: string; showRange: boolean}
const text = (value: unknown): string => value == null ? '' : String(value);

/** Formats already planned rows; normalization and overlap decisions remain with the import owner. */
export function projectCycleImportPeriodRows(periods: readonly CyclePeriod[], conflictStarts: ReadonlySet<string>, conflictMode: string): CycleImportPeriodView[] {
  return periods.slice(0, 18).map(period => {
    const hasConflict = conflictStarts.has(period.startDate);
    return {
      status: hasConflict ? 'unmatched' : 'matched',
      statusLabel: hasConflict ? conflictMode === 'replace-overlapping' ? 'Overlap · replace' : 'Overlap · skip' : 'Ready',
      start: text(period.startDate || ''), end: text(period.endDate || period.startDate || ''),
      flow: text(period.flow || 'moderate'), symptoms: (period.symptoms || []).join(', '),
    };
  });
}
export function projectCycleImportPreview(input: CycleImportPreviewInput): CycleImportPreviewView {
  return {...input, source: text(input.source), fileName: text(input.fileName), firstDate: text(input.firstDate || '?'), lastDate: text(input.lastDate || '?'), warnings: input.warnings.map(text)};
}
export function projectCycleImportCoverage(input: CycleImportCoverageInput): CycleImportCoverageView {
  return {...input, firstDate: text(input.firstDate || '?'), lastDate: text(input.lastDate || '?'), showRange: Boolean(input.firstDate || input.lastDate)};
}
