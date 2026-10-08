// Pure projections for the shared authored nutrition views. Stored/domain data is never mutated.
import { assessFuelStrategy, calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { NUTRITION_HISTORY_RANGES } from './nutrition-summary.js';
import type { NutritionRenderMeal, NutritionRenderHistory, PeriodReader, TargetReader, GoalField, FuelMixReader, FuelResponseReader, FuelOverlapRenderOptions, MealImageReader, MealComponentReader, DateInput } from './nutrition-render.js';

export const MEAL_TYPES = Object.freeze([
  ['breakfast', 'Breakfast'], ['brunch', 'Brunch'], ['lunch', 'Lunch'],
  ['dinner', 'Dinner'], ['snack', 'Snack'], ['drink', 'Drink'], ['other', 'Other'],
]);
export function formatNumber(value: unknown, maximumFractionDigits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits }) : '—';
}

export function hasFiniteNumber(value: unknown) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function goalPercent(value: unknown, target: unknown) {
  const ratio = Number(value) / Number(target);
  return Number.isFinite(ratio) && ratio >= 0 ? Math.min(150, Math.round(ratio * 100)) : 0;
}

function targetAttainment(value: unknown, target: unknown, kind = 'goal') {
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

export function proteinTargetSource(targets: TargetReader) {
  if (targets.proteinBasis === 'fixed') return `${formatNumber(targets.proteinG, 1)} g fixed daily guide`;
  if (targets.proteinUsesWeight && targets.weight) {
    return `${formatNumber(targets.proteinFactor, 2)} g/kg × ${formatNumber(targets.weight.kg, 1)} kg from ${targets.weight.source}${targets.weight.date ? ` (${targets.weight.date})` : ''}`;
  }
  return `${formatNumber(targets.proteinG, 1)} g fallback until a weight measurement is available`;
}

export function mealTypeLabel(value: unknown) {
  return MEAL_TYPES.find(([key]) => key === value)?.[1] || '';
}

export function mealImages(meal: NutritionRenderMeal | null | undefined): unknown[] {
  const images = Array.isArray(meal?.images) ? (meal.images as unknown[]).filter(Boolean) : [];
  return images.length ? images : meal?.image ? [meal.image] : [];
}


export type NutritionTone = 'excellent' | 'good' | 'strained' | 'poor';
export function nutritionToneColor(tone: string | undefined): string {
  return tone === 'excellent' ? 'var(--green)' : tone === 'good' ? 'color-mix(in srgb,var(--green) 72%,var(--yellow))'
    : tone === 'strained' ? 'var(--yellow)' : tone === 'poor' ? 'var(--red)' : 'var(--accent)';
}
export interface NutritionGoalView {
  label: string; comparison: string; observation: boolean; percent: number; note: string;
  grade: { tone: string; label: string } | null; fluid: boolean; aria: string;
}
export function projectNutritionGoal(period: PeriodReader | null | undefined, targets: TargetReader | null | undefined, [key, label, unit, targetKey, kind]: GoalField): NutritionGoalView {
  const value = period?.dailyAverages?.[key], target = targetKey ? targets?.[targetKey] : null;
  const observedDays = Number(period?.nutrientCoverage?.[key]?.completeDays || 0);
  if (kind === 'observe') return { label, comparison: hasFiniteNumber(value) ? `${formatNumber(value, unit === 'mg' ? 0 : 1)} ${unit} recorded avg` : 'No logged values', observation: true, percent: 0, grade: null, fluid: false, aria: '',
    note: observedDays ? `${observedDays} day${observedDays === 1 ? '' : 's'} with recorded values` : 'Optional display · no adequacy score' };
  const comparison = hasFiniteNumber(value) && hasFiniteNumber(target)
    ? `${formatNumber(value, unit === 'mg' ? 0 : 1)} ${unit} recorded · ${formatNumber(target, unit === 'mg' ? 0 : 1)} guide`
    : `— recorded · ${hasFiniteNumber(target) ? `${formatNumber(target, unit === 'mg' ? 0 : 1)} ${unit} guide` : 'no guide'}`;
  const coverage = observedDays ? `${observedDays} day${observedDays === 1 ? '' : 's'} with values for logged ${kind === 'fluid' ? 'drinks' : 'entries'}` : `No recorded ${kind === 'fluid' ? 'drinks' : 'values'}`;
  const personal = targets?.configured === true, grade = personal ? targetAttainment(value, target, kind) : null;
  const guideLabel = personal ? 'personal guide' : 'starter guide';
  const note = kind === 'limit' ? `${guideLabel}; recorded amounts above it are meaningful`
    : kind === 'fluid' ? `${personal ? 'Personal fluid guide' : 'Starter fluid guide'}; beverage volume, not net hydration`
    : `${kind === 'minimum' ? guideLabel : personal ? 'personal target' : 'starter guide'}; partial-day logs may be below actual intake`;
  return { label, comparison, observation: false, percent: goalPercent(value, target), grade, fluid: kind === 'fluid',
    note: `${coverage} · ${note}${key === 'proteinG' ? ` · ${proteinTargetSource(targets!)}` : ''}`,
    aria: `${label}: ${comparison}.${grade ? ` ${grade.label}.` : ''} ${note}` };
}
export interface NutritionRingView { label: string; value: string; unit: string; guide: string; aria: string; percent: number; accent: boolean; grade: { tone: string; label: string } | null; }
export function projectNutritionRing(label: string, value: unknown, target: unknown, unit: string, accent = false, personal = true): NutritionRingView {
  const percent = goalPercent(value, target), grade = personal ? targetAttainment(value, target, 'goal') : null;
  const read = hasFiniteNumber(target) ? `${personal ? 'target' : 'starter guide'} ${formatNumber(target, unit === 'kcal' ? 0 : 1)} ${unit}` : 'no guide';
  const recorded = hasFiniteNumber(value) ? `${formatNumber(value, unit === 'kcal' ? 0 : 1)} ${unit} recorded average` : `No recorded ${label.toLowerCase()} average`;
  return { label, value: hasFiniteNumber(value) ? formatNumber(value, unit === 'kcal' ? 0 : 1) : '—', unit,
    guide: hasFiniteNumber(target) ? `${personal ? 'Target' : 'Guide'} ${formatNumber(target, unit === 'kcal' ? 0 : 1)}` : 'No guide',
    aria: `${label}: ${recorded}; ${read};${grade ? ` ${grade.label};` : ''} days may be partial`, percent: Math.min(100, percent), accent, grade };
}
export interface NutritionFuelView {
  available: boolean; scope: 'window' | 'meal'; compact: boolean; carb: number; fat: number; meta: string;
  guidance: string; pattern: { count: number; copy: string } | null; plan: string;
}
function projectFuelPattern(responses: FuelResponseReader | null | undefined): NutritionFuelView['pattern'] {
  const count = Number(responses?.checkIns || 0), minimum = Number(responses?.minimum || 6);
  if (count < minimum) return null;
  const signals = ([['Later satiety', responses?.satiety], ['Post-meal energy', responses?.energy]] as const).flatMap(([label, signal]) => {
    if (!signal?.available) return [];
    return [`${label} ${signal.direction === 'similar' ? 'was similar' : `was ${signal.direction}`} after the more evenly mixed carb/fat half of your checked-in meals.`];
  });
  return { count, copy: signals.length ? signals.join(' ') : 'Your checked-in meals do not yet contain enough carb/fat composition variation for a comparison.' };
}
export function projectNutritionFuel(mix: FuelMixReader | null | undefined, { scope = 'window', compact = false, fallbackTotalMeals = 0, period = null, targets = null }: FuelOverlapRenderOptions = {}): NutritionFuelView | null {
  const available = !!mix && mix.available !== false && hasFiniteNumber(mix.carbEnergyPercent) && hasFiniteNumber(mix.fatEnergyPercent);
  const total = Number(mix?.totalMeals ?? fallbackTotalMeals ?? 0), complete = Number(mix?.completeMeals || 0);
  if (!available) return scope === 'meal' ? null : {
    available: false, scope, compact: Boolean(compact), carb: 0, fat: 0, meta: '', guidance: '', pattern: null, plan: '',
  };
  const count = Math.max(1, Number(mix?.contributingMeals || complete || 1));
  const energy = hasFiniteNumber(mix?.carbFatEnergyKcal) ? Number(mix?.carbFatEnergyKcal) / (scope === 'meal' ? 1 : count) : null;
  const amount = hasFiniteNumber(energy) ? `${scope === 'meal' ? '' : 'Avg '}${formatNumber(energy, 0)} kcal${scope === 'meal' ? '' : '/meal'} from carbs + fat` : '';
  const strategy = scope === 'window' && period ? assessFuelStrategy(period, targets || {}) : null;
  const targetCarb = strategy?.targetMix?.carbEnergyPercent;
  return { available, scope, compact: Boolean(compact), carb: Math.max(0, Math.min(100, Math.round(Number(mix?.carbEnergyPercent || 0)))), fat: Math.max(0, Math.min(100, Math.round(Number(mix?.fatEnergyPercent || 0)))),
    meta: [amount, scope === 'meal' ? 'Reviewed meal' : `${complete} of ${total} meals included`].filter(Boolean).join(' · '),
    guidance: scope === 'window' && period && !compact ? String(strategy?.actions[0]?.title || '') : '', pattern: scope === 'window' && period && !compact ? projectFuelPattern(period.fuelResponses) : null,
    plan: hasFiniteNumber(targetCarb) ? `Saved plan: ${Number(targetCarb)}% carbohydrate / ${100 - Number(targetCarb)}% fat energy. This is an adherence reference, not a metabolic target.` : '' };
}
export interface NutritionMealRowView { id: string; origin: string; name: string; detailLabel: string; deleteLabel: string; image: string | null; date: string; detail: string; energy: string; }
export function projectNutritionMealRow(meal: NutritionRenderMeal, origin: unknown = 'editor'): NutritionMealRowView {
  const eaten = new Date(meal.eatenAt as DateInput), components = ((meal.components || []) as MealComponentReader[]).slice(0, 3).map(item => item.name).filter(Boolean).join(' · ');
  const type = mealTypeLabel(meal.mealType), image = (mealImages(meal)[0] || null) as MealImageReader | null;
  const fuel = calculateFuelOverlap(meal.nutrients as Parameters<typeof calculateFuelOverlap>[0]);
  const response = meal.responseCheckIn as { satiety2h?: unknown; energy2h?: unknown } | null | undefined;
  return { id: String(meal.id), origin: String(origin), name: String(meal.name || 'Meal'), detailLabel: `Open ${meal.name || 'meal'} details`, deleteLabel: `Delete ${meal.name || 'meal'}`,
    image: image?.thumbnailUrl || image?.dataUrl ? String(image.thumbnailUrl || image.dataUrl) : null,
    date: (type ? `${type} · ` : '') + (Number.isFinite(eaten.getTime()) ? eaten.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''),
    detail: [components, fuel && `Carb/fat ${fuel.carbEnergyPercent}/${fuel.fatEnergyPercent}`, (hasFiniteNumber(response?.satiety2h) || hasFiniteNumber(response?.energy2h)) && 'Response checked'].filter(Boolean).join(' · '),
    energy: formatNumber((meal.nutrients as Record<string, unknown> | null | undefined)?.energyKcal, 0) };
}
export const HISTORY_MEAL_PAGE_SIZE = 12;
export interface NutritionHistoryView {
  tab: 'meals' | 'trends'; ranges: { key: string; label: string; selected: boolean }[]; rangeKey: string; rangeLabel: string; rangeDescription: string;
  returnToEditor: boolean; error: string; hasMeals: boolean; contextEnabled: boolean; all: boolean;
  groups: { key: string; label: string; count: number; meals: NutritionMealRowView[] }[]; total: string; shown: string; remaining: number; days: string;
  stats: { value: string; label: string; detail: string }[]; coverage: { label: string; title: string; values: string; height: number }[];
  ring: NutritionRingView; goals: NutritionGoalView[]; timing: { label: string; value: string }[]; fuel: NutritionFuelView | null;
}
function historyDayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number), date = new Date(year!, month! - 1, day!);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : key;
}
export function projectNutritionHistory(history: NutritionRenderHistory | null | undefined, targets: TargetReader, fields: readonly GoalField[], contextEnabled: boolean, { storageError = '', returnTo = '' }: { storageError?: unknown; returnTo?: unknown } = {}): NutritionHistoryView {
  const period = history?.period || {}, meals = Array.isArray(history?.meals) ? history.meals as NutritionRenderMeal[] : [];
  const visibleCount = Math.max(1, Number(history?.visibleMealCount || HISTORY_MEAL_PAGE_SIZE));
  let end = Math.min(visibleCount, meals.length);
  const boundaryDay = String(meals[end - 1]?.localDate || meals[end - 1]?.eatenAt || '').slice(0, 10);
  while (end < meals.length && boundaryDay && String(meals[end]?.localDate || meals[end]?.eatenAt || '').slice(0, 10) === boundaryDay) end++;
  const groups = new Map<string, NutritionMealRowView[]>();
  for (const meal of meals.slice(0, end)) {
    const key = String(meal?.localDate || meal?.eatenAt || '').slice(0, 10) || 'unknown';
    if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(projectNutritionMealRow(meal, 'history'));
  }
  const foodMeals = Number.isFinite(Number(period.foodMeals)) ? Number(period.foodMeals) : Number(period.meals || 0), drinks = Number(period.drinkEntries || 0);
  const timing = period.timing || {};
  return { tab: history?.view === 'trends' ? 'trends' : 'meals', ranges: NUTRITION_HISTORY_RANGES.map(range => ({ key: range.key, label: range.label, selected: range.key === history?.rangeKey })),
    rangeKey: String(history?.rangeKey || '30d'), rangeLabel: String(history?.rangeLabel || ''), rangeDescription: String(history?.rangeDescription || ''), all: history?.rangeKey === 'all',
    returnToEditor: returnTo === 'editor', error: String(storageError || ''), hasMeals: Number(period.meals || 0) > 0, contextEnabled,
    groups: [...groups].map(([key, rows]) => ({ key, label: historyDayLabel(key), count: rows.length, meals: rows })), total: meals.length.toLocaleString(), shown: meals.slice(0, end).length.toLocaleString(), remaining: Math.max(0, meals.length - meals.slice(0, end).length), days: Number(period.loggedDays || 0).toLocaleString(),
    stats: [{ value: Number(period.loggedDays || 0).toLocaleString(), label: 'Days with entries', detail: String(history?.rangeDescription || '') }, { value: foodMeals.toLocaleString(), label: 'Meals', detail: drinks ? `${drinks.toLocaleString()} drink log${drinks === 1 ? '' : 's'}` : 'Food entries' }, { value: `${Math.round(Number(period.reviewRatio || 0) * 100)}%`, label: 'Entries reviewed', detail: `${Number(period.reviewedMeals || 0).toLocaleString()} of ${Number(period.meals || 0).toLocaleString()}` }],
    coverage: (history?.coverageBuckets || []).map(bucket => { const percent = Math.round(Number(bucket.coverageRatio || 0) * 100); return { label: bucket.label, title: `${bucket.label}: ${bucket.loggedDays} of ${bucket.days} days logged (${percent}%)`, values: `${Number(bucket.loggedDays || 0)}/${Number(bucket.days || 0)}`, height: bucket.loggedDays ? Math.max(4, percent) : 0 }; }),
    ring: projectNutritionRing('Energy', period.dailyAverages?.energyKcal, targets.energyKcal, 'kcal', false, targets.configured), goals: fields.map(field => projectNutritionGoal(period, targets, field)),
    timing: [{ label: 'First logged meal', value: String(timing.averageFirstMealLocalTime || '—') }, { label: 'Last logged meal', value: String(timing.averageLastMealLocalTime || '—') }, { label: 'Observed eating window', value: hasFiniteNumber(timing.averageEatingWindowMinutes) ? `${formatNumber(Number(timing.averageEatingWindowMinutes) / 60, 1)} h` : '—' }, { label: 'Observed fasting window', value: hasFiniteNumber(timing.averageFastingWindowMinutes) ? `${formatNumber(Number(timing.averageFastingWindowMinutes) / 60, 1)} h` : '—' }],
    fuel: projectNutritionFuel(period.fuelOverlap, { scope: 'window', fallbackTotalMeals: foodMeals, period, targets }) };
}

export type NutritionPresentationProps =
  | { kind: 'editable-ingredients'; rows: import('./nutrition-editor-review-model.js').EditableIngredientView[] }
  | { kind: 'editor-feedback'; view: import('./nutrition-editor-review-model.js').NutritionEditorFeedbackView }
  | { kind: 'editor'; view: import('./nutrition-editor-model.js').NutritionEditorView }
  | { kind: 'meal-model'; view: import('./nutrition-editor-model.js').NutritionMealModelView }
  | { kind: 'meal-photo'; view: import('./nutrition-editor-model.js').NutritionMealPhotoView }
  | { kind: 'editor-navigation'; part: 'tabs' | 'records' }
  | { kind: 'analysis-progress'; view: import('./nutrition-editor-model.js').NutritionProgressView }
  | { kind: 'benchmark'; view: import('./nutrition-benchmark-model.js').NutritionComparisonPickerView }
  | { kind: 'comparison-picker'; view: import('./nutrition-benchmark-model.js').NutritionComparisonPickerView }
  | { kind: 'benchmark-photo'; urls: readonly string[] }
  | { kind: 'benchmark-status'; view: import('./nutrition-benchmark-model.js').NutritionBenchmarkStatusView }
  | { kind: 'comparison-results'; view: import('./nutrition-comparison-results-model.js').NutritionComparisonResultsView }
  | { kind: 'detail'; view: import('./nutrition-meal-detail-model.js').NutritionMealDetailView }
  | { kind: 'dashboard'; view: import('./nutrition-dashboard-model.js').NutritionDashboardView }
  | { kind: 'entry'; view: import('./nutrition-entry-model.js').NutritionEntryView }
  | { kind: 'goal'; view: NutritionGoalView } | { kind: 'ring'; view: NutritionRingView }
  | { kind: 'fuel'; view: NutritionFuelView | null } | { kind: 'meal'; view: NutritionMealRowView }
  | { kind: 'history'; view: NutritionHistoryView };
