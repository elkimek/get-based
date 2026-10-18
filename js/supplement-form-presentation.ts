import {renderHTML as SupplementIngredientRow} from './components/SupplementIngredientRow.svelte.html.js';
import {renderHTML as SupplementPeriodRow} from './components/SupplementPeriodRow.svelte.html.js';
import {renderHTML as SupplementQualityRow} from './components/SupplementQualityRow.svelte.html.js';
import {renderHTML as SupplementForm} from './components/SupplementForm.svelte.html.js';
import {suppActionAttrs} from './supplement-action-delegates.js';
import type {SupplementImportReviewView} from './supplement-import-review-view.js';

/** Captured delegated actions remain plain data; Svelte owns their attributes. */
export interface SupplementFormAction {
  readonly name: string;
  readonly index?: string;
}
export function captureSupplementFormAction(name: string): SupplementFormAction {
  void `${suppActionAttrs(name)}`;
  return {name};
}
export function captureSupplementIndexedAction(name: string, index: number): SupplementFormAction {
  const capturedIndex = `${index}`;
  void `${suppActionAttrs(name, `data-supp-index="${capturedIndex}"`)}`;
  return {name, index: capturedIndex};
}

export interface SupplementUnitOptionView {
  readonly value: string;
  readonly selected: boolean;
  readonly label: string;
}

export interface SupplementIngredientView {
  readonly index: string;
  readonly originalIndex: string;
  readonly name: string;
  readonly amount: string;
  readonly unitOptions: readonly SupplementUnitOptionView[];
  readonly otherSelected: boolean;
  readonly customUnit: string;
  readonly customHidden: boolean;
  readonly timesPerDay: string;
  readonly dailyTotal: string;
  readonly removeAction: SupplementFormAction;
}

export interface SupplementPeriodView {
  readonly index: string;
  readonly originalIndex: string;
  readonly start: string;
  readonly end: string;
  readonly dose: string;
  readonly useDoseAction: SupplementFormAction;
  readonly doseSummary: SupplementDoseSummaryView | null;
  readonly removeAction: SupplementFormAction;
  readonly removeStyle: boolean;
}

export interface SupplementDoseSummaryView {
  readonly text: string;
}

export interface SupplementQualityView {
  readonly index: string;
  readonly originalIndex: string;
  readonly importIndex: string;
  readonly categories: readonly SupplementCategoryOptionView[];
  readonly analyte: string;
  readonly result: string;
  readonly unit: string;
  readonly basis: string;
  readonly aiChecked: boolean;
  readonly removeAction: SupplementFormAction;
}

export interface SupplementCategoryOptionView {
  readonly value: string;
  readonly selected: boolean;
  readonly label: string;
}

export interface SupplementFormView {
  readonly editIndex: string;
  readonly sourceUrl: string;
  readonly fetchAction: SupplementFormAction;
  readonly photoControls: SupplementPhotoControlsView | null;
  readonly importReview: SupplementImportReviewView | null;
  readonly name: string;
  readonly supplementSelected: boolean;
  readonly medicationSelected: boolean;
  readonly servingSize: string;
  readonly servingUnit: string;
  readonly timesPerDay: string;
  readonly ingredients: readonly SupplementIngredientView[];
  readonly addIngredientAction: SupplementFormAction;
  readonly periods: readonly SupplementPeriodView[];
  readonly changeDose: SupplementChangeDoseView | null;
  readonly addPeriodAction: SupplementFormAction;
  readonly directions: string;
  readonly scheduleOptions: readonly SupplementScheduleOptionView[];
  readonly routeOptions: readonly SupplementRouteOptionView[];
  readonly maxPerDay: string;
  readonly scheduleDetails: string;
  readonly brand: string;
  readonly genericName: string;
  readonly dosageForm: string;
  readonly labelDirections: string;
  readonly inactiveIngredients: string;
  readonly evidenceScopeOptions: readonly SupplementEvidenceScopeOptionView[];
  readonly qualityTests: readonly SupplementQualityView[];
  readonly addQualityAction: SupplementFormAction;
  readonly reason: string;
  readonly prescriber: string;
  readonly endReason: string;
  readonly note: string;
  readonly saveAction: SupplementFormAction;
  readonly saveLabel: string;
  readonly pauseStop: SupplementPauseStopView | null;
  readonly restart: SupplementRestartView | null;
  readonly deleteRecord: SupplementDeleteRecordView | null;
  readonly cancelAction: SupplementFormAction;
}

export interface SupplementPhotoControlsView {
  readonly action: SupplementFormAction;
}

export interface SupplementChangeDoseView {
  readonly action: SupplementFormAction;
}

export interface SupplementScheduleOptionView {
  readonly value: string;
  readonly selected: boolean;
  readonly label: string;
}

export interface SupplementRouteOptionView {
  readonly value: string;
  readonly selected: boolean;
  readonly label: string;
}

export interface SupplementEvidenceScopeOptionView {
  readonly value: string;
  readonly selected: boolean;
  readonly label: string;
}

export interface SupplementPauseStopView {
  readonly pauseAction: SupplementFormAction;
  readonly stopAction: SupplementFormAction;
}

export interface SupplementRestartView {
  readonly action: SupplementFormAction;
}

export interface SupplementDeleteRecordView {
  readonly action: SupplementFormAction;
}

export function renderSupplementUnitOption(view: SupplementUnitOptionView): string {
  return SupplementIngredientRow({kind: 'unitOption', view});
}

export function renderSupplementIngredient(view: SupplementIngredientView): string {
  return SupplementIngredientRow({kind: 'ingredient', view});
}

export function renderSupplementPeriod(view: SupplementPeriodView): string {
  return SupplementPeriodRow({kind: 'period', view});
}

export function renderSupplementDoseSummary(view: SupplementDoseSummaryView): string {
  return SupplementPeriodRow({kind: 'doseSummary', view});
}

export function renderSupplementQuality(view: SupplementQualityView): string {
  return SupplementQualityRow({kind: 'quality', view});
}

export function renderSupplementCategoryOption(view: SupplementCategoryOptionView): string {
  return SupplementQualityRow({kind: 'categoryOption', view});
}

export function renderSupplementForm(view: SupplementFormView): string {
  return SupplementForm({kind: 'form', view});
}

export function renderSupplementPhotoControls(view: SupplementPhotoControlsView): string {
  return SupplementForm({kind: 'photoControls', view});
}

export function renderSupplementChangeDose(view: SupplementChangeDoseView): string {
  return SupplementForm({kind: 'changeDose', view});
}

export function renderSupplementScheduleOption(view: SupplementScheduleOptionView): string {
  return SupplementForm({kind: 'scheduleOption', view});
}

export function renderSupplementRouteOption(view: SupplementRouteOptionView): string {
  return SupplementForm({kind: 'routeOption', view});
}

export function renderSupplementEvidenceScopeOption(view: SupplementEvidenceScopeOptionView): string {
  return SupplementForm({kind: 'evidenceScopeOption', view});
}

export function renderSupplementPauseStop(view: SupplementPauseStopView): string {
  return SupplementForm({kind: 'pauseStop', view});
}

export function renderSupplementRestart(view: SupplementRestartView): string {
  return SupplementForm({kind: 'restart', view});
}

export function renderSupplementDeleteRecord(view: SupplementDeleteRecordView): string {
  return SupplementForm({kind: 'deleteRecord', view});
}
