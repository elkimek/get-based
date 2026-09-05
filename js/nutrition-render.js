// @ts-check
// nutrition-render.js — pure Meals & Nutrition view templates and formatting.

import { state } from './state.js';
import { getMealAnalysisAvailability, nutritionUsageSummary } from './nutrition-analysis.js';
import { getDefaultNutritionComparisonModelValues, getMealAISelection, isNutritionLocalAICatalogLoading, listNutritionVisionModels, nutritionModelPricing } from './nutrition-ai-settings.js';
import { MEAL_COMPARISON_REFERENCE_FIELDS } from './nutrition-comparison.js';
import { assessFuelStrategy, calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { NUTRIENT_DEFINITIONS, NUTRIENT_GROUPS, nutrientFieldsForGroup } from './nutrition-nutrient-registry.js';
import { NUTRITION_HISTORY_RANGES } from './nutrition-summary.js';
import { isNutritionContextEnabled } from './lab-context-settings.js';
import { getNutritionTargets, resolveNutritionTargets } from './nutrition-targets.js';
import { escapeAttr, escapeHTML, isDebugMode } from './utils.js';

const ACTION_ATTR = 'data-nutrition-action';
const NUTRITION_STYLESHEET_URL = new URL('../css/nutrition.css', import.meta.url).href;
const RECENT_MEALS_DEFAULT_CAP = 3;
export const HISTORY_MEAL_PAGE_SIZE = 12;
let nutritionStylesheetPromise = null;
const reviewFields = fields => Object.freeze(fields.map(field => Object.freeze([
  field.key, field.label, field.unit, field.step,
])));
const MACRO_REVIEW_FIELDS = reviewFields(nutrientFieldsForGroup('core'));
const DETAILED_REVIEW_GROUPS = Object.freeze(NUTRIENT_GROUPS
  .filter(group => group.id !== 'core')
  .map(group => Object.freeze({
    ...group,
    fields: reviewFields(nutrientFieldsForGroup(group.id)),
  })));
export const ALL_REVIEW_FIELDS = reviewFields(NUTRIENT_DEFINITIONS);
export const MEAL_TYPES = Object.freeze([
  ['breakfast', 'Breakfast'], ['brunch', 'Brunch'], ['lunch', 'Lunch'],
  ['dinner', 'Dinner'], ['snack', 'Snack'], ['drink', 'Drink'], ['other', 'Other'],
]);
const NUTRIENT_DETAILS = Object.freeze(NUTRIENT_DEFINITIONS.map(field => Object.freeze([
  field.key, field.label, field.unit,
])));
/** @type {Map<string, [string, string, string]>} */
const WIDGET_TARGETS = new Map([
  ['proteinG', ['proteinG', 'goal', 'Protein']],
  ['carbohydrateG', ['carbohydrateG', 'goal', 'Carbohydrate']],
  ['fatG', ['fatG', 'goal', 'Fat']],
  ['fiberG', ['fiberG', 'minimum', 'Fiber']],
  ['fluidMl', ['fluidMl', 'fluid', 'Logged drinks']],
  ['sugarG', ['sugarG', 'limit', 'Sugar guide']],
  ['sodiumMg', ['sodiumMg', 'limit', 'Sodium guide']],
]);
/** @type {ReadonlyArray<[string, string, string, string, string]>} */
const DASHBOARD_GOAL_FIELDS = Object.freeze(NUTRIENT_DETAILS
  .filter(([key]) => key !== 'energyKcal')
  .map(([key, label, unit]) => {
    const [targetKey = '', kind = 'observe', widgetLabel = label] = WIDGET_TARGETS.get(key) || [];
    return /** @type {[string, string, string, string, string]} */ (
      [key, widgetLabel, unit, targetKey, kind]
    );
  }));
const NUTRIENT_DETAIL_BY_KEY = new Map(NUTRIENT_DETAILS.map(field => [field[0], field]));
/** @type {ReadonlyArray<readonly [string, ReadonlyArray<string>]>} */
const WIDGET_NUTRIENT_GROUPS = Object.freeze(NUTRIENT_GROUPS.map(group => /** @type {const} */ ([
  group.label,
  nutrientFieldsForGroup(group.id).map(field => field.key).filter(key => key !== 'energyKcal'),
])));

export function actionAttrs(action, attrs = {}) {
  const rest = Object.entries(attrs).map(([key, value]) => ` data-nutrition-${escapeAttr(key)}="${escapeAttr(String(value))}"`).join('');
  return `${ACTION_ATTR}="${escapeAttr(action)}"${rest}`;
}

export function formatNumber(value, maximumFractionDigits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits }) : '—';
}

export function hasFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function ensureNutritionStylesheet() {
  if (typeof document === 'undefined') return Promise.resolve();
  const existing = /** @type {HTMLLinkElement | null} */ (
    document.querySelector('link[data-nutrition-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find(link => {
      try { return new URL(/** @type {HTMLLinkElement} */ (link).href).pathname === '/css/nutrition.css'; }
      catch { return false; }
    })
    || null
  );
  if (existing?.sheet) return Promise.resolve();
  if (!nutritionStylesheetPromise) {
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = NUTRITION_STYLESHEET_URL;
    link.dataset.nutritionStylesheet = '';
    nutritionStylesheetPromise = new Promise(resolve => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      if (!link.isConnected) document.head.append(link);
    });
  }
  return nutritionStylesheetPromise;
}

function goalPercent(value, target) {
  const ratio = Number(value) / Number(target);
  return Number.isFinite(ratio) && ratio >= 0 ? Math.min(150, Math.round(ratio * 100)) : 0;
}

function targetAttainment(value, target, kind = 'goal') {
  if (!hasFiniteNumber(value) || !hasFiniteNumber(target) || Number(target) <= 0) return null;
  const percent = goalPercent(value, target);
  if (kind === 'limit') {
    if (percent <= 90) return { tone: 'excellent', label: 'Within guide' };
    if (percent <= 100) return { tone: 'good', label: 'Near guide' };
    if (percent <= 115) return { tone: 'strained', label: 'Above guide' };
    return { tone: 'poor', label: 'Well above guide' };
  }
  if (kind === 'minimum' || kind === 'fluid') {
    if (percent >= 100) return { tone: 'excellent', label: 'Target met' };
    if (percent >= 85) return { tone: 'good', label: 'Close to target' };
    if (percent >= 60) return { tone: 'strained', label: 'Below target' };
    return { tone: 'poor', label: 'Well below target' };
  }
  const distance = Math.abs(percent - 100);
  if (distance <= 10) return { tone: 'excellent', label: 'On target' };
  if (distance <= 20) return { tone: 'good', label: 'Near target' };
  if (distance <= 35) return { tone: 'strained', label: percent < 100 ? 'Below target' : 'Above target' };
  return { tone: 'poor', label: percent < 100 ? 'Well below target' : 'Well above target' };
}

function widgetGoalRow(period, targets, [key, label, unit, targetKey, kind]) {
  const value = period?.dailyAverages?.[key];
  const target = targetKey ? targets?.[targetKey] : null;
  const coverage = period?.nutrientCoverage?.[key];
  const observedDays = Number(coverage?.completeDays || 0);
  if (kind === 'observe') {
    const observed = hasFiniteNumber(value) ? `${formatNumber(value, unit === 'mg' ? 0 : 1)} ${unit} recorded avg` : 'No logged values';
    return `<div class="nutrition-goal-row is-observation"><div class="nutrition-goal-row-head"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(observed)}</span></div><small>${observedDays ? `${observedDays} day${observedDays === 1 ? '' : 's'} with recorded values` : 'Optional display · no adequacy score'}</small></div>`;
  }
  const percent = goalPercent(value, target);
  const comparison = hasFiniteNumber(value) && hasFiniteNumber(target)
    ? `${formatNumber(value, unit === 'mg' ? 0 : 1)} ${unit} recorded · ${formatNumber(target, unit === 'mg' ? 0 : 1)} guide`
    : `— recorded · ${hasFiniteNumber(target) ? `${formatNumber(target, unit === 'mg' ? 0 : 1)} ${unit} guide` : 'no guide'}`;
  const coverageLabel = observedDays
    ? `${observedDays} day${observedDays === 1 ? '' : 's'} with values for logged ${kind === 'fluid' ? 'drinks' : 'entries'}`
    : `No recorded ${kind === 'fluid' ? 'drinks' : 'values'}`;
  const personal = targets?.configured === true;
  const attainment = personal ? targetAttainment(value, target, kind) : null;
  const stateClass = attainment ? ` is-${attainment.tone}` : '';
  const goalLabel = personal ? 'personal target' : 'starter guide';
  const guideLabel = personal ? 'personal guide' : 'starter guide';
  const note = kind === 'limit'
    ? `${guideLabel}; recorded amounts above it are meaningful`
    : kind === 'fluid'
      ? `${personal ? 'Personal fluid guide' : 'Starter fluid guide'}; beverage volume, not net hydration`
      : `${kind === 'minimum' ? guideLabel : goalLabel}; partial-day logs may be below actual intake`;
  const proteinSource = key === 'proteinG' ? ` · ${proteinTargetSource(targets)}` : '';
  const attainmentLabel = attainment ? `<span class="nutrition-goal-grade is-${attainment.tone}">${escapeHTML(attainment.label)}</span>` : '';
  return `<div class="nutrition-goal-row${stateClass}"><div class="nutrition-goal-row-head"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(comparison)}</span></div><div class="nutrition-goal-track" role="img" aria-label="${escapeAttr(`${label}: ${comparison}.${attainment ? ` ${attainment.label}.` : ''} ${note}`)}"><span style="--nutrition-progress:${percent}%"></span><i></i></div><div class="nutrition-goal-row-foot"><small>${attainmentLabel}${escapeHTML(coverageLabel)} · ${escapeHTML(note)}${escapeHTML(proteinSource)}</small>${kind === 'fluid' ? `<button type="button" class="nutrition-inline-log" ${actionAttrs('open-fluid-log')}>+ Log drink</button>` : ''}</div></div>`;
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderSevenDayCoverage(period, now = new Date()) {
  const logged = new Set(Array.isArray(period?.loggedDayKeys) ? period.loggedDayKeys : []);
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDayKey(date);
    const active = logged.has(key);
    days.push(`<div class="nutrition-day${active ? ' is-logged' : ''}" title="${escapeAttr(`${date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}: ${active ? 'intake logged' : 'not logged'}`)}"><span>${escapeHTML(date.toLocaleDateString([], { weekday: 'narrow' }))}</span><i></i></div>`);
  }
  return `<div class="nutrition-day-coverage"><div><strong>Days with entries</strong><span>${period?.loggedDays || 0} of 7 days</span></div><div class="nutrition-day-strip" aria-label="Entries logged on ${period?.loggedDays || 0} of the last 7 days">${days.join('')}</div><small>A day can still be partial when only some meals were entered.</small></div>`;
}

function proteinTargetSource(targets) {
  if (targets.proteinBasis === 'fixed') return `${formatNumber(targets.proteinG, 1)} g fixed daily guide`;
  if (targets.proteinUsesWeight && targets.weight) {
    return `${formatNumber(targets.proteinFactor, 2)} g/kg × ${formatNumber(targets.weight.kg, 1)} kg from ${targets.weight.source}${targets.weight.date ? ` (${targets.weight.date})` : ''}`;
  }
  return `${formatNumber(targets.proteinG, 1)} g fallback until a weight measurement is available`;
}

function targetRing(label, value, target, unit, accent = false, personal = true) {
  const percent = goalPercent(value, target);
  const attainment = personal ? targetAttainment(value, target, 'goal') : null;
  const comparisonLabel = personal ? 'target' : 'starter guide';
  const read = hasFiniteNumber(target) ? `${comparisonLabel} ${formatNumber(target, unit === 'kcal' ? 0 : 1)} ${unit}` : 'no guide';
  const recorded = hasFiniteNumber(value) ? `${formatNumber(value, unit === 'kcal' ? 0 : 1)} ${unit} recorded average` : `No recorded ${label.toLowerCase()} average`;
  const guide = hasFiniteNumber(target) ? `${personal ? 'Target' : 'Guide'} ${formatNumber(target, unit === 'kcal' ? 0 : 1)}` : 'No guide';
  return `<div class="nutrition-target-ring${accent ? ' is-secondary' : ''}${attainment ? ` is-${attainment.tone}` : ''}" style="--nutrition-progress:${Math.min(100, percent)}%" role="img" aria-label="${escapeAttr(`${label}: ${recorded}; ${read};${attainment ? ` ${attainment.label};` : ''} days may be partial`)}"${attainment ? ` title="${escapeAttr(attainment.label)}"` : ''}><div><small class="nutrition-target-ring-label">${escapeHTML(label)}</small><strong>${hasFiniteNumber(value) ? formatNumber(value, unit === 'kcal' ? 0 : 1) : '—'}</strong><span class="nutrition-target-ring-unit">${escapeHTML(unit)} recorded avg</span><small class="nutrition-target-ring-guide">${escapeHTML(guide)}</small></div></div>`;
}

function renderPersonalFuelPattern(responses = {}) {
  const checkIns = Number(responses?.checkIns || 0);
  const minimum = Number(responses?.minimum || 6);
  if (checkIns < minimum) return '';
  const signals = [
    ['Later satiety', responses?.satiety],
    ['Post-meal energy', responses?.energy],
  ].flatMap(([label, signal]) => {
    if (!signal?.available) return [];
    const comparison = signal.direction === 'similar'
      ? 'was similar'
      : `was ${signal.direction}`;
    return [`${label} ${comparison} after the more evenly mixed carb/fat half of your checked-in meals.`];
  });
  const copy = signals.length
    ? signals.join(' ')
    : 'Your checked-in meals do not yet contain enough carb/fat composition variation for a comparison.';
  return `<div class="nutrition-fuel-response-status is-ready"><strong>Check-in pattern · ${checkIns} meals</strong><span>${escapeHTML(copy)} Personal association only.</span></div>`;
}

function renderFuelUseNote(period, targets) {
  const strategy = assessFuelStrategy(period, targets);
  const action = strategy.actions[0];
  const actionCopy = action
    ? `<div class="nutrition-fuel-guidance"><span>Worth reviewing</span><strong>${escapeHTML(action.title)}</strong></div>`
    : '';
  return `${actionCopy}${renderPersonalFuelPattern(period?.fuelResponses)}`;
}

/**
 * @param {any} mix
 * @param {{scope?: 'window'|'meal', compact?: boolean, fallbackTotalMeals?: number, period?: any, targets?: any}} [options]
 */
export function renderFuelOverlapCard(mix, { scope = 'window', compact = false, fallbackTotalMeals = 0, period = null, targets = null } = {}) {
  const available = !!mix && mix.available !== false && hasFiniteNumber(mix.carbEnergyPercent) && hasFiniteNumber(mix.fatEnergyPercent);
  const totalMeals = Number(mix?.totalMeals ?? fallbackTotalMeals ?? 0);
  const completeMeals = Number(mix?.completeMeals || 0);
  if (!available) {
    if (scope === 'meal') return '';
    return `<section class="nutrition-fuel-card is-unavailable"><div class="nutrition-fuel-empty"><strong>Not enough meal data yet</strong><span>Add carbohydrate and fat values in Meals &amp; Nutrition to see the logged carb/fat mix. Missing values stay unknown.</span></div></section>`;
  }

  const carbPercent = Math.max(0, Math.min(100, Math.round(Number(mix.carbEnergyPercent || 0))));
  const fatPercent = Math.max(0, Math.min(100, Math.round(Number(mix.fatEnergyPercent || 0))));
  const coverage = scope === 'meal'
    ? 'Reviewed meal'
    : `${completeMeals} of ${totalMeals} meals included`;
  const contributingMeals = Math.max(1, Number(mix?.contributingMeals || completeMeals || 1));
  const combinedEnergyKcal = hasFiniteNumber(mix?.carbFatEnergyKcal)
    ? Number(mix.carbFatEnergyKcal) / (scope === 'meal' ? 1 : contributingMeals)
    : null;
  const amountCopy = hasFiniteNumber(combinedEnergyKcal)
    ? `${scope === 'meal' ? '' : 'Avg '}${formatNumber(combinedEnergyKcal, 0)} kcal${scope === 'meal' ? '' : '/meal'} from carbs + fat`
    : '';
  const strategy = scope === 'window' && period ? assessFuelStrategy(period, targets || {}) : null;
  const targetCarbPercent = strategy?.targetMix?.carbEnergyPercent;
  const planCopy = hasFiniteNumber(targetCarbPercent)
    ? `<p>Saved plan: ${Number(targetCarbPercent)}% carbohydrate / ${100 - Number(targetCarbPercent)}% fat energy. This is an adherence reference, not a metabolic target.</p>`
    : '';
  const meta = [amountCopy, coverage].filter(Boolean).join(' · ');
  return `<section class="nutrition-fuel-card is-${scope}${compact ? ' is-compact' : ''}">
    ${scope === 'meal' ? '<div class="nutrition-fuel-simple-head"><strong>Carb/fat composition</strong><span>Estimate</span></div>' : ''}
    <div class="nutrition-fuel-composition" role="img" aria-label="${escapeAttr(`${carbPercent}% carbohydrate energy and ${fatPercent}% fat energy. No preferred split.`)}">
      <div class="nutrition-fuel-composition-labels"><span><i class="is-carb" aria-hidden="true"></i><small>Carbohydrate energy</small><strong>${carbPercent}%</strong></span><span><i class="is-fat" aria-hidden="true"></i><small>Fat energy</small><strong>${fatPercent}%</strong></span></div>
      <div class="nutrition-fuel-split"><span class="is-carb" style="width:${carbPercent}%"></span><span class="is-fat" style="width:${fatPercent}%"></span></div>
    </div>
    <div class="nutrition-fuel-meta">${escapeHTML(meta)}</div>
    ${scope === 'window' ? '<p class="nutrition-fuel-neutral">A centered split is not automatically good or bad; amount and food quality matter more.</p>' : ''}
    ${scope === 'window' && period && !compact ? renderFuelUseNote(period, targets || {}) : ''}
    ${compact ? '' : `<details class="nutrition-fuel-explainer"><summary>About this estimate</summary><p>Meal logs estimate incoming carbohydrate and fat. They do not measure Randle-cycle activity, glucose, insulin, free fatty acids, fuel oxidation, or metabolic flexibility.</p>${planCopy}<p>With impaired glucose regulation, carbohydrate amount matters, while fat and protein can change the timing of the glucose response. Personal glucose data and the clinical plan are more informative than this split alone.</p></details>`}
  </section>`;
}

export function mealTypeLabel(value) {
  return MEAL_TYPES.find(([key]) => key === value)?.[1] || '';
}

export function mealImages(meal) {
  const images = Array.isArray(meal?.images) ? meal.images.filter(Boolean) : [];
  return images.length ? images : meal?.image ? [meal.image] : [];
}

function primaryMealImage(meal) {
  return mealImages(meal)[0] || null;
}

export function renderNutritionWidget() {
  const summary = state.nutritionSummary;
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

function renderHistoryCoverageBuckets(buckets = []) {
  if (!buckets.length) return '';
  const bars = buckets.map(bucket => {
    const percent = Math.round(Number(bucket.coverageRatio || 0) * 100);
    const height = bucket.loggedDays ? Math.max(4, percent) : 0;
    const title = `${bucket.label}: ${bucket.loggedDays} of ${bucket.days} days logged (${percent}%)`;
    return `<div class="nutrition-history-coverage-bar" title="${escapeAttr(title)}"><i><span style="height:${height}%"></span></i><span>${Number(bucket.loggedDays || 0)}/${Number(bucket.days || 0)}</span><small>${escapeHTML(bucket.label)}</small></div>`;
  }).join('');
  return `<div class="nutrition-history-coverage-chart" role="img" aria-label="Logging coverage over the selected timeframe">${bars}</div>`;
}

function renderHistoryTiming(timing = {}) {
  const values = [
    ['First logged meal', timing.averageFirstMealLocalTime || '—'],
    ['Last logged meal', timing.averageLastMealLocalTime || '—'],
    ['Observed eating window', hasFiniteNumber(timing.averageEatingWindowMinutes) ? `${formatNumber(Number(timing.averageEatingWindowMinutes) / 60, 1)} h` : '—'],
    ['Observed fasting window', hasFiniteNumber(timing.averageFastingWindowMinutes) ? `${formatNumber(Number(timing.averageFastingWindowMinutes) / 60, 1)} h` : '—'],
  ];
  return `<section class="nutrition-history-timing"><div class="nutrition-section-title">Logged meal timing</div><div>${values.map(([label, value]) => `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join('')}</div><small>Eating windows require at least two logged meals in a day. Fasting windows use the last and first logged meals on consecutive days. Missing meals remain unknown.</small></section>`;
}

function historyDayLabel(key) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : key;
}

function renderHistoryMealTimeline(history) {
  const meals = Array.isArray(history?.meals) ? history.meals : [];
  const visibleCount = Math.max(1, Number(history?.visibleMealCount || HISTORY_MEAL_PAGE_SIZE));
  let visibleEnd = Math.min(visibleCount, meals.length);
  const boundaryDay = String(meals[visibleEnd - 1]?.localDate || meals[visibleEnd - 1]?.eatenAt || '').slice(0, 10);
  while (visibleEnd < meals.length
      && boundaryDay
      && String(meals[visibleEnd]?.localDate || meals[visibleEnd]?.eatenAt || '').slice(0, 10) === boundaryDay) {
    visibleEnd += 1;
  }
  const visible = meals.slice(0, visibleEnd);
  const groups = new Map();
  for (const meal of visible) {
    const key = String(meal?.localDate || meal?.eatenAt || '').slice(0, 10) || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(meal);
  }
  const rows = [...groups.entries()].map(([key, dayMeals]) => `<section class="nutrition-timeline-day"><div class="nutrition-timeline-day-head"><strong>${escapeHTML(historyDayLabel(key))}</strong><span>${dayMeals.length} entr${dayMeals.length === 1 ? 'y' : 'ies'}</span></div><div class="nutrition-recent-list">${dayMeals.map(meal => renderRecentMeal(meal, { origin: 'history' })).join('')}</div></section>`).join('');
  const remaining = Math.max(0, meals.length - visible.length);
  const shown = visible.length.toLocaleString();
  const total = meals.length.toLocaleString();
  return `<div class="nutrition-history-meals-head"><div><strong>${meals.length.toLocaleString()} entries</strong><span>${Number(history?.period?.loggedDays || 0).toLocaleString()} days with entries · ${escapeHTML(history?.rangeDescription || '')}</span></div><small>${remaining ? `Showing newest ${shown} of ${total}.` : `Showing all ${total}.`} Select a meal to review, edit, log it again, or delete it.</small></div><div class="nutrition-meal-timeline">${rows}</div>${remaining ? `<button type="button" class="import-btn import-btn-secondary nutrition-history-more" ${actionAttrs('show-history-more')}>Show more meals <span>· ${remaining.toLocaleString()} remaining</span></button>` : ''}`;
}

export function renderNutritionHistoryModal(history, { storageError = '', returnTo = '' } = {}) {
  const period = history?.period || {};
  const targets = resolveNutritionTargets();
  const selectedNutrients = new Set(targets.widgetNutrients || []);
  const visibleGoalRows = DASHBOARD_GOAL_FIELDS.filter(([key]) => selectedNutrients.has(key));
  const hasMeals = Number(period.meals || 0) > 0;
  const foodMeals = Number.isFinite(Number(period.foodMeals)) ? Number(period.foodMeals) : Number(period.meals || 0);
  const drinkEntries = Number(period.drinkEntries || 0);
  const reviewPercent = Math.round(Number(period.reviewRatio || 0) * 100);
  const nutritionContextEnabled = isNutritionContextEnabled();
  const historyView = history?.view === 'trends' ? 'trends' : 'meals';
  const rangeButtons = NUTRITION_HISTORY_RANGES.map(range => `<button type="button" class="ctx-btn-option${range.key === history?.rangeKey ? ' active' : ''}" aria-pressed="${range.key === history?.rangeKey}" ${actionAttrs('set-history-range', { range: range.key })}>${escapeHTML(range.label)}</button>`).join('');
  const emptyAction = history?.rangeKey !== 'all'
    ? `<button type="button" class="import-btn import-btn-secondary" ${actionAttrs('set-history-range', { range: 'all' })}>Show all history</button>`
    : `<button type="button" class="import-btn import-btn-primary" ${actionAttrs('open', { return: 'history' })}>Log a meal</button>`;
  const returnControl = returnTo === 'editor'
    ? `<button type="button" class="nutrition-route-back" ${actionAttrs('return-editor')}>← Meal entry</button>`
    : '';
  return `<button type="button" class="modal-close" aria-label="Close Nutrition history" ${actionAttrs('close')}>&times;</button>
    ${returnControl}
    <div class="nutrition-modal-head nutrition-history-head"><div><h3>Meals &amp; Nutrition</h3></div><div class="nutrition-history-head-actions"><button type="button" class="dashboard-action-btn" ${actionAttrs('open-targets', { return: 'history' })}>Setup</button><button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${actionAttrs('open', { return: 'history' })}>${returnTo === 'editor' ? 'New meal' : 'Log meal'}</button></div></div>
    <div class="nutrition-history-tabs" role="tablist" aria-label="Meals & Nutrition history view"><button type="button" role="tab" aria-selected="${historyView === 'meals'}" class="${historyView === 'meals' ? 'active' : ''}" ${actionAttrs('set-history-view', { view: 'meals' })}>Meals</button><button type="button" role="tab" aria-selected="${historyView === 'trends'}" class="${historyView === 'trends' ? 'active' : ''}" ${actionAttrs('set-history-view', { view: 'trends' })}>Trends</button></div>
    <div class="ctx-btn-group nutrition-history-range" role="group" aria-label="Nutrition history range">${rangeButtons}</div>
    ${storageError ? `<div class="nutrition-history-error" role="status">${escapeHTML(storageError)}</div>` : ''}
    ${hasMeals ? (historyView === 'meals' ? renderHistoryMealTimeline(history) : `<div class="nutrition-history-layout">
      <section class="nutrition-history-overview"><div class="nutrition-history-stat-grid"><div><strong>${Number(period.loggedDays || 0).toLocaleString()}</strong><span>Days with entries</span><small>${escapeHTML(history.rangeDescription || '')}</small></div><div><strong>${foodMeals.toLocaleString()}</strong><span>Meals</span><small>${drinkEntries ? `${drinkEntries.toLocaleString()} drink log${drinkEntries === 1 ? '' : 's'}` : 'Food entries'}</small></div><div><strong>${reviewPercent}%</strong><span>Entries reviewed</span><small>${Number(period.reviewedMeals || 0).toLocaleString()} of ${Number(period.meals || 0).toLocaleString()}</small></div></div>${renderHistoryCoverageBuckets(history.coverageBuckets)}<p class="nutrition-history-caveat">A day with entries may still be partial. Recorded averages include only entered meals; missing meals and days remain unknown.</p></section>
      <section class="nutrition-history-averages"><div class="nutrition-target-rings">${targetRing('Energy', period.dailyAverages?.energyKcal, targets.energyKcal, 'kcal', false, targets.configured)}</div><div class="nutrition-goal-list-head"><strong>Recorded daily averages</strong><span>${escapeHTML(history.rangeLabel || '')} · ${visibleGoalRows.length} nutrient rows</span></div>${visibleGoalRows.length ? `<div class="nutrition-goal-grid${visibleGoalRows.length > 4 ? ' is-expanded' : ''}">${visibleGoalRows.map(field => widgetGoalRow(period, targets, field)).join('')}</div>` : '<div class="nutrition-comparison-empty">Choose nutrients in Setup.</div>'}</section>
      ${renderHistoryTiming(period.timing)}
      <section class="nutrition-history-fuel"><div class="nutrition-section-title">Carbohydrate and fat mix</div>${renderFuelOverlapCard(period.fuelOverlap, { scope: 'window', fallbackTotalMeals: foodMeals, period, targets })}</section>
    </div><div class="nutrition-history-ai"><div><strong>Ask AI about ${escapeHTML(history.rangeLabel || 'this range')}</strong><span>${nutritionContextEnabled ? 'Sends one compact aggregate for this range. It replaces the automatic nutrition summary for this message.' : 'Turn on Meals & Nutrition in Manage Context to share an aggregate with AI.'}</span></div><button type="button" class="import-btn import-btn-secondary" ${actionAttrs('ask-history', { range: history.rangeKey || '30d' })} ${nutritionContextEnabled ? '' : 'disabled'}>Ask AI</button></div>`) : `<div class="nutrition-history-empty"><span aria-hidden="true">◎</span><div><strong>No intake logged in ${escapeHTML(history?.rangeDescription || 'this timeframe')}</strong><p>The selected range stays empty rather than silently showing older data.</p></div>${emptyAction}</div>`}`;
}

export function renderNutritionFuelWidget() {
  const summary = state.nutritionSummary;
  const period = summary?.windows?.d7;
  const targets = resolveNutritionTargets();
  const foodMealCount = Number.isFinite(Number(period?.foodMeals)) ? Number(period.foodMeals) : Number(period?.meals || 0);
  return `<div class="nutrition-fuel-widget">${renderFuelOverlapCard(period?.fuelOverlap, { scope: 'window', fallbackTotalMeals: foodMealCount, period, targets })}</div>`;
}

function renderWidgetNutrientOptions(targets) {
  const selected = new Set(targets.widgetNutrients || []);
  return WIDGET_NUTRIENT_GROUPS.map(([group, nutrientIds]) => `<fieldset class="nutrition-widget-metric-group"><legend>${escapeHTML(group)}</legend><div>${nutrientIds.map(id => {
    const label = NUTRIENT_DETAIL_BY_KEY.get(id)?.[1] || id;
    return `<label class="nutrition-widget-metric-option"><input type="checkbox" value="${escapeAttr(id)}" data-nutrition-widget-metric${selected.has(id) ? ' checked' : ''}><span>${escapeHTML(label)}</span></label>`;
  }).join('')}</div></fieldset>`).join('');
}

export function renderNutritionCustomizeModal({ returnTo = '' } = {}) {
  const targets = getNutritionTargets();
  const resolved = resolveNutritionTargets();
  const fixed = targets.proteinBasis === 'fixed';
  const returnControl = returnTo === 'history'
    ? `<button type="button" class="nutrition-route-back" ${actionAttrs('return-history')}>← Meals &amp; Nutrition</button>`
    : '';
  return `<button type="button" class="modal-close" aria-label="Close nutrition customization" ${actionAttrs('close')}>&times;</button>
    ${returnControl}
    <div class="nutrition-modal-head"><div><h3>Nutrition setup</h3><p>Set daily guides and choose the nutrients you want in your widget.</p></div></div>
    <section class="nutrition-target-settings nutrition-target-settings-standalone" id="nutrition-target-settings" tabindex="-1">
      <div class="nutrition-target-settings-head"><h4>Daily targets</h4><span class="nutrition-target-weight">${resolved.weight ? `${escapeHTML(formatNumber(resolved.weight.kg, 1))} kg · ${escapeHTML(resolved.weight.source)}` : 'No weight measurement yet'}</span></div>
      ${targets.configured ? '' : '<div class="nutrition-target-setup-state">Starter guides — review and save to make them personal.</div>'}
      <div class="nutrition-target-form">
        <label class="nutrition-field"><span>Energy <small>kcal</small></span><input id="nutrition-target-energy" type="number" min="500" max="10000" step="10" value="${escapeAttr(String(targets.energyKcal))}" required></label>
        <label class="nutrition-field nutrition-target-protein-basis"><span>Protein target</span><select id="nutrition-target-protein-basis"><option value="general"${targets.proteinBasis === 'general' ? ' selected' : ''}>General adult · 0.83 g/kg</option><option value="active"${targets.proteinBasis === 'active' ? ' selected' : ''}>Active / training · 1.6 g/kg</option><option value="high"${targets.proteinBasis === 'high' ? ' selected' : ''}>High training · 2.0 g/kg</option><option value="custom"${targets.proteinBasis === 'custom' ? ' selected' : ''}>Custom g/kg</option><option value="fixed"${fixed ? ' selected' : ''}>Fixed grams</option></select></label>
        <label class="nutrition-field" id="nutrition-target-protein-factor-wrap"${fixed ? ' hidden' : ''}><span>Protein factor <small>g/kg</small></span><input id="nutrition-target-protein-factor" type="number" min="0.4" max="3.5" step="0.01" value="${escapeAttr(String(resolved.proteinFactor || targets.proteinGPerKg))}" required${['general', 'active', 'high'].includes(targets.proteinBasis) ? ' disabled' : ''}></label>
        <label class="nutrition-field" id="nutrition-target-protein-fixed-wrap"${fixed ? '' : ' hidden'}><span>Protein <small>g</small></span><input id="nutrition-target-protein-fixed" type="number" min="10" max="500" step="1" value="${escapeAttr(String(targets.proteinFixedG))}" required></label>
        <label class="nutrition-field"><span>Carbohydrate <small>g</small></span><input id="nutrition-target-carbohydrate" type="number" min="0" max="1500" step="1" value="${escapeAttr(String(targets.carbohydrateG))}" required></label>
        <label class="nutrition-field"><span>Fat <small>g</small></span><input id="nutrition-target-fat" type="number" min="0" max="500" step="1" value="${escapeAttr(String(targets.fatG))}" required></label>
        <label class="nutrition-field"><span>Fiber <small>g</small></span><input id="nutrition-target-fiber" type="number" min="0" max="150" step="1" value="${escapeAttr(String(targets.fiberG))}" required></label>
        <label class="nutrition-field"><span>Logged drinks <small>mL</small></span><input id="nutrition-target-fluid" type="number" min="0" max="10000" step="50" value="${escapeAttr(String(targets.fluidMl))}" required></label>
      </div>
      <div class="nutrition-target-note"><span id="nutrition-target-protein-preview">Protein guide: ${escapeHTML(formatNumber(resolved.proteinG, 1))} g/day · ${escapeHTML(proteinTargetSource(resolved))}</span></div>
      <details class="nutrition-target-optional"><summary>Optional sugar and sodium guides</summary><div class="nutrition-target-form nutrition-target-optional-form"><label class="nutrition-field"><span>Sugar <small>g</small></span><input id="nutrition-target-sugar" type="number" min="0" max="500" step="1" value="${escapeAttr(String(targets.sugarG))}" required></label><label class="nutrition-field"><span>Sodium <small>mg</small></span><input id="nutrition-target-sodium" type="number" min="0" max="10000" step="10" value="${escapeAttr(String(targets.sodiumMg))}" required></label><p>Optional references. Meal-photo estimates may not reliably separate total, added, and free sugar.</p></div></details>
      <details class="nutrition-target-about"><summary>About these guides</summary><p>Targets are planning guides, not medical recommendations. Meal-photo values are estimates. Logged drinks measure beverage volume, not net hydration or water from food.</p></details>
      <div class="nutrition-widget-metric-settings"><div class="nutrition-widget-metric-settings-head"><strong>Widget nutrients</strong><span id="nutrition-widget-metric-count" role="status" aria-live="polite">${targets.widgetNutrients.length} selected</span></div><div class="nutrition-widget-metric-groups">${renderWidgetNutrientOptions(targets)}</div></div>
      <div class="nutrition-target-actions"><p id="nutrition-target-status" role="status" aria-live="polite"></p><button type="button" class="import-btn import-btn-primary" ${actionAttrs('save-targets', { return: returnTo })}>Save nutrition setup</button></div>
    </section>`;
}

export function renderFluidLogModal() {
  return `<button type="button" class="modal-close" aria-label="Close drink log" ${actionAttrs('close')}>&times;</button>
    <div class="nutrition-modal-head"><div><h3>Log a drink</h3></div></div>
    <section class="nutrition-fluid-log">
      <fieldset class="nutrition-fluid-kind-fieldset"><legend>Beverage type</legend><div class="nutrition-fluid-kind-grid">
        <label class="nutrition-fluid-kind"><input type="radio" name="nutrition-fluid-kind" value="water" checked><span aria-hidden="true">◌</span><strong>Water</strong><small>Counts as plain water</small></label>
        <label class="nutrition-fluid-kind"><input type="radio" name="nutrition-fluid-kind" value="tea-coffee"><span aria-hidden="true">☕</span><strong>Tea or coffee</strong><small>Counts as a logged drink</small></label>
        <label class="nutrition-fluid-kind"><input type="radio" name="nutrition-fluid-kind" value="other"><span aria-hidden="true">◒</span><strong>Other</strong><small>Juice, milk, or another drink</small></label>
      </div></fieldset>
      <div class="nutrition-fluid-amount-panel"><div class="nutrition-comparison-section-title"><strong>Amount</strong><span>milliliters</span></div><div class="nutrition-fluid-presets" role="group" aria-label="Common drink amounts">${[250, 350, 500, 750].map(amount => `<button type="button" class="nutrition-fluid-preset${amount === 350 ? ' is-selected' : ''}" aria-pressed="${amount === 350 ? 'true' : 'false'}" ${actionAttrs('set-fluid-amount', { amount })}>${amount}<small>mL</small></button>`).join('')}</div><label class="nutrition-field"><span>Custom amount <small>mL</small></span><input id="nutrition-fluid-amount" type="number" inputmode="decimal" min="1" max="10000" step="10" value="350"></label></div>
      <label class="nutrition-field"><span>When</span><input id="nutrition-fluid-at" type="datetime-local" value="${escapeAttr(localDateTimeValue())}"></label>
      <label class="nutrition-field nutrition-field-wide"><span>Label <small>optional</small></span><input id="nutrition-fluid-label" maxlength="80" placeholder="e.g. Sparkling water, green tea"></label>
      <div id="nutrition-fluid-preview" class="nutrition-fluid-preview" aria-live="polite"><span aria-hidden="true">＋</span><div><strong>350 mL water</strong><small>Adds to logged drinks and plain water.</small></div></div>
      <div class="nutrition-fluid-explainer"><strong>Hydration, without false precision</strong><span>This records beverage volume. It does not estimate absorption, subtract caffeine, or present a medical hydration score.</span></div>
      <div class="nutrition-target-actions"><button type="button" class="import-btn import-btn-primary" ${actionAttrs('save-fluid')}>Log 350 mL</button></div>
    </section>`;
}

export function localDateTimeValue(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

export function mealLocalDateTime(meal, reuse = false) {
  if (reuse) return localDateTimeValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(meal?.localDate || '')) && hasFiniteNumber(meal?.localTimeMinutes)) {
    const minutes = Math.max(0, Math.min(1439, Number(meal.localTimeMinutes)));
    return `${meal.localDate}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const date = new Date(meal?.eatenAt);
  return Number.isFinite(date.getTime()) ? localDateTimeValue(date) : localDateTimeValue();
}

export function setElementValue(id, value) {
  const input = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
  if (input && value !== null && value !== undefined) input.value = String(value);
}

export function renderStoredPhotoPreview(images) {
  const preview = document.getElementById('nutrition-photo-preview');
  if (!preview || !images.length) return;
  preview.innerHTML = `<span class="nutrition-photo-grid">${images.slice(0, 4).map((image, index) => `<img src="${escapeAttr(image.thumbnailUrl || image.dataUrl)}" alt="Meal view ${index + 1}">`).join('')}</span><span class="nutrition-photo-change">Change views</span>`;
}

function nutrientInputs(fields = MACRO_REVIEW_FIELDS) {
  return fields.map(([key, label, unit, step]) => `<label class="nutrition-field"><span>${escapeHTML(label)} <small>${escapeHTML(unit)}</small><small id="nutrition-${escapeAttr(key)}-source" class="nutrition-nutrient-source" hidden></small></span><input id="nutrition-${escapeAttr(key)}" data-nutrition-nutrient="${escapeAttr(key)}" inputmode="decimal" type="number" min="0" step="${escapeAttr(step)}"></label>`).join('');
}

function detailedNutrientInputs() {
  return DETAILED_REVIEW_GROUPS.map(group => `<fieldset><legend>${escapeHTML(group.label)}</legend><div class="nutrition-nutrient-grid">${nutrientInputs(group.fields)}</div></fieldset>`).join('');
}

function mealTypeOptions() {
  return `<option value="">Select occasion…</option>${MEAL_TYPES.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHTML(label)}</option>`).join('')}`;
}

function renderRecentMeal(meal, { origin = 'editor' } = {}) {
  const eaten = new Date(meal.eatenAt);
  const date = Number.isFinite(eaten.getTime()) ? eaten.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const components = (meal.components || []).slice(0, 3).map(item => item.name).filter(Boolean).join(' · ');
  const mealType = mealTypeLabel(meal.mealType);
  const image = primaryMealImage(meal);
  const fuelMix = calculateFuelOverlap(meal?.nutrients);
  const checkedIn = hasFiniteNumber(meal?.responseCheckIn?.satiety2h) || hasFiniteNumber(meal?.responseCheckIn?.energy2h);
  const detail = [components, fuelMix && `Carb/fat ${fuelMix.carbEnergyPercent}/${fuelMix.fatEnergyPercent}`, checkedIn && 'Response checked'].filter(Boolean).join(' · ');
  return `<article class="nutrition-meal-row"><button type="button" class="nutrition-meal-open" ${actionAttrs('detail', { id: meal.id, origin })} aria-label="Open ${escapeAttr(meal.name || 'meal')} details">${image?.thumbnailUrl || image?.dataUrl ? `<img src="${escapeAttr(image.thumbnailUrl || image.dataUrl)}" alt="">` : '<span class="nutrition-meal-placeholder" aria-hidden="true">🍽</span>'}<span class="nutrition-meal-copy"><strong>${escapeHTML(meal.name || 'Meal')}</strong><span>${mealType ? `${escapeHTML(mealType)} · ` : ''}${escapeHTML(date)}</span>${detail ? `<small>${escapeHTML(detail)}</small>` : ''}</span><span class="nutrition-meal-energy">${formatNumber(meal.nutrients?.energyKcal, 0)}<small>kcal</small></span></button><button type="button" class="nutrition-meal-delete" aria-label="Delete ${escapeAttr(meal.name || 'meal')}" ${actionAttrs('delete', { id: meal.id, origin })}>Delete</button></article>`;
}

function renderRecentMeals(meals, storageError) {
  if (storageError) return `<div class="nutrition-empty nutrition-storage-error" role="alert">${escapeHTML(storageError)}</div>`;
  if (!meals.length) return '<div class="nutrition-empty">No meals logged for this profile.</div>';
  const visible = meals.slice(0, RECENT_MEALS_DEFAULT_CAP);
  const remaining = meals.slice(RECENT_MEALS_DEFAULT_CAP);
  const remainingLabel = `${remaining.length} more meal${remaining.length === 1 ? '' : 's'}`;
  return `<div class="nutrition-recent-list">${visible.map(renderRecentMeal).join('')}</div>${remaining.length ? `<div id="nutrition-recent-more" class="nutrition-recent-list nutrition-recent-more" hidden>${remaining.map(renderRecentMeal).join('')}</div><button type="button" class="nutrition-recent-toggle" aria-expanded="false" aria-controls="nutrition-recent-more" ${actionAttrs('toggle-recent', { remaining: remaining.length })}>Show ${remainingLabel}</button>` : ''}`;
}

function renderDetailList(title, items) {
  const rows = (Array.isArray(items) ? items : []).map(item => `<li>${escapeHTML(item)}</li>`).join('');
  return rows ? `<section class="nutrition-detail-section"><h4>${escapeHTML(title)}</h4><ul>${rows}</ul></section>` : '';
}

function responseChoice(name, value, label, selected) {
  return `<label class="nutrition-response-choice"><input type="radio" name="${escapeAttr(name)}" value="${value}"${Number(selected) === value ? ' checked' : ''}><span>${escapeHTML(label)}</span></label>`;
}

function renderFuelResponseCheckIn(meal) {
  const response = meal?.responseCheckIn || {};
  const saved = hasFiniteNumber(response?.satiety2h) || hasFiniteNumber(response?.energy2h);
  return `<section class="nutrition-response-card"><div class="nutrition-response-head"><div><span class="nutrition-fuel-kicker">Personal evidence</span><strong>How did this meal feel 2–3 hours later?</strong><small>Repeated check-ins can compare meals with different carb/fat compositions. They do not measure metabolism or prove cause.</small></div>${saved ? '<span class="nutrition-fuel-badge">Checked in</span>' : '<span class="nutrition-fuel-badge">Optional</span>'}</div><div class="nutrition-response-fields"><fieldset><legend>Hunger</legend><div>${responseChoice('nutrition-response-satiety', 1, 'Hungry again', response.satiety2h)}${responseChoice('nutrition-response-satiety', 2, 'Neutral', response.satiety2h)}${responseChoice('nutrition-response-satiety', 3, 'Still satisfied', response.satiety2h)}</div></fieldset><fieldset><legend>Energy</legend><div>${responseChoice('nutrition-response-energy', 1, 'Slump', response.energy2h)}${responseChoice('nutrition-response-energy', 2, 'Steady', response.energy2h)}${responseChoice('nutrition-response-energy', 3, 'Energized', response.energy2h)}</div></fieldset></div><div class="nutrition-response-actions"><small>Saved and cross-synced with this meal. It is not added to the compact AI nutrition summary.</small><div>${saved ? `<button type="button" class="nutrition-text-btn" ${actionAttrs('clear-response', { id: meal.id })}>Clear</button>` : ''}<button type="button" class="import-btn import-btn-primary" ${actionAttrs('save-response', { id: meal.id })}>Save check-in</button></div></div></section>`;
}

export function renderMealDetail(meal, { returnTo = 'history' } = {}) {
  const eaten = new Date(meal.eatenAt);
  const date = Number.isFinite(eaten.getTime()) ? eaten.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) : '';
  const nutrientRows = NUTRIENT_DETAILS.flatMap(([key, label, unit]) => hasFiniteNumber(meal.nutrients?.[key]) ? [`<div><span>${escapeHTML(label)}</span><strong>${formatNumber(meal.nutrients[key])} <small>${escapeHTML(unit)}</small></strong></div>`] : []).join('');
  const componentRows = (meal.components || []).map(item => `<div><span>${escapeHTML(item.name)}</span><strong>${item.quantityG == null ? '—' : `${formatNumber(item.quantityG, 0)} g`}</strong></div>`).join('');
  const confidence = meal.confidence == null ? '' : 'Uncalibrated identity self-check';
  const usage = nutritionUsageSummary(meal.source);
  const usageModel = meal.source?.modelDisplay || meal.source?.model || 'Selected model';
  const hasAIUsageSource = meal.source?.kind === 'ai-photo-estimate' || meal.source?.kind === 'ai-label-scan';
  const usageDetails = usage
    ? `${usageModel} · ${usage.costLabel} · ${usage.totalTokens.toLocaleString()} tokens (${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out)`
    : hasAIUsageSource ? `${usageModel} · token usage was not reported by the provider` : '';
  const reusedOriginal = meal.source?.originalSource;
  const reusedOriginalLabel = reusedOriginal?.kind === 'ai-label-scan' ? 'label scan' : reusedOriginal?.kind === 'ai-photo-estimate' ? 'photo estimate' : reusedOriginal?.kind === 'barcode-database' ? 'barcode database' : 'manual/reviewed values';
  const sourceModel = meal.source?.modelDisplay || meal.source?.model || 'AI model';
  const source = meal.source?.kind === 'ai-label-scan' ? `${sourceModel} label scan${meal.source.provider ? ` via ${meal.source.provider}` : ''}` : meal.source?.kind === 'ai-photo-estimate' ? `${sourceModel}${meal.source.provider ? ` via ${meal.source.provider}` : ''}` : meal.source?.kind === 'barcode-database' ? `${meal.source.foodData?.sourceName || 'Open Food Facts'} · barcode ${meal.source.foodData?.barcode || ''}` : meal.source?.kind === 'reused-meal' ? `Logged again from a reviewed meal · originally ${reusedOriginalLabel}` : 'Manual entry';
  const corrected = meal.source?.correction?.userProvidedMealName ? 'Identification corrected' : '';
  const mealType = mealTypeLabel(meal.mealType);
  const label = meal.source?.label;
  const images = mealImages(meal);
  const editedPortions = Number(meal.source?.review?.editedPortions || 0);
  const editedNutrients = Array.isArray(meal.source?.review?.editedNutrients) ? meal.source.review.editedNutrients.length : 0;
  const editedIdentities = Array.isArray(meal.source?.review?.editedComponentIdentities) ? meal.source.review.editedComponentIdentities.length : 0;
  const reviewParts = [editedIdentities && `${editedIdentities} ingredient identit${editedIdentities === 1 ? 'y' : 'ies'} corrected`, editedPortions && `${editedPortions} portion${editedPortions === 1 ? '' : 's'} adjusted`, editedNutrients && `${editedNutrients} nutrient value${editedNutrients === 1 ? '' : 's'} adjusted`].filter(Boolean);
  const labelDetails = label ? [label.servingSizeText && `Serving size: ${label.servingSizeText}`, hasFiniteNumber(label.servingsPerContainer) && `${formatNumber(label.servingsPerContainer)} servings/container`, hasFiniteNumber(label.consumedAmount) && `${formatNumber(label.consumedAmount)} ${label.consumedUnit || 'servings'} logged`].filter(Boolean).join(' · ') : '';
  const foodData = meal.source?.foodData;
  const foodDataDetails = foodData ? [foodData.schemaVersion != null && `Product schema ${foodData.schemaVersion}`, foodData.productUpdatedAt && `Product updated ${new Date(foodData.productUpdatedAt).toLocaleDateString([], { dateStyle: 'medium' })}`, foodData.cacheHit ? 'Loaded from encrypted local cache' : 'Fetched when logged', 'Community database values reviewed by user'].filter(Boolean).join(' · ') : '';
  const foodComposition = meal.source?.foodComposition;
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
  ];
  const overview = overviewFields.flatMap(([key, labelText, unit, digits]) => hasFiniteNumber(meal.nutrients?.[key])
    ? [`<div><span>${escapeHTML(labelText)}</span><strong>${formatNumber(meal.nutrients[key], Number(digits))}</strong><small>${escapeHTML(unit)}</small></div>`]
    : []).join('');
  const fuelMix = calculateFuelOverlap(meal?.nutrients);
  const ingredientsSection = componentRows ? `<section class="nutrition-detail-section"><h4>Ingredients and reviewed portions</h4><div class="nutrition-detail-components">${componentRows}</div></section>` : '';
  const nutrientsSection = nutrientRows ? `<section class="nutrition-detail-section"><h4>Nutrients</h4><div class="nutrition-detail-nutrients">${nutrientRows}</div></section>` : '<div class="nutrition-empty">No nutrient estimates were saved for this meal.</div>';
  const reviewSections = `${renderDetailList('Estimate assumptions', meal.assumptions)}${renderDetailList('Remaining checks', meal.warnings)}${meal.note ? `<section class="nutrition-detail-section"><h4>Note</h4><p>${escapeHTML(meal.note)}</p></section>` : ''}`;
  return `<button type="button" class="modal-close" aria-label="Close Meals & Nutrition" ${actionAttrs('close')}>&times;</button>
    <div class="nutrition-modal-head"><div><h3>${escapeHTML(meal.name || 'Meal')}</h3><p>${escapeHTML(date)}</p></div></div>
    <div class="nutrition-detail-layout">
      ${images.length ? `<div class="nutrition-detail-gallery">${images.map((image, index) => `<img class="nutrition-detail-photo" src="${escapeAttr(image.dataUrl || image.thumbnailUrl)}" alt="Saved meal view ${index + 1}">`).join('')}</div>` : ''}
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

function renderComparisonModelChoices(models, defaults) {
  if (models.length < 2) return '<div class="nutrition-comparison-empty">Connect or load two vision models in AI Settings.</div>';
  return `<div id="nutrition-comparison-model-list" class="nutrition-comparison-models">${models.map(model => {
    const routeLabel = model.current ? ' · meal model' : model.providerCurrent ? ' · active model' : '';
    const searchText = `${model.providerDisplay} ${model.provider} ${model.modelDisplay} ${model.model}`;
    return `<label class="nutrition-comparison-model${model.current ? ' is-current' : ''}" data-nutrition-model-search="${escapeAttr(searchText)}"><input type="checkbox" data-nutrition-comparison-model value="${escapeAttr(model.value)}"${defaults.has(model.value) ? ' checked' : ''}><span class="nutrition-comparison-model-check" aria-hidden="true">✓</span><span class="nutrition-comparison-model-copy"><span class="nutrition-comparison-model-provider">${escapeHTML(model.providerDisplay)}${routeLabel}</span><strong>${escapeHTML(model.modelDisplay)}</strong><small class="nutrition-model-price">${escapeHTML(model.priceLabel)}</small><em data-nutrition-benchmarked hidden>Compared</em></span></label>`;
  }).join('')}</div><div class="nutrition-comparison-search-empty" data-nutrition-comparison-search-empty hidden>No models match this search.</div>`;
}

export function renderComparisonModelPicker(query = '') {
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
  const renderReferenceField = ([key, label, unit, , step]) => `<label class="nutrition-field"><span>${escapeHTML(label)} <small>${escapeHTML(unit)}</small></span><input data-nutrition-reference="${escapeAttr(key)}" inputmode="decimal" type="number" min="0" step="${escapeAttr(step || '0.1')}"></label>`;
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

export function renderNutritionEditor(meals, { editingMealId = '', reusedMealId = '', storageError = '', returnTo = '', returnMealId = '', returnMealOrigin = 'history' } = {}) {
  const title = editingMealId ? 'Edit meal' : reusedMealId ? 'Log this meal again' : 'Log a meal';
  const subtitle = editingMealId ? 'Update the saved meal.' : reusedMealId ? 'Adjust the time or portions.' : 'Use a photo, scan a label, or enter values manually.';
  const returnControl = returnTo === 'history'
    ? `<button type="button" class="nutrition-route-back" ${actionAttrs('return-history')}>← Meals &amp; Nutrition</button>`
    : returnTo === 'detail' && returnMealId
      ? `<button type="button" class="nutrition-route-back" ${actionAttrs('return-detail', { id: returnMealId, origin: returnMealOrigin })}>← Meal details</button>`
      : '';
  return `<button type="button" class="modal-close" aria-label="Close Meals & Nutrition" ${actionAttrs('close')}>&times;</button>${returnControl}<div class="nutrition-modal-head"><div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(subtitle)}</p></div></div><div class="nutrition-entry-grid"><section class="nutrition-photo-panel"><div class="nutrition-capture-tabs" role="group" aria-label="Photo content"><button type="button" class="is-active" aria-pressed="true" ${actionAttrs('set-kind', { kind: 'meal-photo' })}>Meal photo</button><button type="button" aria-pressed="false" ${actionAttrs('set-kind', { kind: 'nutrition-label' })}>Nutrition label</button></div><label class="nutrition-photo-picker" for="nutrition-photo-input"><span class="nutrition-photo-preview" id="nutrition-photo-preview"><span aria-hidden="true">＋</span><strong id="nutrition-photo-prompt">Add meal photo</strong><small>Up to 4 photos · 20 MB each</small></span><input id="nutrition-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" multiple ${actionAttrs('photo')}></label><div id="nutrition-label-consumption" class="nutrition-label-consumption" hidden><label class="nutrition-field"><span>Amount eaten</span><input id="nutrition-consumed-amount" inputmode="decimal" type="number" min="0.01" step="0.1" value="1"></label><label class="nutrition-field"><span>Unit</span><select id="nutrition-consumed-unit"><option value="servings">serving(s)</option><option value="g">grams</option><option value="ml">milliliters</option><option value="packages">package(s)</option></select></label></div><label class="nutrition-field nutrition-field-wide nutrition-known-details"><span>Known details <small>optional, improves the estimate</small></span><textarea id="nutrition-known-details" rows="2" maxlength="500" placeholder="e.g. Fried Edam cheese, 150 g; tartar sauce; beer was not consumed"></textarea></label><button type="button" id="nutrition-analyze-btn" class="import-btn import-btn-primary" ${actionAttrs('analyze')} ${getMealAnalysisAvailability().available ? '' : 'disabled'}>Analyze photo</button>${renderMealModelControl()}${renderComparisonLauncher()}<div id="nutrition-privacy-line" class="nutrition-privacy-line">Sent only when you choose Analyze photo; originals are not saved. First cloud use asks for approval.</div><div id="nutrition-analysis-progress" class="nutrition-analysis-progress" aria-live="polite" hidden></div><div id="nutrition-analysis-status" class="nutrition-analysis-status" role="status" aria-live="polite"></div></section><section class="nutrition-review-panel"><div id="nutrition-comparison-return" class="nutrition-comparison-return" hidden><span id="nutrition-comparison-return-copy">Benchmark estimate loaded.</span><button type="button" class="nutrition-text-btn" ${actionAttrs('show-comparison')}>Benchmark →</button></div><div class="nutrition-review-heading"><h4>Review meal</h4></div><div id="nutrition-review-evidence" class="nutrition-review-evidence" hidden></div><label class="nutrition-field nutrition-field-wide"><span>Meal name <small>required</small></span><input id="nutrition-meal-name" maxlength="120" placeholder="e.g. Lentil bowl"></label><div id="nutrition-correction-review" class="nutrition-correction-review" hidden><div id="nutrition-correction-copy"><strong>Wrong identification?</strong> Edit the meal name to recalculate the estimate.</div><button type="button" id="nutrition-recalculate-btn" class="import-btn import-btn-secondary" ${actionAttrs('reanalyze')} disabled>Recalculate estimate</button></div><div class="nutrition-review-meta"><label class="nutrition-field"><span>Meal occasion <small>required</small></span><select id="nutrition-meal-type">${mealTypeOptions()}</select></label><label class="nutrition-field"><span>When</span><input id="nutrition-eaten-at" type="datetime-local" value="${escapeAttr(localDateTimeValue())}"></label></div><div class="nutrition-review-section-title"><strong>Energy &amp; macros</strong><span>Unknown values stay blank.</span></div><div class="nutrition-nutrient-grid">${nutrientInputs()}</div><div id="nutrition-fuel-preview" class="nutrition-fuel-preview" aria-live="polite" hidden></div><details class="nutrition-more-nutrients"><summary>Detailed nutrition</summary><div id="nutrition-nutrient-estimate-summary" class="nutrition-nutrient-estimate-summary">Detailed nutrient values come from the selected AI model.</div><div class="nutrition-nutrient-groups">${detailedNutrientInputs()}</div></details><div id="nutrition-components" class="nutrition-components"></div><div id="nutrition-label-details" class="nutrition-label-summary" hidden></div><div id="nutrition-review-checks" class="nutrition-review-checks" hidden></div><label class="nutrition-field nutrition-field-wide"><span>Note <small>optional</small></span><textarea id="nutrition-note" rows="2" maxlength="500" placeholder="Anything you want to remember about this meal"></textarea></label><div class="nutrition-review-actions"><p id="nutrition-save-requirement" role="status"></p><button type="button" id="nutrition-save-btn" class="import-btn import-btn-primary" aria-describedby="nutrition-save-requirement" ${actionAttrs('save')}>${editingMealId ? 'Save changes' : 'Save meal'}</button></div></section></div><section class="nutrition-recent"><div class="nutrition-section-title">Recent meals</div>${renderRecentMeals(meals, storageError)}</section>`;
}
