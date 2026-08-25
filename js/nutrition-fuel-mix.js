// @ts-check
// nutrition-fuel-mix.js — transparent dietary carb/fat overlap estimates.
//
// This module describes logged intake. It does not estimate substrate oxidation,
// insulin action, or cellular Randle-cycle "activation".

export const CARBOHYDRATE_KCAL_PER_GRAM = 4;
export const FAT_KCAL_PER_GRAM = 9;
export const FUEL_RESPONSE_MINIMUM = 6;

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function rounded(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function fuelDirection(carbEnergyFraction) {
  const fraction = Number(carbEnergyFraction);
  if (!Number.isFinite(fraction)) return 'Unknown mix';
  if (fraction >= 0.8) return 'Carb-dominant';
  if (fraction > 0.6) return 'Carb-led';
  if (fraction >= 0.4) return 'Mixed intake';
  if (fraction > 0.2) return 'Fat-led';
  return 'Fat-dominant';
}

function ratioLabel(carbEnergyKcal, fatEnergyKcal) {
  if (carbEnergyKcal <= 0) return 'Fat energy only';
  if (fatEnergyKcal <= 0) return 'Carb energy only';
  const ratio = carbEnergyKcal / fatEnergyKcal;
  if (ratio >= 1) return `${rounded(ratio, 1)}:1 carb:fat energy`;
  return `1:${rounded(1 / ratio, 1)} carb:fat energy`;
}

/**
 * Calculates how evenly carbohydrate and fat energy coexist in one logged meal.
 * 100 = equal carb/fat energy; 0 = only one of those fuels. Protein, alcohol,
 * timing, hormones, circulating substrates, and oxidation are intentionally not
 * inferred by this intake-only index.
 *
 * @param {Record<string, any>} nutrients
 */
export function calculateFuelOverlap(nutrients = {}) {
  const carbohydrateG = finiteNonNegative(nutrients?.carbohydrateG);
  const fatG = finiteNonNegative(nutrients?.fatG);
  if (carbohydrateG === null || fatG === null) return null;

  const carbEnergyKcal = carbohydrateG * CARBOHYDRATE_KCAL_PER_GRAM;
  const fatEnergyKcal = fatG * FAT_KCAL_PER_GRAM;
  const carbFatEnergyKcal = carbEnergyKcal + fatEnergyKcal;
  if (carbFatEnergyKcal <= 0) return null;

  const carbEnergyFraction = carbEnergyKcal / carbFatEnergyKcal;
  const overlapFraction = (2 * Math.min(carbEnergyKcal, fatEnergyKcal)) / carbFatEnergyKcal;
  return {
    carbohydrateG: rounded(carbohydrateG),
    fatG: rounded(fatG),
    carbEnergyKcal: rounded(carbEnergyKcal),
    fatEnergyKcal: rounded(fatEnergyKcal),
    carbFatEnergyKcal: rounded(carbFatEnergyKcal),
    carbEnergyPercent: Math.round(carbEnergyFraction * 100),
    fatEnergyPercent: Math.round((1 - carbEnergyFraction) * 100),
    overlapFraction,
    overlapScore: Math.round(overlapFraction * 100),
    direction: fuelDirection(carbEnergyFraction),
    ratioLabel: ratioLabel(carbEnergyKcal, fatEnergyKcal),
  };
}

function isVolumeOnlyDrink(meal) {
  return ['manual-water', 'manual-beverage'].includes(String(meal?.source?.kind || ''));
}

/**
 * Builds an energy-weighted overlap index from individual meals. Calculating
 * each meal first avoids treating separated carb-only and fat-only meals as one
 * balanced mixed meal merely because their multi-day totals happen to match.
 *
 * @param {Array<any>} meals
 */
export function summarizeFuelOverlap(meals = []) {
  const foodMeals = (Array.isArray(meals) ? meals : []).filter(meal => !isVolumeOnlyDrink(meal));
  const knownMeals = foodMeals.filter(meal => finiteNonNegative(meal?.nutrients?.carbohydrateG) !== null
    && finiteNonNegative(meal?.nutrients?.fatG) !== null);
  const mixes = knownMeals.map(meal => calculateFuelOverlap(meal?.nutrients)).filter(Boolean);
  const coverageRatio = foodMeals.length ? rounded(knownMeals.length / foodMeals.length, 3) : 0;
  if (!mixes.length) {
    return {
      available: false,
      totalMeals: foodMeals.length,
      completeMeals: knownMeals.length,
      contributingMeals: 0,
      coverageRatio,
    };
  }

  const carbEnergyKcal = mixes.reduce((sum, mix) => sum + Number(mix?.carbEnergyKcal || 0), 0);
  const fatEnergyKcal = mixes.reduce((sum, mix) => sum + Number(mix?.fatEnergyKcal || 0), 0);
  const carbFatEnergyKcal = mixes.reduce((sum, mix) => sum + Number(mix?.carbFatEnergyKcal || 0), 0);
  const weightedOverlap = mixes.reduce((sum, mix) => (
    sum + Number(mix?.overlapFraction || 0) * Number(mix?.carbFatEnergyKcal || 0)
  ), 0) / carbFatEnergyKcal;
  const carbEnergyFraction = carbEnergyKcal / carbFatEnergyKcal;

  return {
    available: true,
    totalMeals: foodMeals.length,
    completeMeals: knownMeals.length,
    contributingMeals: mixes.length,
    coverageRatio,
    carbEnergyKcal: rounded(carbEnergyKcal),
    fatEnergyKcal: rounded(fatEnergyKcal),
    carbFatEnergyKcal: rounded(carbFatEnergyKcal),
    carbEnergyPercent: Math.round(carbEnergyFraction * 100),
    fatEnergyPercent: Math.round((1 - carbEnergyFraction) * 100),
    overlapFraction: weightedOverlap,
    overlapScore: Math.round(weightedOverlap * 100),
    direction: fuelDirection(carbEnergyFraction),
    ratioLabel: ratioLabel(carbEnergyKcal, fatEnergyKcal),
  };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function responseLevel(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 3 ? number : null;
}

function responseComparison(observations, key) {
  const eligible = observations.filter(item => responseLevel(item?.[key]) !== null);
  if (eligible.length < FUEL_RESPONSE_MINIMUM) return null;
  const ordered = [...eligible].sort((a, b) => a.overlapScore - b.overlapScore);
  const groupSize = Math.floor(ordered.length / 2);
  const lower = ordered.slice(0, groupSize);
  const higher = ordered.slice(-groupSize);
  const overlapRange = higher[higher.length - 1].overlapScore - lower[0].overlapScore;
  if (overlapRange < 20) return { available: false, reason: 'variation', observations: eligible.length, overlapRange };
  const lowerAverage = average(lower.map(item => item[key]));
  const higherAverage = average(higher.map(item => item[key]));
  const difference = Number(higherAverage) - Number(lowerAverage);
  return {
    available: true,
    observations: eligible.length,
    lowerAverage: rounded(Number(lowerAverage), 2),
    higherAverage: rounded(Number(higherAverage), 2),
    difference: rounded(difference, 2),
    direction: Math.abs(difference) < 0.35 ? 'similar' : difference > 0 ? 'higher' : 'lower',
    overlapRange,
  };
}

/**
 * Compares optional 2–3 hour subjective check-ins across the user's own lower-
 * and higher-overlap meals. This is an exploratory within-person association,
 * not a causal or metabolic claim.
 *
 * @param {Array<any>} meals
 */
export function summarizeFuelResponses(meals = []) {
  const observations = (Array.isArray(meals) ? meals : []).flatMap(meal => {
    const mix = calculateFuelOverlap(meal?.nutrients);
    const satiety2h = responseLevel(meal?.responseCheckIn?.satiety2h);
    const energy2h = responseLevel(meal?.responseCheckIn?.energy2h);
    if (!mix || (satiety2h === null && energy2h === null)) return [];
    return [{ overlapScore: mix.overlapScore, satiety2h, energy2h }];
  });
  return {
    checkIns: observations.length,
    minimum: FUEL_RESPONSE_MINIMUM,
    remaining: Math.max(0, FUEL_RESPONSE_MINIMUM - observations.length),
    ready: observations.length >= FUEL_RESPONSE_MINIMUM,
    satiety: responseComparison(observations, 'satiety2h'),
    energy: responseComparison(observations, 'energy2h'),
  };
}

/**
 * Turns the neutral intake index into an adherence aid by comparing it with the
 * user's saved carb/fat plan and by prioritizing stronger nutrition levers.
 * The five-point band is a product tolerance around a personal plan, not a
 * biological optimum.
 *
 * @param {any} period
 * @param {any} targets
 */
export function assessFuelStrategy(period = {}, targets = {}) {
  const mix = period?.fuelOverlap;
  const configured = targets?.configured === true;
  const targetMix = configured ? calculateFuelOverlap({
    carbohydrateG: targets?.carbohydrateG,
    fatG: targets?.fatG,
  }) : null;
  const planDelta = mix?.available && targetMix
    ? Math.round(Number(mix.carbEnergyPercent) - Number(targetMix.carbEnergyPercent))
    : null;
  const actions = [];
  const completeMeals = Number(mix?.completeMeals || 0);
  const totalMeals = Number(mix?.totalMeals || 0);
  if (totalMeals && (completeMeals < 3 || completeMeals / totalMeals < 0.7)) {
    actions.push({
      kind: 'coverage',
      title: 'Complete the pattern first',
      text: `${completeMeals}/${totalMeals} meals have both macros. Review more meals before changing your plan from this signal.`,
    });
  }

  const averages = period?.dailyAverages || {};
  const coverage = period?.nutrientCoverage || {};
  const energyRatio = Number(averages.energyKcal) / Number(targets?.energyKcal);
  if (configured && Number(coverage?.energyKcal?.completeDays || 0) >= 3 && Number.isFinite(energyRatio) && energyRatio > 1.05) {
    actions.push({
      kind: 'energy',
      title: 'Energy is the stronger lever',
      text: `Your complete logged-day average is ${Math.round((energyRatio - 1) * 100)}% above your saved energy target. Review portions and energy density before changing carb–fat overlap.`,
    });
  }

  const fiberRatio = Number(averages.fiberG) / Number(targets?.fiberG);
  if (configured && Number(targets?.fiberG) > 0 && Number(coverage?.fiberG?.completeDays || 0) >= 3
      && Number.isFinite(fiberRatio) && fiberRatio < 0.85) {
    actions.push({
      kind: 'fiber',
      title: 'Close the fiber gap',
      text: `Fiber is ${Math.round((1 - fiberRatio) * 100)}% below your saved minimum. Favor fiber-rich carbohydrate sources rather than chasing a carb/fat split.`,
    });
  }

  if (planDelta !== null && Math.abs(planDelta) > 5) {
    actions.push({
      kind: 'plan',
      title: 'Move toward your own plan',
      text: `Your logged split is ${Math.abs(planDelta)} percentage points more ${planDelta > 0 ? 'carb-led' : 'fat-led'} than your saved plan. Adjust future portions toward your saved gram targets; do not add calories only to change the ratio.`,
    });
  } else if (planDelta !== null) {
    actions.push({
      kind: 'plan-aligned',
      title: 'Your fuel split is on plan',
      text: 'The seven-day carb/fat energy split is within 5 percentage points of your saved plan. This index does not indicate a ratio change.',
    });
  } else if (!configured) {
    actions.push({
      kind: 'setup',
      title: 'Give the ratio a personal destination',
      text: 'Save carbohydrate and fat targets to compare this pattern with your chosen plan. There is no universal overlap target.',
    });
  }

  return {
    configured,
    targetMix,
    planDelta,
    aligned: planDelta !== null && Math.abs(planDelta) <= 5,
    actions: actions.slice(0, 3),
  };
}
