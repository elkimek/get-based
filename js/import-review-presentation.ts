import type {ImportReviewMarker} from './pdf-import-review-runtime.js';

/** Literal view contracts. Import scoring, conversions, grouping and mutations stay in their controllers. */
export type ImportReviewStatus = 'matched' | 'new' | 'unmatched';
export interface ImportUnitOptions {units: readonly string[]; schemaBacked: boolean}
export interface ImportUnitControlView {index: number; rawName: string; unit: string; displayUnit: string; schemaBacked: boolean}
export interface ImportMapControlView {index: number; rawName: string; key: string; summaryKind: 'mapped' | 'new' | 'none'; label: string}
export interface ImportExcludeView {label: string; excluded: boolean}
export interface ImportReviewRowView {
  index: number; status: ImportReviewStatus; rawName: string; value: string; range: string; mappedKey: string;
  unit: ImportUnitControlView; mapping: ImportMapControlView; exclude: ImportExcludeView;
}
export interface ImportUnitMenuOption {unit: string; index: number; selected: boolean; disabled: boolean}
export interface ImportUnitMenuOptionView extends ImportUnitMenuOption {label: string}
export interface ImportReviewPresentationInput {
  batchLabel: string; fileName: unknown; date: unknown; sampleTime: string; fasting: boolean | null;
  counts: {matched: number; new: number; unmatched: number}; rows: ImportReviewRowView[];
  unmatchedWarning: boolean; dateWarning: boolean;
  ranges: {count: number; checked: boolean} | null;
  privacy: {kind: 'local'; reviewed: boolean} | {kind: 'regex'; replacements: unknown} | null;
  cost: {model: unknown; tokens: string; cost: string} | null;
  debug: {piiLabel: unknown; analysis: unknown; model: unknown} | null;
  privacyDetails: boolean; cancelLabel: string; confirmLabel: string; confirmDisabled: boolean;
}
export interface ImportReviewView extends Omit<ImportReviewPresentationInput, 'fileName' | 'date' | 'privacy' | 'cost' | 'debug'> {
  fileName: string; date: string;
  privacy: {kind: 'local'; reviewed: boolean} | {kind: 'regex'; replacements: string; plural: boolean} | null;
  cost: {model: string; tokens: string; cost: string} | null;
  debug: {piiLabel: string; analysis: string; model: string} | null;
}
const text = (value: unknown): string => value == null ? '' : String(value);

export function projectImportUnitControl(marker: ImportReviewMarker, index: number, options: ImportUnitOptions): ImportUnitControlView {
  const unit = marker.unit || '';
  return {index, rawName: text(marker.rawName), unit, displayUnit: unit || options.units[0] || '', schemaBacked: options.schemaBacked};
}
export function projectImportMapControl(marker: ImportReviewMarker, index: number): ImportMapControlView {
  const key = marker.mappedKey || '';
  return {index, rawName: text(marker.rawName), key: key || text(marker.suggestedKey), summaryKind: key ? 'mapped' : marker.suggestedKey ? 'new' : 'none', label: key ? 'Change mapping' : 'Map marker'};
}
export function projectImportExcludeControl(markerName = '', excluded = false): ImportExcludeView {
  return {label: excluded ? 'Include in import' : markerName ? `Exclude ${markerName} from import` : 'Exclude from import', excluded};
}
export function projectImportReviewRow(marker: ImportReviewMarker, index: number, status: ImportReviewStatus, prepared: {labRange: string; unitOptions: ImportUnitOptions}): ImportReviewRowView {
  return {index, status, rawName: text(marker.rawName), value: String(marker.value), range: prepared.labRange || '—', mappedKey: text(marker.mappedKey), unit: projectImportUnitControl(marker, index, prepared.unitOptions), mapping: projectImportMapControl(marker, index), exclude: projectImportExcludeControl(marker.rawName)};
}
export function projectImportUnitMenu(options: readonly ImportUnitMenuOption[]): ImportUnitMenuOptionView[] {
  return options.map(option => ({...option, label: option.unit || 'No unit'}));
}
export function projectImportReviewPresentation(input: ImportReviewPresentationInput): ImportReviewView {
  return {...input, fileName: text(input.fileName), date: text(input.date || ''),
    privacy: input.privacy?.kind === 'regex' ? {kind: 'regex', replacements: String(input.privacy.replacements), plural: input.privacy.replacements !== 1} : input.privacy,
    cost: input.cost ? {...input.cost, model: text(input.cost.model)} : null,
    debug: input.debug ? {piiLabel: text(input.debug.piiLabel), analysis: text(input.debug.analysis), model: text(input.debug.model)} : null,
  };
}
