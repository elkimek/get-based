// @ts-check
// nutrition-summary-context.js — compact aggregate-only nutrition text for AI.

import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';

export const NUTRITION_CONTEXT_CHAR_LIMIT = 2600;

const COMPACT_CONTEXT_NUTRIENTS = Object.freeze(/** @type {Array<[string, string]>} */ ([
  ['energyKcal', 'kcal'], ['proteinG', 'protein g'], ['carbohydrateG', 'carbohydrate g'],
  ['fatG', 'fat g'], ['fiberG', 'fiber g'], ['fluidMl', 'logged beverage mL'], ['plainWaterMl', 'logged plain water mL'],
]));
const COMPACT_CONTEXT_KEYS = new Set(COMPACT_CONTEXT_NUTRIENTS.map(([key]) => key));
// Keep this derived from the editor/analysis registry. A newly supported
// nutrient then reaches aggregate AI context without another hand-maintained
// allowlist. Core values remain in the short window lines; every other
// observed value is emitted once for the selected timeframe.
const DETAILED_CONTEXT_NUTRIENTS = Object.freeze(NUTRIENT_DEFINITIONS
  .filter(field => !COMPACT_CONTEXT_KEYS.has(field.key))
  .map(field => Object.freeze(/** @type {[string, string]} */ ([field.key, `${field.label.toLowerCase()} ${field.unit}`]))));

/**
 * @param {Record<string, any>} [averages]
 * @param {Record<string, any>} [coverage]
 * @param {readonly (readonly [string, string])[]} [nutrientFields]
 * @param {{compactCoverage?: boolean}} [options]
 */
function contextAverageParts(averages = {}, coverage = {}, nutrientFields = COMPACT_CONTEXT_NUTRIENTS, { compactCoverage = false } = {}) {
  return nutrientFields.flatMap(([key, label]) => {
    const value = averages?.[key];
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return [];
    const observed = coverage?.[key];
    const coverageLabel = observed?.loggedDays && observed.completeDays < observed.loggedDays
      ? compactCoverage
        ? ` [${observed.completeDays}/${observed.loggedDays} complete days]`
        : ` [full values for logged entries on ${observed.completeDays}/${observed.loggedDays} days]`
      : '';
    return [`${label} ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${coverageLabel}`];
  });
}

/**
 * @param {Record<string, any>} [averages]
 * @param {Record<string, any>} [coverage]
 * @param {readonly (readonly [string, string])[]} [nutrientFields]
 * @param {{compactCoverage?: boolean}} [options]
 */
function contextAverage(averages = {}, coverage = {}, nutrientFields = COMPACT_CONTEXT_NUTRIENTS, options = {}) {
  return contextAverageParts(averages, coverage, nutrientFields, options).join('; ');
}

function contextWindow(label, period, nutrientFields = COMPACT_CONTEXT_NUTRIENTS, { includeTiming = false } = {}) {
  if (!period?.meals) return `${label}: no logged meals`;
  const foodMeals = Number.isFinite(Number(period.foodMeals)) ? Number(period.foodMeals) : Number(period.meals);
  const drinkEntries = Number(period.drinkEntries || 0);
  const entries = `${foodMeals} meals${drinkEntries ? ` and ${drinkEntries} volume-only drink logs` : ''}`;
  const occasions = Object.entries(period?.timing?.occasionCounts || {})
    .map(([occasion, count]) => `${occasion} ${count}`)
    .join(', ');
  const timing = period?.timing || {};
  const timingParts = includeTiming ? [
    timing.averageFirstMealLocalTime && `first logged meal ${timing.averageFirstMealLocalTime}`,
    timing.averageLastMealLocalTime && `last logged meal ${timing.averageLastMealLocalTime}`,
    timing.averageEatingWindowMinutes !== null && timing.averageEatingWindowMinutes !== undefined
      && Number.isFinite(Number(timing.averageEatingWindowMinutes))
      && `observed eating window ${Math.round(Number(timing.averageEatingWindowMinutes) / 6) / 10} h`,
    timing.averageFastingWindowMinutes !== null && timing.averageFastingWindowMinutes !== undefined
      && Number.isFinite(Number(timing.averageFastingWindowMinutes))
      && `observed fasting window ${Math.round(Number(timing.averageFastingWindowMinutes) / 6) / 10} h`,
  ].filter(Boolean) : [];
  return `${label}: ${entries} across ${period.loggedDays}/${period.days} days${occasions ? `; occasions: ${occasions}` : ''}${timingParts.length ? `; timing: ${timingParts.join(', ')}` : ''}; ${Math.round((period.reviewRatio || 0) * 100)}% of entries reviewed; recorded daily averages (days may be partial): ${contextAverage(period.dailyAverages, period.nutrientCoverage, nutrientFields) || 'no nutrient totals'}`;
}

function contextTrend(summary, days = 30) {
  const recent = summary?.windows?.d7?.dailyAverages || {};
  const recentCoverage = summary?.windows?.d7?.nutrientCoverage || {};
  const baselineDays = days - 7;
  const baselineSummary = summary?.trendBaselines?.[`d${days}`]
    || (days === 30 ? summary?.trendBaseline : null);
  const baseline = baselineSummary?.dailyAverages || {};
  const baselineCoverage = baselineSummary?.nutrientCoverage || {};
  const minimumBaselineDays = days === 90 ? 14 : 5;
  const parts = COMPACT_CONTEXT_NUTRIENTS.flatMap(([key, label]) => {
    const current = Number(recent[key]);
    const previous = Number(baseline[key]);
    if (Number(recentCoverage?.[key]?.completeDays || 0) < 3
        || Number(baselineCoverage?.[key]?.completeDays || 0) < minimumBaselineDays) return [];
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return [];
    const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
    return Math.abs(change) >= 5 ? [`${label} ${change > 0 ? '+' : ''}${change}%`] : [];
  });
  return parts.length ? `7-day average compared with the previous ${baselineDays}-day period: ${parts.join('; ')}` : '';
}

function contextFuelOverlap(period, label = '7-day') {
  const fuel = period?.fuelOverlap;
  if (!fuel?.available) return '';
  return `${label} logged carb-fat composition: ${fuel.carbEnergyPercent}% carbohydrate and ${fuel.fatEnergyPercent}% fat energy (${fuel.ratioLabel}; ${fuel.completeMeals}/${fuel.totalMeals} logged meals had both macros). This descriptive split has no preferred center or universal target; interpret it with absolute energy, carbohydrate amount, fiber, and fat quality. It is not measured Randle-cycle activity, substrate oxidation, insulin sensitivity, or metabolic health.`;
}

function appendDetailedNutrients(lines, period, label) {
  const values = contextAverageParts(
    period?.dailyAverages,
    period?.nutrientCoverage,
    DETAILED_CONTEXT_NUTRIENTS,
    { compactCoverage: true },
  );
  if (!values.length) return;
  const prefix = `${label} detailed recorded daily averages: `;
  let detail = prefix;
  let included = 0;
  for (const value of values) {
    const next = `${detail}${included ? '; ' : ''}${value}`;
    const candidate = `${[...lines, next, '[/section:nutrition]'].join('\n')}\n\n`;
    if (candidate.length > NUTRITION_CONTEXT_CHAR_LIMIT) break;
    detail = next;
    included += 1;
  }
  if (included) lines.push(detail);
}

export function buildNutritionSummaryContext(summary, { days = 30 } = {}) {
  if (!summary?.totalMeals) return '';
  const selectedDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const selectedPeriod = summary.windows?.[`d${selectedDays}`];
  const required = [
    '[section:nutrition]',
    '## Meals & Nutrition — reviewed logged estimates',
    'Coverage-limited, non-diagnostic log: missing days/values are unknown, not zero; photo micronutrients require compatible composition data for every material ingredient.',
    'Partial logs leave full-day intake unknown. Never infer skipped meals, under-eating, or calorie/macro deficiency without user-confirmed complete days. Detailed logs replace, never supplement, Diet & Digestion Typical meals.',
    contextWindow('Last 7 days', summary.windows?.d7, COMPACT_CONTEXT_NUTRIENTS, { includeTiming: true }),
  ];
  if (selectedDays > 7) required.push(contextWindow(`Last ${selectedDays} days`, selectedPeriod));
  appendDetailedNutrients(required, selectedPeriod, `Last ${selectedDays} days`);
  const optional = [
    contextFuelOverlap(summary.windows?.d7),
    selectedDays > 7 ? contextTrend(summary, selectedDays) : '',
  ].filter(Boolean);
  const lines = [...required];
  for (const line of optional) {
    const candidate = `${[...lines, line, '[/section:nutrition]'].join('\n')}\n\n`;
    if (candidate.length <= NUTRITION_CONTEXT_CHAR_LIMIT) lines.push(line);
  }
  return `${[...lines, '[/section:nutrition]'].join('\n')}\n\n`;
}

export function buildNutritionHistoryAnalysisPrompt(history) {
  const period = history?.period;
  if (!period?.meals) return '';
  const label = history.rangeDescription || history.rangeLabel || 'selected timeframe';
  const lines = [
    `Review my Meals & Nutrition history for the ${label}.`,
    `Nutrition history range: ${history.rangeLabel || 'selected range'} (${label}).`,
    'This is a coverage-limited aggregate: unlogged days and missing nutrient values are unknown, not zero. Do not infer skipped meals, under-eating, or a deficiency unless the logging coverage supports it.',
    contextWindow(`Selected ${history.rangeLabel || 'range'}`, period),
  ];
  const detailed = contextAverage(
    period.dailyAverages,
    period.nutrientCoverage,
    DETAILED_CONTEXT_NUTRIENTS,
    { compactCoverage: true },
  );
  if (detailed) lines.push(`Selected ${history.rangeLabel || 'range'} detailed recorded daily averages: ${detailed}`);
  const timing = period?.timing;
  if (timing?.mealsWithTiming) {
    const timingParts = [
      timing.averageFirstMealLocalTime && `average first logged meal ${timing.averageFirstMealLocalTime}`,
      timing.averageLastMealLocalTime && `average last logged meal ${timing.averageLastMealLocalTime}`,
      timing.averageEatingWindowMinutes !== null && timing.averageEatingWindowMinutes !== undefined
        && Number.isFinite(Number(timing.averageEatingWindowMinutes))
        && `average observed eating window ${Math.round(Number(timing.averageEatingWindowMinutes) / 6) / 10} hours`,
      timing.averageFastingWindowMinutes !== null && timing.averageFastingWindowMinutes !== undefined
        && Number.isFinite(Number(timing.averageFastingWindowMinutes))
        && `average observed fasting window ${Math.round(Number(timing.averageFastingWindowMinutes) / 6) / 10} hours`,
    ].filter(Boolean);
    if (timingParts.length) lines.push(`Logged timing: ${timingParts.join('; ')}.`);
  }
  lines.push('What patterns are reasonably supported, what remains uncertain because of coverage, and what would be most useful to track next?');
  return lines.join('\n');
}
