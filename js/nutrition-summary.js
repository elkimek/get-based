// @ts-check
// nutrition-summary.js — compact rolling aggregates suitable for sync/AI context.

import { summarizeFuelOverlap, summarizeFuelResponses } from './nutrition-fuel-mix.js';

export const NUTRITION_SUMMARY_VERSION = 14;
export const NUTRITION_CONTEXT_CHAR_LIMIT = 1800;

export const NUTRITION_HISTORY_RANGES = Object.freeze([
  Object.freeze({ key: '3m', months: 3, label: '3M', description: 'last 3 months' }),
  Object.freeze({ key: '6m', months: 6, label: '6M', description: 'last 6 months' }),
  Object.freeze({ key: '1y', months: 12, label: '1Y', description: 'last year' }),
  Object.freeze({ key: 'all', months: null, label: 'All', description: 'all recorded history' }),
]);

export const NUTRITION_KEYS = Object.freeze([
  'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sugarG', 'addedSugarG',
  'saturatedFatG', 'transFatG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg',
  'magnesiumMg', 'zincMg', 'vitaminAMcgRae', 'vitaminCMg', 'vitaminDMcg',
  'vitaminEMg', 'vitaminKMcg', 'thiaminMg', 'riboflavinMg', 'niacinMg',
  'vitaminB6Mg', 'folateMcgDfe', 'vitaminB12Mcg', 'cholineMg',
  'seleniumMcg', 'cholesterolMg', 'omega3G',
  'phosphorusMg', 'copperMg', 'manganeseMg', 'waterG', 'fluidMl', 'plainWaterMl', 'caffeineMg', 'alcoholG',
]);

const COMPACT_CONTEXT_NUTRIENTS = Object.freeze([
  ['energyKcal', 'kcal'], ['proteinG', 'protein g'], ['carbohydrateG', 'carbohydrate g'],
  ['fatG', 'fat g'], ['fiberG', 'fiber g'], ['fluidMl', 'logged beverage mL'], ['plainWaterMl', 'logged plain water mL'],
]);

const INTAKE_EVENT_KEYS = new Set(['fluidMl', 'plainWaterMl']);
const PHOTO_CONTEXT_KEYS = new Set(['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'fluidMl', 'plainWaterMl']);
function isVolumeOnlyDrink(meal) {
  return ['manual-water', 'manual-beverage'].includes(String(meal?.source?.kind || ''));
}

function isPhotoEstimate(meal) {
  return String(meal?.source?.kind || '') === 'ai-photo-estimate';
}

function nutrientHasReviewableProvenance(meal, nutrientKey) {
  if (!isPhotoEstimate(meal) || PHOTO_CONTEXT_KEYS.has(nutrientKey)) return true;
  const edited = meal?.source?.review?.editedNutrients;
  return Array.isArray(edited) && edited.includes(nutrientKey);
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeNutritionTotals(totals = {}) {
  const normalized = {};
  for (const key of NUTRITION_KEYS) {
    const value = finiteNonNegative(totals?.[key]);
    if (value !== null) normalized[key] = value;
  }
  return normalized;
}

function roundedTotals(totals, divisor = 1) {
  const output = {};
  for (const [key, value] of Object.entries(totals)) {
    output[key] = Math.round((value / Math.max(1, divisor)) * 10) / 10;
  }
  return output;
}

function nutrientRollup(meals) {
  const rows = Array.isArray(meals) ? meals : [];
  const byDay = new Map();
  for (const meal of rows) {
    const key = mealDayKey(meal);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(meal);
  }

  const totals = {};
  const dailyAverages = {};
  const nutrientCoverage = {};
  for (const nutrientKey of NUTRITION_KEYS) {
    const eventMetric = INTAKE_EVENT_KEYS.has(nutrientKey);
    const relevantMeals = (eventMetric ? rows : rows.filter(meal => !isVolumeOnlyDrink(meal)))
      .filter(meal => nutrientHasReviewableProvenance(meal, nutrientKey));
    let observedMeals = 0;
    let observedTotal = 0;
    for (const meal of relevantMeals) {
      const value = finiteNonNegative(meal?.nutrients?.[nutrientKey]);
      if (value === null) continue;
      observedMeals += 1;
      observedTotal += value;
    }
    if (!observedMeals) continue;

    let completeDays = 0;
    let completeDayTotal = 0;
    let nutrientLoggedDays = 0;
    for (const dayMeals of byDay.values()) {
      const relevantDayMeals = (eventMetric ? dayMeals : dayMeals.filter(meal => !isVolumeOnlyDrink(meal)))
        .filter(meal => nutrientHasReviewableProvenance(meal, nutrientKey));
      if (!relevantDayMeals.length) continue;
      nutrientLoggedDays += 1;
      const values = relevantDayMeals.map(meal => finiteNonNegative(meal?.nutrients?.[nutrientKey]));
      // Beverage-volume fields are explicit intake events. A meal without a
      // fluid entry remains unknown, but must not erase a separately logged
      // glass of water from that day's observed total.
      if (eventMetric) {
        const observed = values.filter(value => value !== null);
        if (!observed.length) continue;
        completeDays += 1;
        completeDayTotal += observed.reduce((sum, value) => sum + Number(value), 0);
        continue;
      }
      if (values.some(value => value === null)) continue;
      completeDays += 1;
      completeDayTotal += values.reduce((sum, value) => sum + Number(value), 0);
    }

    totals[nutrientKey] = observedTotal;
    if (completeDays) dailyAverages[nutrientKey] = completeDayTotal / completeDays;
    nutrientCoverage[nutrientKey] = {
      observedMeals,
      totalMeals: relevantMeals.length,
      completeDays,
      loggedDays: nutrientLoggedDays,
      completeDayRatio: nutrientLoggedDays ? Math.round((completeDays / nutrientLoggedDays) * 1000) / 1000 : 0,
    };
  }
  return {
    totals: roundedTotals(totals),
    dailyAverages: roundedTotals(dailyAverages),
    nutrientCoverage,
  };
}

function dayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mealDayKey(meal) {
  const stored = String(meal?.localDate || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : dayKey(meal?.eatenAt);
}

function mealLocalMinutes(meal) {
  const stored = Number(meal?.localTimeMinutes);
  if (Number.isFinite(stored) && stored >= 0 && stored < 1440) return Math.round(stored);
  const date = new Date(meal?.eatenAt);
  return Number.isFinite(date.getTime()) ? date.getHours() * 60 + date.getMinutes() : null;
}

function averageRounded(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function clockTime(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const rounded = Math.round(minutes) % 1440;
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function roundedAverage(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function validSleepIntervals(intervals) {
  return (Array.isArray(intervals) ? intervals : []).flatMap(interval => {
    const start = new Date(interval?.sleepStart || interval?.sleepStartAt || interval?.sleep_start_at).getTime();
    const end = new Date(interval?.sleepEnd || interval?.sleepEndAt || interval?.sleep_end_at).getTime();
    const duration = end - start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || duration < 2 * 3600000 || duration > 18 * 3600000) return [];
    return [{ start, end, source: String(interval?.source || 'wearable') }];
  });
}

export function sleepRelativeMealSummary(meals, sleepIntervals = []) {
  const instants = (Array.isArray(meals) ? meals : []).map(meal => new Date(meal?.eatenAt).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  const preSleep = [];
  const postWake = [];
  const overnight = [];
  const sourceCounts = {};
  for (const sleep of validSleepIntervals(sleepIntervals)) {
    const lastMeal = [...instants].reverse().find(instant => instant <= sleep.start && sleep.start - instant <= 24 * 3600000);
    const firstMeal = instants.find(instant => instant >= sleep.end && instant - sleep.end <= 24 * 3600000);
    if (lastMeal !== undefined) preSleep.push(Math.round((sleep.start - lastMeal) / 60000));
    if (firstMeal !== undefined) postWake.push(Math.round((firstMeal - sleep.end) / 60000));
    if (lastMeal !== undefined && firstMeal !== undefined) {
      overnight.push(Math.round((firstMeal - lastMeal) / 60000));
      sourceCounts[sleep.source] = (sourceCounts[sleep.source] || 0) + 1;
    }
  }
  return {
    averageLastMealToSleepMinutes: roundedAverage(preSleep),
    lastMealToSleepCount: preSleep.length,
    averageWakeToFirstMealMinutes: roundedAverage(postWake),
    wakeToFirstMealCount: postWake.length,
    averageSleepSpanningMealGapMinutes: roundedAverage(overnight),
    sleepSpanningMealGapCount: overnight.length,
    sourceCounts,
  };
}

function timingSummary(meals, sleepIntervals = []) {
  const byDay = new Map();
  const occasionCounts = {};
  let mealsWithTiming = 0;
  for (const meal of meals) {
    const occasion = String(meal?.mealType || '').trim().toLowerCase();
    if (/^(breakfast|brunch|lunch|dinner|snack|drink|other)$/.test(occasion)) occasionCounts[occasion] = (occasionCounts[occasion] || 0) + 1;
    const minutes = mealLocalMinutes(meal);
    const key = mealDayKey(meal);
    if (minutes === null || !key) continue;
    mealsWithTiming += 1;
    const day = byDay.get(key) || { first: minutes, last: minutes, meals: 0 };
    day.first = Math.min(day.first, minutes);
    day.last = Math.max(day.last, minutes);
    day.meals += 1;
    byDay.set(key, day);
  }
  const days = [...byDay.values()];
  const eatingWindows = days.filter(day => day.meals >= 2).map(day => day.last - day.first);
  const averageFirstMealMinutes = averageRounded(days.map(day => day.first));
  const averageLastMealMinutes = averageRounded(days.map(day => day.last));
  const averageEatingWindowMinutes = averageRounded(eatingWindows);
  const averageFirstMealLocalTime = clockTime(averageFirstMealMinutes);
  const averageLastMealLocalTime = clockTime(averageLastMealMinutes);
  const sleepRelative = sleepRelativeMealSummary(meals, sleepIntervals);
  return {
    mealsWithTiming,
    daysWithTiming: days.length,
    averageFirstMealMinutes,
    averageLastMealMinutes,
    averageFirstMealLocalTime,
    averageLastMealLocalTime,
    averageEatingWindowMinutes,
    eatingWindowDays: eatingWindows.length,
    occasionCounts,
    sleepRelative,
  };
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function subtractLocalMonths(date, months) {
  const result = startOfLocalDay(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function localCalendarDayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function localDateFromKey(key) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
}

function historyCoverageBuckets(start, end, loggedDayKeys) {
  const logged = new Set(loggedDayKeys || []);
  const monthly = new Map();
  for (const date = new Date(start); date < end; date.setDate(date.getDate() + 1)) {
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = monthly.get(monthKey) || {
      key: monthKey,
      label: date.toLocaleDateString([], { month: 'short', year: '2-digit' }),
      days: 0,
      loggedDays: 0,
    };
    bucket.days += 1;
    if (logged.has(dayKey(date))) bucket.loggedDays += 1;
    monthly.set(monthKey, bucket);
  }
  const buckets = [...monthly.values()];
  if (buckets.length <= 24) {
    return buckets.map(bucket => ({
      ...bucket,
      coverageRatio: bucket.days ? Math.round((bucket.loggedDays / bucket.days) * 1000) / 1000 : 0,
    }));
  }
  const yearly = new Map();
  for (const month of buckets) {
    const yearKey = month.key.slice(0, 4);
    const bucket = yearly.get(yearKey) || { key: yearKey, label: yearKey, days: 0, loggedDays: 0 };
    bucket.days += month.days;
    bucket.loggedDays += month.loggedDays;
    yearly.set(yearKey, bucket);
  }
  return [...yearly.values()].map(bucket => ({
    ...bucket,
    coverageRatio: bucket.days ? Math.round((bucket.loggedDays / bucket.days) * 1000) / 1000 : 0,
  }));
}

function windowSummary(meals, days, now, sleepIntervals = [], offsetDays = 0) {
  const end = startOfLocalDay(now);
  end.setDate(end.getDate() + 1);
  end.setDate(end.getDate() - offsetDays);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startKey = dayKey(start);
  const endKey = dayKey(end);
  const included = meals.filter(meal => {
    const key = mealDayKey(meal);
    return key && key >= startKey && key < endKey;
  });
  const loggedDays = new Set();
  for (const meal of included) {
    const key = mealDayKey(meal);
    if (key) loggedDays.add(key);
  }
  const nutrients = nutrientRollup(included);
  const drinkEntries = included.filter(isVolumeOnlyDrink).length;
  const foodMeals = included.length - drinkEntries;
  const reviewedMeals = included.filter(meal => meal?.reviewed !== false).length;
  return {
    days,
    meals: included.length,
    foodMeals,
    drinkEntries,
    loggedDays: loggedDays.size,
    loggedDayKeys: [...loggedDays].sort(),
    coverageRatio: Math.round((loggedDays.size / days) * 1000) / 1000,
    reviewedMeals,
    reviewRatio: included.length ? Math.round((reviewedMeals / included.length) * 1000) / 1000 : 0,
    totals: nutrients.totals,
    dailyAverages: nutrients.dailyAverages,
    nutrientCoverage: nutrients.nutrientCoverage,
    fuelOverlap: summarizeFuelOverlap(included),
    fuelResponses: summarizeFuelResponses(included),
    timing: timingSummary(included.filter(meal => !isVolumeOnlyDrink(meal)), sleepIntervals),
  };
}

/**
 * Build an aggregate-only history view on demand. This is intentionally not
 * stored in the synced summary or appended to regular chat context.
 * @param {Array<any>} meals
 * @param {{rangeKey?: string, now?: Date, sleepIntervals?: Array<any>}} [options]
 */
export function computeNutritionHistory(meals, { rangeKey = '3m', now = new Date(), sleepIntervals = [] } = {}) {
  const validMeals = (Array.isArray(meals) ? meals : []).filter(meal => mealDayKey(meal));
  const definition = NUTRITION_HISTORY_RANGES.find(range => range.key === rangeKey)
    || NUTRITION_HISTORY_RANGES[0];
  const today = startOfLocalDay(now);
  const todayKey = dayKey(today);
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  const historicKeys = validMeals.map(mealDayKey).filter(key => key && key <= todayKey).sort();
  const start = definition.months == null
    ? (localDateFromKey(historicKeys[0]) || today)
    : subtractLocalMonths(today, definition.months);
  const days = Math.max(1, localCalendarDayNumber(end) - localCalendarDayNumber(start));
  const period = windowSummary(validMeals, days, now, sleepIntervals);
  return {
    rangeKey: definition.key,
    rangeLabel: definition.label,
    rangeDescription: definition.description,
    startKey: dayKey(start),
    endKey: todayKey,
    period,
    coverageBuckets: historyCoverageBuckets(start, end, period.loggedDayKeys),
  };
}

function contextAverage(averages = {}, coverage = {}, nutrientFields = COMPACT_CONTEXT_NUTRIENTS) {
  return nutrientFields.flatMap(([key, label]) => {
    const value = averages?.[key];
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return [];
    const observed = coverage?.[key];
    const coverageLabel = observed?.loggedDays && observed.completeDays < observed.loggedDays
      ? ` [${observed.completeDays}/${observed.loggedDays} complete logged days]`
      : '';
    return [`${label} ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${coverageLabel}`];
  }).join('; ');
}

function contextWindow(label, period, nutrientFields = COMPACT_CONTEXT_NUTRIENTS) {
  if (!period?.meals) return `${label}: no logged meals`;
  const foodMeals = Number.isFinite(Number(period.foodMeals)) ? Number(period.foodMeals) : Number(period.meals);
  const drinkEntries = Number(period.drinkEntries || 0);
  const entries = `${foodMeals} meals${drinkEntries ? ` and ${drinkEntries} volume-only drink logs` : ''}`;
  const occasions = Object.entries(period?.timing?.occasionCounts || {})
    .map(([occasion, count]) => `${occasion} ${count}`)
    .join(', ');
  return `${label}: ${entries} across ${period.loggedDays}/${period.days} days${occasions ? `; occasions: ${occasions}` : ''}; ${Math.round((period.reviewRatio || 0) * 100)}% reviewed; logged averages: ${contextAverage(period.dailyAverages, period.nutrientCoverage, nutrientFields) || 'no nutrient totals'}`;
}

function contextTrend(summary) {
  const recent = summary?.windows?.d7?.dailyAverages || {};
  const recentCoverage = summary?.windows?.d7?.nutrientCoverage || {};
  const baseline = summary?.trendBaseline?.dailyAverages || {};
  const baselineCoverage = summary?.trendBaseline?.nutrientCoverage || {};
  const parts = COMPACT_CONTEXT_NUTRIENTS.flatMap(([key, label]) => {
    const current = Number(recent[key]);
    const previous = Number(baseline[key]);
    if (Number(recentCoverage?.[key]?.completeDays || 0) < 3 || Number(baselineCoverage?.[key]?.completeDays || 0) < 5) return [];
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return [];
    const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
    return Math.abs(change) >= 5 ? [`${label} ${change > 0 ? '+' : ''}${change}%`] : [];
  });
  return parts.length ? `7-day average compared with the previous 23-day period: ${parts.join('; ')}` : '';
}

function contextFuelOverlap(period) {
  const fuel = period?.fuelOverlap;
  if (!fuel?.available) return '';
  return `7-day logged carb-fat composition: ${fuel.carbEnergyPercent}% carbohydrate and ${fuel.fatEnergyPercent}% fat energy (${fuel.ratioLabel}; ${fuel.completeMeals}/${fuel.totalMeals} logged meals had both macros). This descriptive split has no preferred center or universal target; interpret it with absolute energy, carbohydrate amount, fiber, and fat quality. It is not measured Randle-cycle activity, substrate oxidation, insulin sensitivity, or metabolic health.`;
}

export function buildNutritionSummaryContext(summary) {
  if (!summary?.totalMeals) return '';
  const required = [
    '[section:nutrition]',
    '## Meals & Nutrition — reviewed logged estimates',
    'Coverage-limited, non-diagnostic log: missing days/values are unknown, not zero; photo micronutrients require compatible composition data for every material ingredient.',
    'Partial logs leave full-day intake unknown. Never infer skipped meals, under-eating, or calorie/macro deficiency without user-confirmed complete days. Detailed logs replace, never supplement, Diet & Digestion Typical meals.',
    contextWindow('Last 7 days', summary.windows?.d7),
  ];
  const optional = [contextFuelOverlap(summary.windows?.d7), contextTrend(summary)].filter(Boolean);
  const lines = [...required];
  for (const line of optional) {
    const candidate = `${[...lines, line, '[/section:nutrition]'].join('\n')}\n\n`;
    if (candidate.length <= NUTRITION_CONTEXT_CHAR_LIMIT) lines.push(line);
  }
  return `${[...lines, '[/section:nutrition]'].join('\n')}\n\n`;
}

/**
 * @param {Array<any>} meals
 * @param {{now?: Date, sleepIntervals?: Array<any>}} [options]
 */
export function computeNutritionSummary(meals, { now = new Date(), sleepIntervals = [] } = {}) {
  const validMeals = (Array.isArray(meals) ? meals : []).filter(meal => mealDayKey(meal));
  const sorted = [...validMeals].sort((a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime());
  const previous23 = windowSummary(validMeals, 23, now, [], 7);
  const summary = {
    version: NUTRITION_SUMMARY_VERSION,
    updatedAt: now.toISOString(),
    lastMealAt: sorted[0]?.eatenAt || null,
    totalMeals: validMeals.length,
    totalFoodMeals: validMeals.filter(meal => !isVolumeOnlyDrink(meal)).length,
    totalDrinkEntries: validMeals.filter(isVolumeOnlyDrink).length,
    windows: {
      d7: windowSummary(validMeals, 7, now, sleepIntervals),
      d30: windowSummary(validMeals, 30, now, sleepIntervals),
    },
    trendBaseline: {
      days: previous23.days,
      loggedDays: previous23.loggedDays,
      dailyAverages: previous23.dailyAverages,
      nutrientCoverage: previous23.nutrientCoverage,
    },
  };
  summary.contextText = buildNutritionSummaryContext(summary);
  return summary;
}
