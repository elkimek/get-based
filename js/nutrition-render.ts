// nutrition-render.js — pure Meals & Nutrition view templates and formatting.

import { state } from './state.js';
import { getMealAnalysisAvailability } from './nutrition-analysis.js';
import { getDefaultNutritionComparisonModelValues, getMealAISelection, isNutritionLocalAICatalogLoading, listNutritionVisionModels, nutritionModelPricing } from './nutrition-ai-settings.js';
import { projectNutritionComparisonPicker } from './nutrition-benchmark-model.js';
import { assessFuelStrategy, calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { NUTRIENT_DEFINITIONS, NUTRIENT_GROUPS, nutrientFieldsForGroup } from './nutrition-nutrient-registry.js';
import { isNutritionContextEnabled } from './lab-context-settings.js';
import { getNutritionTargets, resolveNutritionTargets } from './nutrition-targets.js';
import { escapeAttr, escapeHTML, isDebugMode } from './utils.js';

import type { NutritionMeal, MealImage, MealComponent } from '../types/nutrition-data.js';
import type { StoredNutritionMeal } from './nutrition-sync-sanitize.js';
import type { MealPhotoAnalysis, analyzeMealPhoto } from './nutrition-analysis.js';
import type { computeNutritionHistory } from './nutrition-summary.js';
import type { summarizeFuelResponses } from './nutrition-fuel-mix.js';

// Opaque stored extensions retain their original coercions and field-read errors.
type RawFields<Value, Fields extends keyof Value = keyof Value> = { [Field in Fields]?: unknown };
export type DateInput = string | number | Date;
type ReviewField = readonly [string, string, string, string];
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
import { hasFiniteNumber, MEAL_TYPES, projectNutritionFuel, projectNutritionMealRow, projectNutritionHistory } from './nutrition-presentation-model.js';
export { formatNumber, hasFiniteNumber, MEAL_TYPES, mealTypeLabel, mealImages, HISTORY_MEAL_PAGE_SIZE } from './nutrition-presentation-model.js';

import { projectNutritionDashboard, projectNutritionFuelDashboard, nutritionDashboardGoalFields } from './nutrition-dashboard-model.js';
import type { NutritionDashboardSummary } from './nutrition-dashboard-model.js';

const ACTION_ATTR = 'data-nutrition-action';
const NUTRITION_STYLESHEET_URL = new URL('../css/nutrition.css', import.meta.url).href;
const RECENT_MEALS_DEFAULT_CAP = 3;
let nutritionStylesheetPromise: Promise<Event> | null = null;
const reviewFields = (fields: readonly typeof NUTRIENT_DEFINITIONS[number][]) => Object.freeze(fields.map(field => Object.freeze([
  field.key, field.label, field.unit, field.step,
] as const)));
const MACRO_REVIEW_FIELDS = reviewFields(nutrientFieldsForGroup('core'));
const DETAILED_REVIEW_GROUPS = Object.freeze(NUTRIENT_GROUPS
  .filter(group => group.id !== 'core')
  .map(group => Object.freeze({
    ...group,
    fields: reviewFields(nutrientFieldsForGroup(group.id)),
  })));
export const ALL_REVIEW_FIELDS = reviewFields(NUTRIENT_DEFINITIONS);

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
  return renderPresentation({ kind: 'fuel', view: projectNutritionFuel(mix, options) });
}

export function renderNutritionWidget() {
  return renderPresentation({ kind: 'dashboard', view: projectNutritionDashboard(state.nutritionSummary as NutritionDashboardSummary | null, resolveNutritionTargets()) });
}

export function buildNutritionHistoryView(history: NutritionRenderHistory | null | undefined, options: { storageError?: unknown; returnTo?: unknown } = {}) {
  const targets = resolveNutritionTargets();
  return projectNutritionHistory(history, targets, nutritionDashboardGoalFields(getNutritionTargets().widgetNutrients || []), isNutritionContextEnabled(), options);
}

export function renderNutritionHistoryModal(history: NutritionRenderHistory | null | undefined, options: { storageError?: unknown; returnTo?: unknown } = {}) {
  return renderPresentation({ kind: 'history', view: buildNutritionHistoryView(history, options) });
}

export function renderNutritionFuelWidget() {
  return renderPresentation({ kind: 'dashboard', view: projectNutritionFuelDashboard(state.nutritionSummary as NutritionDashboardSummary | null, resolveNutritionTargets()) });
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
  preview.innerHTML = `<span class="nutrition-photo-grid">${images.slice(0, 4).map((image, index) => `<img src="${escapeAttr(image.thumbnailUrl || image.dataUrl)}" alt="Meal view ${index + 1}">`).join('')}</span><span class="nutrition-photo-change">Change views</span>`;
}

function nutrientInputs(fields: readonly ReviewField[] = MACRO_REVIEW_FIELDS) {
  return fields.map(([key, label, unit, step]) => `<label class="nutrition-field"><span>${escapeHTML(label)} <small>${escapeHTML(unit)}</small><small id="nutrition-${escapeAttr(key)}-source" class="nutrition-nutrient-source" hidden></small></span><input id="nutrition-${escapeAttr(key)}" data-nutrition-nutrient="${escapeAttr(key)}" inputmode="decimal" type="number" min="0" step="${escapeAttr(step)}"></label>`).join('');
}

function detailedNutrientInputs() {
  return DETAILED_REVIEW_GROUPS.map(group => `<fieldset><legend>${escapeHTML(group.label)}</legend><div class="nutrition-nutrient-grid">${nutrientInputs(group.fields)}</div></fieldset>`).join('');
}

function mealTypeOptions() {
  return `<option value="">Select occasion…</option>${MEAL_TYPES.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHTML(label)}</option>`).join('')}`;
}

function renderRecentMeal(meal: NutritionRenderMeal, { origin = 'editor' }: {origin?: unknown} = {}) {
  return renderPresentation({ kind: 'meal', view: projectNutritionMealRow(meal, origin) });
}

function renderRecentMeals(meals: readonly NutritionRenderMeal[], storageError: unknown) {
  if (storageError) return `<div class="nutrition-empty nutrition-storage-error" role="alert">${escapeHTML(storageError)}</div>`;
  if (!meals.length) return '<div class="nutrition-empty">No meals logged for this profile.</div>';
  const visible = meals.slice(0, RECENT_MEALS_DEFAULT_CAP);
  const remaining = meals.slice(RECENT_MEALS_DEFAULT_CAP);
  const remainingLabel = `${remaining.length} more meal${remaining.length === 1 ? '' : 's'}`;
  return `<div class="nutrition-recent-list">${visible.map(renderRecentMeal as typeof renderRecentMeal & ((meal: NutritionRenderMeal, index: number) => string)).join('')}</div>${remaining.length ? `<div id="nutrition-recent-more" class="nutrition-recent-list nutrition-recent-more" hidden>${remaining.map(renderRecentMeal as typeof renderRecentMeal & ((meal: NutritionRenderMeal, index: number) => string)).join('')}</div><button type="button" class="nutrition-recent-toggle" aria-expanded="false" aria-controls="nutrition-recent-more" ${actionAttrs('toggle-recent', { remaining: remaining.length })}>Show ${remainingLabel}</button>` : ''}`;
}

export function renderMealDetail(meal: NutritionRenderMeal, options: { returnTo?: unknown } = {}) {
  return renderPresentation({ kind: 'detail', view: projectNutritionMealDetail(meal, options) });
}

function comparisonPickerView(query: unknown = '') {
  const models = listNutritionVisionModels();
  return projectNutritionComparisonPicker(models, getDefaultNutritionComparisonModelValues(models), isNutritionLocalAICatalogLoading(), query);
}

export function renderComparisonModelPicker(query: unknown = '') {
  return renderPresentation({ kind: 'comparison-picker', view: comparisonPickerView(query) });
}

export function renderNutritionBenchmarkModal() {
  return renderPresentation({ kind: 'benchmark', view: comparisonPickerView() });
}

export function renderMealModelControl() {
  const selection = getMealAISelection();
  const checkingLocal = selection.local && isNutritionLocalAICatalogLoading();
  const selectedValue = selection.usesAutomatic ? '' : JSON.stringify({ provider: selection.provider, model: selection.model });
  const models = listNutritionVisionModels().filter(model => model.provider === selection.provider);
  const options = models.map(model => `<option value="${escapeAttr(model.value)}"${model.value === selectedValue ? ' selected' : ''}>${escapeHTML(model.modelDisplay)}</option>`).join('');
  const hasSelectedRoute = !selectedValue || models.some(model => model.value === selectedValue);
  const unavailableSaved = selectedValue && !hasSelectedRoute
    ? `<option value="${escapeAttr(selectedValue)}" selected>${escapeHTML(selection.modelDisplay)} · saved choice</option>`
    : '';
  const pricing = nutritionModelPricing(selection.provider, selection.model);
  const status = selection.available ? (selection.adapter === 'codex' ? 'Connected' : selection.local ? 'Local' : 'Ready') : checkingLocal ? 'Checking…' : 'Unavailable';
  const automaticLabel = selection.fallback
    ? `Automatic fallback · ${selection.modelDisplay}`
    : `Follow chat assistant · ${selection.modelDisplay}`;
  return `<section id="nutrition-meal-model-control" class="nutrition-meal-model-control"><label class="nutrition-meal-model-select"><span id="nutrition-model-purpose">Photo model</span><select aria-label="Meal photo analysis model" data-nutrition-model-route><option value=""${selection.usesAutomatic ? ' selected' : ''}${selection.available ? '' : ' disabled'}>${escapeHTML(automaticLabel)}</option>${unavailableSaved}${options}</select></label><div class="nutrition-meal-model-foot"><span>${escapeHTML(selection.providerDisplay)} · ${escapeHTML(pricing.priceLabel)} · <span class="nutrition-meal-model-status${selection.available ? ' is-ready' : ' is-unavailable'}">${status}</span></span><button type="button" class="nutrition-meal-model-settings" ${actionAttrs('open-ai-settings')}>AI settings</button></div></section>`;
}

function renderComparisonLauncher() {
  if (!isDebugMode()) return '';
  return `<button type="button" class="nutrition-compare-launch" ${actionAttrs('toggle-comparison')}><span class="nutrition-compare-launch-icon" aria-hidden="true">⇄</span><span><strong>Open benchmark</strong><small>Debug mode · same photos, 2–4 models</small></span><span aria-hidden="true">→</span></button>`;
}

export function renderNutritionEditor(meals: readonly NutritionRenderMeal[], { editingMealId = '', reusedMealId = '', storageError = '', returnTo = '', returnMealId = '', returnMealOrigin = 'history' }: NutritionEditorRenderOptions = {}) {
  const title = editingMealId ? 'Edit meal' : reusedMealId ? 'Log this meal again' : 'Log a meal';
  const subtitle = editingMealId ? 'Update the saved meal.' : reusedMealId ? 'Adjust the time or portions.' : 'Use a photo, scan a label, or enter values manually.';
  const returnControl = returnTo === 'history'
    ? `<button type="button" class="nutrition-route-back" ${actionAttrs('return-history')}>← Meals &amp; Nutrition</button>`
    : returnTo === 'detail' && returnMealId
      ? `<button type="button" class="nutrition-route-back" ${actionAttrs('return-detail', { id: returnMealId, origin: returnMealOrigin })}>← Meal details</button>`
      : '';
  return `<button type="button" class="modal-close" aria-label="Close Meals & Nutrition" ${actionAttrs('close')}>&times;</button>${returnControl}<div class="nutrition-modal-head"><div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(subtitle)}</p></div></div><div class="nutrition-entry-grid"><section class="nutrition-photo-panel"><div class="nutrition-capture-tabs" role="group" aria-label="Photo content"><button type="button" class="is-active" aria-pressed="true" ${actionAttrs('set-kind', { kind: 'meal-photo' })}>Meal photo</button><button type="button" aria-pressed="false" ${actionAttrs('set-kind', { kind: 'nutrition-label' })}>Nutrition label</button></div><label class="nutrition-photo-picker" for="nutrition-photo-input"><span class="nutrition-photo-preview" id="nutrition-photo-preview"><span aria-hidden="true">＋</span><strong id="nutrition-photo-prompt">Add meal photo</strong><small>Up to 4 photos · 20 MB each</small></span><input id="nutrition-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" multiple ${actionAttrs('photo')}></label><div id="nutrition-label-consumption" class="nutrition-label-consumption" hidden><label class="nutrition-field"><span>Amount eaten</span><input id="nutrition-consumed-amount" inputmode="decimal" type="number" min="0.01" step="0.1" value="1"></label><label class="nutrition-field"><span>Unit</span><select id="nutrition-consumed-unit"><option value="servings">serving(s)</option><option value="g">grams</option><option value="ml">milliliters</option><option value="packages">package(s)</option></select></label></div><label class="nutrition-field nutrition-field-wide nutrition-known-details"><span>Known details <small>optional, improves the estimate</small></span><textarea id="nutrition-known-details" rows="2" maxlength="500" placeholder="e.g. Fried Edam cheese, 150 g; tartar sauce; beer was not consumed"></textarea></label><button type="button" id="nutrition-analyze-btn" class="import-btn import-btn-primary" ${actionAttrs('analyze')} ${getMealAnalysisAvailability().available ? '' : 'disabled'}>Analyze photo</button>${renderMealModelControl()}${renderComparisonLauncher()}<div id="nutrition-privacy-line" class="nutrition-privacy-line">Sent only when you choose Analyze photo; originals are not saved. First cloud use asks for approval.</div><div id="nutrition-analysis-progress" class="nutrition-analysis-progress" aria-live="polite" hidden></div><div id="nutrition-analysis-status" class="nutrition-analysis-status" role="status" aria-live="polite"></div></section><section class="nutrition-review-panel"><div id="nutrition-comparison-return" class="nutrition-comparison-return" hidden><span id="nutrition-comparison-return-copy">Benchmark estimate loaded.</span><button type="button" class="nutrition-text-btn" ${actionAttrs('show-comparison')}>Benchmark →</button></div><div class="nutrition-review-heading"><h4>Review meal</h4></div><div id="nutrition-review-evidence" class="nutrition-review-evidence" hidden></div><label class="nutrition-field nutrition-field-wide"><span>Meal name <small>required</small></span><input id="nutrition-meal-name" maxlength="120" placeholder="e.g. Lentil bowl"></label><div id="nutrition-correction-review" class="nutrition-correction-review" hidden><div id="nutrition-correction-copy"><strong>Wrong identification?</strong> Edit the meal name to recalculate the estimate.</div><button type="button" id="nutrition-recalculate-btn" class="import-btn import-btn-secondary" ${actionAttrs('reanalyze')} disabled>Recalculate estimate</button></div><div class="nutrition-review-meta"><label class="nutrition-field"><span>Meal occasion <small>required</small></span><select id="nutrition-meal-type">${mealTypeOptions()}</select></label><label class="nutrition-field"><span>When</span><input id="nutrition-eaten-at" type="datetime-local" value="${escapeAttr(localDateTimeValue())}"></label></div><div class="nutrition-review-section-title"><strong>Energy &amp; macros</strong><span>Unknown values stay blank.</span></div><div class="nutrition-nutrient-grid">${nutrientInputs()}</div><div id="nutrition-fuel-preview" class="nutrition-fuel-preview" aria-live="polite" hidden></div><details class="nutrition-more-nutrients"><summary>Detailed nutrition</summary><div id="nutrition-nutrient-estimate-summary" class="nutrition-nutrient-estimate-summary">Detailed nutrient values come from the selected AI model.</div><div class="nutrition-nutrient-groups">${detailedNutrientInputs()}</div></details><div id="nutrition-components" class="nutrition-components"></div><div id="nutrition-label-details" class="nutrition-label-summary" hidden></div><div id="nutrition-review-checks" class="nutrition-review-checks" hidden></div><label class="nutrition-field nutrition-field-wide"><span>Note <small>optional</small></span><textarea id="nutrition-note" rows="2" maxlength="500" placeholder="Anything you want to remember about this meal"></textarea></label><div class="nutrition-review-actions"><p id="nutrition-save-requirement" role="status"></p><button type="button" id="nutrition-save-btn" class="import-btn import-btn-primary" aria-describedby="nutrition-save-requirement" ${actionAttrs('save')}>${editingMealId ? 'Save changes' : 'Save meal'}</button></div></section></div><section class="nutrition-recent"><div class="nutrition-section-title">Recent meals</div>${renderRecentMeals(meals, storageError)}</section>`;
}
