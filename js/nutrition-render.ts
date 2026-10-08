// nutrition-render.js — pure Meals & Nutrition view templates and formatting.

import { state } from './state.js';
import { getMealAnalysisAvailability, nutritionUsageSummary } from './nutrition-analysis.js';
import { getDefaultNutritionComparisonModelValues, getMealAISelection, isNutritionLocalAICatalogLoading, listNutritionVisionModels, nutritionModelPricing } from './nutrition-ai-settings.js';
import { MEAL_COMPARISON_REFERENCE_FIELDS } from './nutrition-comparison.js';
import { assessFuelStrategy, calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { NUTRIENT_DEFINITIONS, NUTRIENT_GROUPS, nutrientFieldsForGroup } from './nutrition-nutrient-registry.js';
import { isNutritionContextEnabled } from './lab-context-settings.js';
import { getNutritionTargets, resolveNutritionTargets } from './nutrition-targets.js';
import { escapeAttr, escapeHTML, isDebugMode } from './utils.js';

import type { NutritionMeal, MealImage, MealComponent } from '../types/nutrition-data.js';
import type { StoredNutritionMeal } from './nutrition-sync-sanitize.js';
import type { MealPhotoAnalysis, analyzeMealPhoto } from './nutrition-analysis.js';
import type { computeNutritionHistory, computeNutritionSummary } from './nutrition-summary.js';
import type { summarizeFuelResponses } from './nutrition-fuel-mix.js';
import type { MealComparisonReferenceField } from './nutrition-comparison.js';

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
type MealSourceReader = RawFields<NativeSource, 'kind' | 'modelDisplay' | 'model' | 'provider' | 'usage'> & {
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
type SummaryReader = RawFields<ReturnType<typeof computeNutritionSummary>, 'totalMeals'> & {windows?: {d7?: PeriodReader | null} | null};
type ResolvedTargets = ReturnType<typeof resolveNutritionTargets>;
export type TargetReader = Partial<ResolvedTargets> & { [key: string]: unknown };
export interface FuelOverlapRenderOptions {scope?: 'window' | 'meal'; compact?: unknown; fallbackTotalMeals?: unknown; period?: PeriodReader | null | undefined; targets?: Parameters<typeof assessFuelStrategy>[1]}
export interface NutritionEditorRenderOptions {editingMealId?: unknown; reusedMealId?: unknown; storageError?: unknown; returnTo?: unknown; returnMealId?: unknown; returnMealOrigin?: unknown}

import { buildNutritionTargetsView, buildNutritionFluidView, localDateTimeValue } from './nutrition-entry-model.js';
export { localDateTimeValue } from './nutrition-entry-model.js';
import { renderHTML as renderPresentation } from './components/NutritionPresentation.svelte.html.js';
import { formatNumber, hasFiniteNumber, MEAL_TYPES, mealTypeLabel, mealImages, projectNutritionGoal, projectNutritionRing, projectNutritionFuel, projectNutritionMealRow, projectNutritionHistory } from './nutrition-presentation-model.js';
export { formatNumber, hasFiniteNumber, MEAL_TYPES, mealTypeLabel, mealImages, HISTORY_MEAL_PAGE_SIZE } from './nutrition-presentation-model.js';

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
const NUTRIENT_DETAILS = Object.freeze(NUTRIENT_DEFINITIONS.map(field => Object.freeze([
  field.key, field.label, field.unit,
] as const)));
const WIDGET_TARGETS = new Map<string, [string, string, string]>([
  ['proteinG', ['proteinG', 'goal', 'Protein']],
  ['carbohydrateG', ['carbohydrateG', 'goal', 'Carbohydrate']],
  ['fatG', ['fatG', 'goal', 'Fat']],
  ['fiberG', ['fiberG', 'minimum', 'Fiber']],
  ['fluidMl', ['fluidMl', 'fluid', 'Logged drinks']],
  ['sugarG', ['sugarG', 'limit', 'Sugar guide']],
  ['sodiumMg', ['sodiumMg', 'limit', 'Sodium guide']],
]);
const DASHBOARD_GOAL_FIELDS: readonly GoalField[] = Object.freeze(NUTRIENT_DETAILS
  .filter(([key]) => key !== 'energyKcal')
  .map(([key, label, unit]) => {
    const [targetKey = '', kind = 'observe', widgetLabel = label] = WIDGET_TARGETS.get(key) || [];
    return (
      [key, widgetLabel, unit, targetKey, kind] as const
    );
  }));

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

function widgetGoalRow(period: PeriodReader | null | undefined, targets: TargetReader | null | undefined, field: GoalField) {
  return renderPresentation({ kind: 'goal', view: projectNutritionGoal(period, targets, field) });
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderSevenDayCoverage(period: PeriodReader | null | undefined, now = new Date()) {
  const logged = new Set(Array.isArray(period?.loggedDayKeys) ? period.loggedDayKeys as unknown[] : []);
  const days: string[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDayKey(date);
    const active = logged.has(key);
    days.push(`<div class="nutrition-day${active ? ' is-logged' : ''}" title="${escapeAttr(`${date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}: ${active ? 'intake logged' : 'not logged'}`)}"><span>${escapeHTML(date.toLocaleDateString([], { weekday: 'narrow' }))}</span><i></i></div>`);
  }
  return `<div class="nutrition-day-coverage"><div><strong>Days with entries</strong><span>${period?.loggedDays || 0} of 7 days</span></div><div class="nutrition-day-strip" aria-label="Entries logged on ${period?.loggedDays || 0} of the last 7 days">${days.join('')}</div><small>A day can still be partial when only some meals were entered.</small></div>`;
}

function targetRing(label: string, value: unknown, target: unknown, unit: string, accent = false, personal = true) {
  return renderPresentation({ kind: 'ring', view: projectNutritionRing(label, value, target, unit, accent, personal) });
}

export function renderFuelOverlapCard(mix: FuelMixReader | null | undefined, options: FuelOverlapRenderOptions = {}) {
  return renderPresentation({ kind: 'fuel', view: projectNutritionFuel(mix, options) });
}

export function renderNutritionWidget() {
  const summary = state.nutritionSummary as SummaryReader | null;
  const hasMeals = Number(summary?.totalMeals || 0) > 0;
  const period = summary?.windows?.d7;
  const targets = resolveNutritionTargets();
  const calorieAverage = period?.dailyAverages?.energyKcal;
  const selectedNutrients = new Set(targets.widgetNutrients || []);
  const visibleGoalRows = DASHBOARD_GOAL_FIELDS.filter(([key]) => selectedNutrients.has(key));
  return `<div class="nutrition-widget">
    <div class="nutrition-widget-actions-row"><div class="nutrition-widget-actions">${hasMeals ? `<button type="button" class="dashboard-action-btn" ${actionAttrs('open-history')}>History</button>` : ''}<button type="button" class="dashboard-action-btn" ${actionAttrs('open-targets')}>Customize</button><button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${actionAttrs('open')}>Log meal</button></div></div>
    ${hasMeals && !targets.configured ? `<div class="nutrition-widget-starter-note"><span>Using starter guides</span><button type="button" ${actionAttrs('open-targets')}>Review and personalize</button></div>` : ''}
    ${hasMeals ? `<div class="nutrition-recorded-notice"><strong>Recorded intake, not verified full days</strong><span>Averages include what you entered; missing meals remain unknown.</span></div><div class="nutrition-dashboard-grid"><section class="nutrition-dashboard-hero"><div class="nutrition-target-rings">${targetRing('Energy', calorieAverage, targets.energyKcal, 'kcal', false, targets.configured)}</div>${renderSevenDayCoverage(period)}</section><section class="nutrition-goal-list"><div class="nutrition-goal-list-head"><strong>Recorded daily averages</strong><span>Last 7 days · ${visibleGoalRows.length} nutrient rows</span></div>${visibleGoalRows.length ? `<div class="nutrition-goal-grid${visibleGoalRows.length > 4 ? ' is-expanded' : ''}">${visibleGoalRows.map(field => widgetGoalRow(period, targets, field)).join('')}</div>` : '<div class="nutrition-comparison-empty">Choose nutrients in Customize.</div>'}</section></div>` : '<div class="nutrition-widget-empty"><span aria-hidden="true">◎</span><div><strong>No intake logged yet</strong><p>Log a meal to start seven-day recorded averages.</p></div></div>'}
  </div>`;
}

export function buildNutritionHistoryView(history: NutritionRenderHistory | null | undefined, options: { storageError?: unknown; returnTo?: unknown } = {}) {
  const targets = resolveNutritionTargets();
  const selected = new Set(getNutritionTargets().widgetNutrients || []);
  return projectNutritionHistory(history, targets, DASHBOARD_GOAL_FIELDS.filter(([key]) => selected.has(key)), isNutritionContextEnabled(), options);
}

export function renderNutritionHistoryModal(history: NutritionRenderHistory | null | undefined, options: { storageError?: unknown; returnTo?: unknown } = {}) {
  return renderPresentation({ kind: 'history', view: buildNutritionHistoryView(history, options) });
}

export function renderNutritionFuelWidget() {
  const summary = state.nutritionSummary as SummaryReader | null;
  const period = summary?.windows?.d7;
  const targets = resolveNutritionTargets();
  const foodMealCount = Number.isFinite(Number(period?.foodMeals)) ? Number(period!.foodMeals) : Number(period?.meals || 0);
  return `<div class="nutrition-fuel-widget">${renderFuelOverlapCard(period?.fuelOverlap, { scope: 'window', fallbackTotalMeals: foodMealCount, period, targets })}</div>`;
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

function renderDetailList(title: string, items: unknown) {
  const rows = (Array.isArray(items) ? items as unknown[] : []).map(item => `<li>${escapeHTML(item)}</li>`).join('');
  return rows ? `<section class="nutrition-detail-section"><h4>${escapeHTML(title)}</h4><ul>${rows}</ul></section>` : '';
}

function responseChoice(name: string, value: number, label: string, selected: unknown) {
  return `<label class="nutrition-response-choice"><input type="radio" name="${escapeAttr(name)}" value="${value}"${Number(selected) === value ? ' checked' : ''}><span>${escapeHTML(label)}</span></label>`;
}

function renderFuelResponseCheckIn(meal: NutritionRenderMeal) {
  const response = (meal?.responseCheckIn || {}) as {satiety2h?: unknown; energy2h?: unknown};
  const saved = hasFiniteNumber(response?.satiety2h) || hasFiniteNumber(response?.energy2h);
  return `<section class="nutrition-response-card"><div class="nutrition-response-head"><div><span class="nutrition-fuel-kicker">Personal evidence</span><strong>How did this meal feel 2–3 hours later?</strong><small>Repeated check-ins can compare meals with different carb/fat compositions. They do not measure metabolism or prove cause.</small></div>${saved ? '<span class="nutrition-fuel-badge">Checked in</span>' : '<span class="nutrition-fuel-badge">Optional</span>'}</div><div class="nutrition-response-fields"><fieldset><legend>Hunger</legend><div>${responseChoice('nutrition-response-satiety', 1, 'Hungry again', response.satiety2h)}${responseChoice('nutrition-response-satiety', 2, 'Neutral', response.satiety2h)}${responseChoice('nutrition-response-satiety', 3, 'Still satisfied', response.satiety2h)}</div></fieldset><fieldset><legend>Energy</legend><div>${responseChoice('nutrition-response-energy', 1, 'Slump', response.energy2h)}${responseChoice('nutrition-response-energy', 2, 'Steady', response.energy2h)}${responseChoice('nutrition-response-energy', 3, 'Energized', response.energy2h)}</div></fieldset></div><div class="nutrition-response-actions"><small>Saved and cross-synced with this meal. It is not added to the compact AI nutrition summary.</small><div>${saved ? `<button type="button" class="nutrition-text-btn" ${actionAttrs('clear-response', { id: meal.id })}>Clear</button>` : ''}<button type="button" class="import-btn import-btn-primary" ${actionAttrs('save-response', { id: meal.id })}>Save check-in</button></div></div></section>`;
}

export function renderMealDetail(meal: NutritionRenderMeal, { returnTo = 'history' }: {returnTo?: unknown} = {}) {
  const eaten = new Date(meal.eatenAt as DateInput);
  const date = Number.isFinite(eaten.getTime()) ? eaten.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) : '';
  const nutrientRows = NUTRIENT_DETAILS.flatMap(([key, label, unit]) => hasFiniteNumber((meal.nutrients as Record<string, unknown> | null | undefined)?.[key]) ? [`<div><span>${escapeHTML(label)}</span><strong>${formatNumber((meal.nutrients as Record<string, unknown>)[key])} <small>${escapeHTML(unit)}</small></strong></div>`] : []).join('');
  const componentRows = ((meal.components || []) as MealComponentReader[]).map(item => `<div><span>${escapeHTML(item.name)}</span><strong>${item.quantityG == null ? '—' : `${formatNumber(item.quantityG, 0)} g`}</strong></div>`).join('');
  const confidence = meal.confidence == null ? '' : 'Uncalibrated identity self-check';
  const usage = nutritionUsageSummary((meal.source as MealSourceReader | null | undefined));
  const usageModel = (meal.source as MealSourceReader | null | undefined)?.modelDisplay || (meal.source as MealSourceReader | null | undefined)?.model || 'Selected model';
  const hasAIUsageSource = (meal.source as MealSourceReader | null | undefined)?.kind === 'ai-photo-estimate' || (meal.source as MealSourceReader | null | undefined)?.kind === 'ai-label-scan';
  const usageDetails = usage
    ? `${usageModel} · ${usage.costLabel} · ${usage.totalTokens.toLocaleString()} tokens (${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out)`
    : hasAIUsageSource ? `${usageModel} · token usage was not reported by the provider` : '';
  const reusedOriginal = (meal.source as MealSourceReader | null | undefined)?.originalSource;
  const reusedOriginalLabel = reusedOriginal?.kind === 'ai-label-scan' ? 'label scan' : reusedOriginal?.kind === 'ai-photo-estimate' ? 'photo estimate' : reusedOriginal?.kind === 'barcode-database' ? 'barcode database' : 'manual/reviewed values';
  const sourceModel = (meal.source as MealSourceReader | null | undefined)?.modelDisplay || (meal.source as MealSourceReader | null | undefined)?.model || 'AI model';
  const source = (meal.source as MealSourceReader | null | undefined)?.kind === 'ai-label-scan' ? `${sourceModel} label scan${(meal.source as MealSourceReader).provider ? ` via ${(meal.source as MealSourceReader).provider}` : ''}` : (meal.source as MealSourceReader | null | undefined)?.kind === 'ai-photo-estimate' ? `${sourceModel}${(meal.source as MealSourceReader).provider ? ` via ${(meal.source as MealSourceReader).provider}` : ''}` : (meal.source as MealSourceReader | null | undefined)?.kind === 'barcode-database' ? `${(meal.source as MealSourceReader).foodData?.sourceName || 'Open Food Facts'} · barcode ${(meal.source as MealSourceReader).foodData?.barcode || ''}` : (meal.source as MealSourceReader | null | undefined)?.kind === 'reused-meal' ? `Logged again from a reviewed meal · originally ${reusedOriginalLabel}` : 'Manual entry';
  const corrected = (meal.source as MealSourceReader | null | undefined)?.correction?.userProvidedMealName ? 'Identification corrected' : '';
  const mealType = mealTypeLabel(meal.mealType);
  const label = (meal.source as MealSourceReader | null | undefined)?.label;
  const images = mealImages(meal);
  const editedPortions = Number((meal.source as MealSourceReader | null | undefined)?.review?.editedPortions || 0);
  const editedNutrients = Array.isArray((meal.source as MealSourceReader | null | undefined)?.review?.editedNutrients) ? ((meal.source as MealSourceReader).review!.editedNutrients as unknown[]).length : 0;
  const editedIdentities = Array.isArray((meal.source as MealSourceReader | null | undefined)?.review?.editedComponentIdentities) ? ((meal.source as MealSourceReader).review!.editedComponentIdentities as unknown[]).length : 0;
  const reviewParts = [editedIdentities && `${editedIdentities} ingredient identit${editedIdentities === 1 ? 'y' : 'ies'} corrected`, editedPortions && `${editedPortions} portion${editedPortions === 1 ? '' : 's'} adjusted`, editedNutrients && `${editedNutrients} nutrient value${editedNutrients === 1 ? '' : 's'} adjusted`].filter(Boolean);
  const labelDetails = label ? [label.servingSizeText && `Serving size: ${label.servingSizeText}`, hasFiniteNumber(label.servingsPerContainer) && `${formatNumber(label.servingsPerContainer)} servings/container`, hasFiniteNumber(label.consumedAmount) && `${formatNumber(label.consumedAmount)} ${label.consumedUnit || 'servings'} logged`].filter(Boolean).join(' · ') : '';
  const foodData = (meal.source as MealSourceReader | null | undefined)?.foodData;
  const foodDataDetails = foodData ? [foodData.schemaVersion != null && `Product schema ${foodData.schemaVersion}`, foodData.productUpdatedAt && `Product updated ${new Date(foodData.productUpdatedAt as DateInput).toLocaleDateString([], { dateStyle: 'medium' })}`, foodData.cacheHit ? 'Loaded from encrypted local cache' : 'Fetched when logged', 'Community database values reviewed by user'].filter(Boolean).join(' · ') : '';
  const foodComposition = (meal.source as MealSourceReader | null | undefined)?.foodComposition;
  const foodCompositionDetails = foodComposition ? [
    `Historical source: ${foodComposition.sourceName || 'food-composition database'} · ${foodComposition.dataset || 'legacy dataset'}`,
    `${Number(foodComposition.matchedComponents || 0)}/${Number(foodComposition.totalComponents || 0)} ingredients matched`,
    Array.isArray(foodComposition.completeMicronutrientKeys) && foodComposition.completeMicronutrientKeys.length
      ? `${foodComposition.completeMicronutrientKeys.length} micronutrients calculated from reviewed portions`
      : 'Unmatched nutrients remain unknown',
  ].join(' · ') : '';
  const overviewFields = [
    ['energyKcal', 'Energy', 'kcal', 0], ['proteinG', 'Protein', 'g', 1],
    ['carbohydrateG', 'Carbs', 'g', 1], ['fatG', 'Fat', 'g', 1],
  ] as const;
  const overview = overviewFields.flatMap(([key, labelText, unit, digits]) => hasFiniteNumber((meal.nutrients as Record<string, unknown> | null | undefined)?.[key])
    ? [`<div><span>${escapeHTML(labelText)}</span><strong>${formatNumber((meal.nutrients as Record<string, unknown>)[key], Number(digits))}</strong><small>${escapeHTML(unit)}</small></div>`]
    : []).join('');
  const fuelMix = calculateFuelOverlap(meal?.nutrients as Parameters<typeof calculateFuelOverlap>[0]);
  const ingredientsSection = componentRows ? `<section class="nutrition-detail-section"><h4>Ingredients and reviewed portions</h4><div class="nutrition-detail-components">${componentRows}</div></section>` : '';
  const nutrientsSection = nutrientRows ? `<section class="nutrition-detail-section"><h4>Nutrients</h4><div class="nutrition-detail-nutrients">${nutrientRows}</div></section>` : '<div class="nutrition-empty">No nutrient estimates were saved for this meal.</div>';
  const reviewSections = `${renderDetailList('Estimate assumptions', meal.assumptions)}${renderDetailList('Remaining checks', meal.warnings)}${meal.note ? `<section class="nutrition-detail-section"><h4>Note</h4><p>${escapeHTML(meal.note)}</p></section>` : ''}`;
  return `<button type="button" class="modal-close" aria-label="Close Meals & Nutrition" ${actionAttrs('close')}>&times;</button>
    <div class="nutrition-modal-head"><div><h3>${escapeHTML(meal.name || 'Meal')}</h3><p>${escapeHTML(date)}</p></div></div>
    <div class="nutrition-detail-layout">
      ${images.length ? `<div class="nutrition-detail-gallery">${images.map((image, index) => `<img class="nutrition-detail-photo" src="${escapeAttr((image as MealImageReader).dataUrl || (image as MealImageReader).thumbnailUrl)}" alt="Saved meal view ${index + 1}">`).join('')}</div>` : ''}
      <div class="nutrition-detail-overview">
        <div class="nutrition-detail-meta">${mealType ? `<span>${escapeHTML(mealType)}</span>` : ''}<span>${escapeHTML(source)}</span>${confidence ? `<span>${escapeHTML(confidence)}</span>` : ''}${corrected ? `<span>${escapeHTML(corrected)}</span>` : ''}</div>
        ${overview ? `<div class="nutrition-detail-summary">${overview}</div>` : ''}
        ${fuelMix ? `${renderFuelOverlapCard(fuelMix, { scope: 'meal' })}${renderFuelResponseCheckIn(meal)}` : ''}
        <div class="nutrition-detail-evidence">${usageDetails ? `<div class="nutrition-review-evidence"><strong>AI request usage</strong><span class="nutrition-analysis-usage">${escapeHTML(usageDetails)}</span></div>` : ''}${reviewParts.length ? `<div class="nutrition-review-evidence"><strong>User review</strong><span>${escapeHTML(reviewParts.join(' · '))}</span></div>` : ''}${labelDetails ? `<div class="nutrition-label-summary">${escapeHTML(labelDetails)}</div>` : ''}${foodDataDetails ? `<div class="nutrition-label-summary">${escapeHTML(foodDataDetails)}</div>` : ''}${foodCompositionDetails ? `<div class="nutrition-label-summary">${escapeHTML(foodCompositionDetails)}</div>` : ''}</div>
      </div>
      <div class="nutrition-detail-content-grid"><div class="nutrition-detail-column">${ingredientsSection}${reviewSections}</div><div class="nutrition-detail-column">${nutrientsSection}</div></div>
    </div>
    <div class="nutrition-detail-actions"><button type="button" class="import-btn import-btn-secondary" ${actionAttrs('back', { origin: returnTo })}>← ${returnTo === 'history' ? 'Meals' : 'Meal entry'}</button><button type="button" class="import-btn import-btn-secondary" ${actionAttrs('reuse', { id: meal.id, origin: returnTo })}>Log again</button><button type="button" class="import-btn import-btn-primary" ${actionAttrs('edit', { id: meal.id, origin: returnTo })}>Edit meal</button><button type="button" class="import-btn import-btn-secondary" ${actionAttrs('delete', { id: meal.id, origin: returnTo })}>Delete meal</button></div>`;
}

function renderComparisonModelChoices(models: ReturnType<typeof listNutritionVisionModels>, defaults: ReadonlySet<string>) {
  if (models.length < 2) return '<div class="nutrition-comparison-empty">Connect or load two vision models in AI Settings.</div>';
  return `<div id="nutrition-comparison-model-list" class="nutrition-comparison-models">${models.map(model => {
    const routeLabel = model.current ? ' · meal model' : model.providerCurrent ? ' · active model' : '';
    const searchText = `${model.providerDisplay} ${model.provider} ${model.modelDisplay} ${model.model}`;
    return `<label class="nutrition-comparison-model${model.current ? ' is-current' : ''}" data-nutrition-model-search="${escapeAttr(searchText)}"><input type="checkbox" data-nutrition-comparison-model value="${escapeAttr(model.value)}"${defaults.has(model.value) ? ' checked' : ''}><span class="nutrition-comparison-model-check" aria-hidden="true">✓</span><span class="nutrition-comparison-model-copy"><span class="nutrition-comparison-model-provider">${escapeHTML(model.providerDisplay)}${routeLabel}</span><strong>${escapeHTML(model.modelDisplay)}</strong><small class="nutrition-model-price">${escapeHTML(model.priceLabel)}</small><em data-nutrition-benchmarked hidden>Compared</em></span></label>`;
  }).join('')}</div><div class="nutrition-comparison-search-empty" data-nutrition-comparison-search-empty hidden>No models match this search.</div>`;
}

export function renderComparisonModelPicker(query: unknown = '') {
  const models = listNutritionVisionModels();
  const defaults = new Set(getDefaultNutritionComparisonModelValues(models));
  const providerCount = new Set(models.map(model => model.provider)).size;
  const providerLabel = `${providerCount} ${providerCount === 1 ? 'provider' : 'providers'} available`;
  let providerSummary = providerLabel;
  if (isNutritionLocalAICatalogLoading()) providerSummary = `${providerLabel} · checking Local AI…`;
  else if (providerCount > 1) providerSummary = `${providerLabel} · cross-provider pair selected`;
  const search = models.length >= 2
    ? `<label class="nutrition-comparison-model-search"><span>Search models</span><input type="search" data-nutrition-comparison-search value="${escapeAttr(query)}" maxlength="160" autocomplete="off" placeholder="Provider, model name, or ID" aria-controls="nutrition-comparison-model-list"><small data-nutrition-comparison-search-status aria-live="polite">${models.length} available</small></label>`
    : '';
  return `<section class="nutrition-comparison-model-picker"><div class="nutrition-comparison-section-title"><div><strong>Models</strong><small>${escapeHTML(providerSummary)}</small></div><span id="nutrition-comparison-model-limit">${defaults.size} of 4 selected</span></div>${search}${renderComparisonModelChoices(models, defaults)}</section>`;
}

function renderComparisonWorkspace() {
  const renderReferenceField = ([key, label, unit, , step]: MealComparisonReferenceField) => `<label class="nutrition-field"><span>${escapeHTML(label)} <small>${escapeHTML(unit)}</small></span><input data-nutrition-reference="${escapeAttr(key)}" inputmode="decimal" type="number" min="0" step="${escapeAttr(step || '0.1')}"></label>`;
  const primaryFields = MEAL_COMPARISON_REFERENCE_FIELDS
    .filter(([, , , , , group]) => group === 'amount' || group === 'core')
    .map(renderReferenceField)
    .join('');
  const detailedGroups = NUTRIENT_GROUPS.filter(group => group.id !== 'core').map(group => {
    const fields = MEAL_COMPARISON_REFERENCE_FIELDS
      .filter(([, , , , , fieldGroup]) => fieldGroup === group.id)
      .map(renderReferenceField)
      .join('');
    return `<fieldset><legend>${escapeHTML(group.label)}</legend><div class="nutrition-comparison-reference-grid">${fields}</div></fieldset>`;
  }).join('');
  return `<section id="nutrition-model-comparison" class="nutrition-model-comparison">
    <div class="nutrition-comparison-head"><div><h4>Compare meal estimates</h4><p>Each model receives the same photos. Selected models run in parallel.</p></div><div class="nutrition-comparison-head-actions"><button type="button" class="nutrition-comparison-presentation-btn" aria-label="Open full-screen comparison" title="Open full-screen comparison" aria-pressed="false" ${actionAttrs('toggle-comparison-presentation')} hidden><span aria-hidden="true">⛶</span><span data-nutrition-presentation-label>Full screen</span></button></div></div>
    <div id="nutrition-comparison-history" class="nutrition-comparison-history" hidden></div>
    <div class="nutrition-comparison-setup">
      <section class="nutrition-comparison-photo-source"><div class="nutrition-comparison-section-title"><div><strong>Photos</strong><small>Benchmark input</small></div><span>Required to run</span></div><div class="nutrition-benchmark-photo-row"><label class="nutrition-benchmark-photo-picker" for="nutrition-benchmark-photo-input"><span id="nutrition-benchmark-photo-preview" class="nutrition-benchmark-photo-preview"><span aria-hidden="true">＋</span><strong>Add benchmark photos</strong><small>Up to 4 views</small></span><input id="nutrition-benchmark-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" multiple></label><div class="nutrition-benchmark-photo-copy"><strong>One compact source for every selected model</strong><span id="nutrition-benchmark-photo-status" role="status">Choose photos here; no Log meal attachment is required.</span><small>Originals are sent only when you run the benchmark and are not saved.</small><button type="button" class="nutrition-text-btn" ${actionAttrs('clear-benchmark-photos')} hidden>Clear benchmark photos</button></div></div></section>
      ${renderComparisonModelPicker()}
      <section class="nutrition-comparison-reference-editor"><details class="nutrition-comparison-known-values"><summary><span><strong>Known values</strong><small>Optional · add only when you have a reliable reference</small></span><span>Expand</span></summary><div class="nutrition-comparison-known-values-body"><p>Every supplied nutrient joins the comparison score.</p><div class="nutrition-comparison-reference-copy"><label class="nutrition-field nutrition-field-wide"><span>Meal</span><input data-nutrition-reference="mealName" maxlength="120"></label><label class="nutrition-field nutrition-field-wide"><span>Ingredients</span><textarea data-nutrition-reference="ingredients" rows="2" maxlength="600" placeholder="One per line"></textarea></label></div><div class="nutrition-comparison-reference-grid">${primaryFields}</div><details class="nutrition-comparison-reference-details"><summary>Detailed nutrition <small>optional</small></summary><div class="nutrition-comparison-reference-groups">${detailedGroups}</div></details></div></details></section>
    </div>
    <details class="nutrition-comparison-method"><summary>How ranking works</summary><p>Known-value agreement weights nutrition and amount 70%, ingredients 30%. Every supplied nutrient is weighted equally inside the nutrition score. It is not an accuracy score; model confidence and identity self-checks are excluded.</p></details>
    <div class="nutrition-comparison-actions"><span class="nutrition-comparison-parallel-note">Selected models run together.</span><button type="button" id="nutrition-run-comparison" class="import-btn import-btn-primary" ${actionAttrs('run-comparison')} disabled>Run comparison</button></div>
    <div id="nutrition-comparison-progress" class="nutrition-analysis-progress" aria-live="polite" hidden></div><div id="nutrition-comparison-results" class="nutrition-comparison-results" aria-live="polite"></div>
  </section>`;
}

export function renderNutritionBenchmarkModal() {
  return `<button type="button" class="modal-close" aria-label="Close Meals & Nutrition" ${actionAttrs('close')}>&times;</button><nav class="nutrition-mode-navigation" aria-label="Meal tool mode"><button type="button" ${actionAttrs('return-editor')}>← Log meal</button><span aria-current="page">Benchmark</span></nav><div class="nutrition-modal-head nutrition-benchmark-head"><div><h3>Meal benchmark</h3><p>Compare up to four vision models, replace individual results, and prepare a clean screenshot.</p></div></div>${renderComparisonWorkspace()}`;
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
