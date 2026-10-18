// nutrition-render.js — pure Meals & Nutrition view templates and formatting.

import { state } from './state.js';
import { getMealAnalysisAvailability } from './nutrition-analysis.js';
import { getDefaultNutritionComparisonModelValues, getMealAISelection, isNutritionLocalAICatalogLoading, listNutritionVisionModels, nutritionModelPricing } from './nutrition-ai-settings.js';
import { projectNutritionComparisonPicker } from './nutrition-benchmark-model.js';
import { assessFuelStrategy, calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { projectNutritionEditor, projectNutritionMealModel } from './nutrition-editor-model.js';
export { ALL_REVIEW_FIELDS } from './nutrition-editor-model.js';
import { isNutritionContextEnabled } from './lab-context-settings.js';
import { getNutritionTargets, resolveNutritionTargets } from './nutrition-targets.js';
import { escapeAttr, isDebugMode } from './utils.js';

import type { NutritionMeal, MealImage, MealComponent } from '../types/nutrition-data.js';
import type { StoredNutritionMeal } from './nutrition-sync-sanitize.js';
import type { MealPhotoAnalysis, analyzeMealPhoto } from './nutrition-analysis.js';
import type { computeNutritionHistory } from './nutrition-summary.js';
import type { summarizeFuelResponses } from './nutrition-fuel-mix.js';

// Opaque stored extensions retain their original coercions and field-read errors.
type RawFields<Value, Fields extends keyof Value = keyof Value> = { [Field in Fields]?: unknown };
export type DateInput = string | number | Date;
export type GoalField = readonly [string, string, string, string, string];
export type NativeHistory = ReturnType<typeof computeNutritionHistory>;
export type NativePeriod = NativeHistory['period'];
type NativeSource = Awaited<ReturnType<typeof analyzeMealPhoto>>['source'];
export type NutritionRenderMeal = RawFields<NutritionMeal, 'id' | 'eatenAt' | 'name' | 'mealType' | 'note' | 'nutrients' | 'components' | 'images' | 'confidence' | 'responseCheckIn'> & RawFields<StoredNutritionMeal, 'source' | 'image' | 'localDate' | 'localTimeMinutes' | 'warnings' | 'assumptions'>;
export type MealImageReader = RawFields<MealImage, 'thumbnailUrl'> & { dataUrl?: unknown };
export type MealComponentReader = RawFields<MealComponent, 'name' | 'quantityG'>;
export type MealSourceReader = RawFields<NativeSource, 'kind' | 'modelDisplay' | 'model' | 'provider' | 'usage'> & {
  originalSource?: RawFields<NativeSource, 'kind'> | null; correction?: { userProvidedMealName?: unknown } | null;
  label?: RawFields<NonNullable<MealPhotoAnalysis['label']>> | null;
  review?: { editedPortions?: unknown; editedNutrients?: unknown; editedComponentIdentities?: unknown } | null;
  foodData?: { sourceName?: unknown; barcode?: unknown; schemaVersion?: unknown; productUpdatedAt?: unknown; cacheHit?: unknown } | null;
  foodComposition?: { sourceName?: unknown; dataset?: unknown; matchedComponents?: unknown; totalComponents?: unknown; completeMicronutrientKeys?: unknown } | null;
};
export type FuelMixReader = RawFields<NonNullable<ReturnType<typeof calculateFuelOverlap>>> & RawFields<ReturnType<typeof import('./nutrition-fuel-mix.js').summarizeFuelOverlap>>;
export type FuelResponseReader = RawFields<ReturnType<typeof summarizeFuelResponses>, 'checkIns' | 'minimum'> & {
  satiety?: { available?: unknown; direction?: unknown } | null; energy?: { available?: unknown; direction?: unknown } | null;
};
export type PeriodReader = RawFields<NativePeriod, 'meals' | 'foodMeals' | 'drinkEntries' | 'reviewRatio' | 'reviewedMeals' | 'loggedDays' | 'loggedDayKeys'> & {
  dailyAverages?: Record<string, unknown> | null; nutrientCoverage?: Record<string, {completeDays?: unknown}> | null;
  fuelOverlap?: FuelMixReader | null; fuelResponses?: FuelResponseReader | null; timing?: RawFields<NativePeriod['timing']>;
};
export type NutritionRenderHistory = RawFields<NativeHistory, 'rangeKey' | 'rangeLabel' | 'rangeDescription'> & {
  period?: PeriodReader | null; meals?: unknown; coverageBuckets?: NativeHistory['coverageBuckets']; view?: unknown; visibleMealCount?: unknown;
};
type ResolvedTargets = ReturnType<typeof resolveNutritionTargets>;
export type TargetReader = Partial<ResolvedTargets> & { [key: string]: unknown };
export interface FuelOverlapRenderOptions {scope?: 'window' | 'meal'; compact?: unknown; fallbackTotalMeals?: unknown; period?: PeriodReader | null | undefined; targets?: Parameters<typeof assessFuelStrategy>[1]}
export interface NutritionEditorRenderOptions {editingMealId?: unknown; reusedMealId?: unknown; storageError?: unknown; returnTo?: unknown; returnMealId?: unknown; returnMealOrigin?: unknown}

import { projectNutritionMealDetail } from './nutrition-meal-detail-model.js';
import { buildNutritionTargetsView, buildNutritionFluidView, localDateTimeValue } from './nutrition-entry-model.js';
export { localDateTimeValue } from './nutrition-entry-model.js';
import { renderHTML as renderPresentation } from './components/NutritionPresentation.svelte.html.js';
import { renderHTML as renderFuel } from './components/NutritionFuelCard.svelte.html.js';
import { renderHTML as renderMealPhoto } from './components/NutritionMealPhoto.svelte.html.js';
import { renderHTML as renderComparisonPicker } from './components/NutritionComparisonPicker.svelte.html.js';
import { renderHTML as renderBenchmark } from './components/NutritionBenchmark.svelte.html.js';
import { renderHTML as renderMealModel } from './components/NutritionMealModelPicker.svelte.html.js';
import { renderHTML as renderEditor } from './components/NutritionMealEditor.svelte.html.js';
import { hasFiniteNumber, projectNutritionFuel, projectNutritionHistory } from './nutrition-presentation-model.js';
export { formatNumber, hasFiniteNumber, MEAL_TYPES, mealTypeLabel, mealImages, HISTORY_MEAL_PAGE_SIZE } from './nutrition-presentation-model.js';

import { nutritionDashboardGoalFields } from './nutrition-dashboard-model.js';
export { projectNutritionWidget, projectNutritionFuelWidget, renderNutritionWidget, renderNutritionFuelWidget, refreshNutritionWidgets } from './nutrition-widget-runtime.js';

const ACTION_ATTR = 'data-nutrition-action';
const NUTRITION_STYLESHEET_URL = new URL('../css/nutrition.css', import.meta.url).href;
let nutritionStylesheetPromise: Promise<Event> | null = null;
export function actionAttrs(action: unknown, attrs: Record<string, unknown> = {}) {
  const rest = Object.entries(attrs).map(([key, value]) => ` data-nutrition-${escapeAttr(key)}="${escapeAttr(String(value))}"`).join('');
  return `${ACTION_ATTR}="${escapeAttr(action)}"${rest}`;
}

export function ensureNutritionStylesheet() {
  if (typeof document === 'undefined') return Promise.resolve();
  const existing = (
    document.querySelector('link[data-nutrition-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find(link => {
      try { return new URL((link as HTMLLinkElement).href).pathname === '/css/nutrition.css'; }
      catch { return false; }
    })
    || null
  ) as HTMLLinkElement | null;
  if (existing?.sheet) return Promise.resolve();
  if (!nutritionStylesheetPromise) {
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = NUTRITION_STYLESHEET_URL;
    link.dataset.nutritionStylesheet = '';
    nutritionStylesheetPromise = new Promise<Event>(resolve => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', event => {
        nutritionStylesheetPromise = null; link.remove(); resolve(event);
      }, { once: true });
      if (!link.isConnected) document.head.append(link);
    });
  }
  return nutritionStylesheetPromise;
}

export function renderFuelOverlapCard(mix: FuelMixReader | null | undefined, options: FuelOverlapRenderOptions = {}) {
  return renderFuel({ view: projectNutritionFuel(mix, options) });
}

export function buildNutritionHistoryView(history: NutritionRenderHistory | null | undefined, options: { storageError?: unknown; returnTo?: unknown } = {}) {
  const targets = resolveNutritionTargets();
  return projectNutritionHistory(history, targets, nutritionDashboardGoalFields(getNutritionTargets().widgetNutrients || []), isNutritionContextEnabled(), options);
}

export function renderNutritionHistoryModal(history: NutritionRenderHistory | null | undefined, options: { storageError?: unknown; returnTo?: unknown } = {}) {
  return renderPresentation({ kind: 'history', view: buildNutritionHistoryView(history, options) });
}

export function renderNutritionCustomizeModal(options: { returnTo?: unknown } = {}) {
  return renderPresentation({ kind: 'entry', view: buildNutritionTargetsView(state.importedData, options) });
}
export function renderFluidLogModal() {
  return renderPresentation({ kind: 'entry', view: buildNutritionFluidView() });
}

export function mealLocalDateTime(meal: NutritionRenderMeal | null | undefined, reuse = false) {
  if (reuse) return localDateTimeValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(meal?.localDate || '')) && hasFiniteNumber(meal?.localTimeMinutes)) {
    const minutes = Math.max(0, Math.min(1439, Number(meal!.localTimeMinutes)));
    return `${meal!.localDate}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const date = new Date(meal?.eatenAt as DateInput);
  return Number.isFinite(date.getTime()) ? localDateTimeValue(date) : localDateTimeValue();
}

export function setElementValue(id: string, value: unknown) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (input && value !== null && value !== undefined) input.value = String(value);
}

export function renderStoredPhotoPreview(images: readonly MealImageReader[]) {
  const preview = document.getElementById('nutrition-photo-preview');
  if (!preview || !images.length) return;
  preview.innerHTML = renderMealPhoto({ view: { kind: 'stored', urls: images.slice(0, 4).map(image => String((image.thumbnailUrl || image.dataUrl) ?? '')) } });
}

export function renderMealDetail(meal: NutritionRenderMeal, options: { returnTo?: unknown } = {}) {
  return renderPresentation({ kind: 'detail', view: projectNutritionMealDetail(meal, options) });
}

function comparisonPickerView(query: unknown = '') {
  const models = listNutritionVisionModels();
  return projectNutritionComparisonPicker(models, getDefaultNutritionComparisonModelValues(models), isNutritionLocalAICatalogLoading(), query);
}

export function renderComparisonModelPicker(query: unknown = '') {
  return renderComparisonPicker({ view: comparisonPickerView(query) });
}

export function renderNutritionBenchmarkModal() {
  return renderBenchmark({ view: comparisonPickerView() });
}

function mealModelView(analysisKind: unknown = 'meal-photo') {
  const selection = getMealAISelection();
  return projectNutritionMealModel(selection, listNutritionVisionModels(), isNutritionLocalAICatalogLoading(), nutritionModelPricing(selection.provider, selection.model).priceLabel, analysisKind);
}

export function renderMealModelControl(analysisKind: unknown = 'meal-photo') {
  return renderMealModel({ view: mealModelView(analysisKind) });
}

// Meal records have their own history view. The retained parameter keeps the
// runtime import/call contract stable while the editor authors the handoff.
export function renderNutritionEditor(_meals: readonly NutritionRenderMeal[], options: NutritionEditorRenderOptions = {}) {
  return renderEditor({ view: projectNutritionEditor(options, localDateTimeValue(), getMealAnalysisAvailability().available, isDebugMode(), mealModelView()) });
}
