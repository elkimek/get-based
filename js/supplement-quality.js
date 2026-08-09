// @ts-check
// Quality-test display and conservative cross-product contaminant aggregation.

const MASS_TO_MCG = new Map([
  ['mcg', 1], ['µg', 1], ['μg', 1], ['ug', 1],
  ['mg', 1000], ['g', 1_000_000],
]);

/** @param {unknown} value */
function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/** @param {unknown} value */
export function supplementQualityKey(value) {
  return clean(value)
    .normalize('NFKD')
    .replace(/([\p{Script=Latin}])\p{M}+/gu, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .normalize('NFC');
}

/**
 * A passing potency row commonly repeats an active Supplement Facts row. Keep
 * the source result stored, but treat it as verification rather than a second
 * health exposure unless the user explicitly opts it into AI context.
 * @param {any} test
 * @param {any} supplement
 */
export function isActiveIngredientPotencyTest(test, supplement) {
  if (test?.category !== 'potency') return false;
  const testKeys = [test?.analyte, test?.canonicalAnalyte].map(supplementQualityKey).filter(Boolean);
  const ingredientKeys = (Array.isArray(supplement?.ingredients) ? supplement.ingredients : [])
    .map(ingredient => supplementQualityKey(ingredient?.name)).filter(Boolean);
  return testKeys.some(testKey => ingredientKeys.some(ingredientKey => {
    if (testKey === ingredientKey) return true;
    const shorterLength = Math.min([...testKey].length, [...ingredientKey].length);
    return shorterLength >= 5 && (testKey.includes(ingredientKey) || ingredientKey.includes(testKey));
  }));
}

/** @param {any} test @param {any} supplement */
export function isInformationalActiveIngredientPotencyTest(test, supplement) {
  return isActiveIngredientPotencyTest(test, supplement)
    && clean(test?.status).toLowerCase() !== 'fail';
}

/** @param {any} test @param {any} supplement */
export function isSupplementQualityIncludedInAI(test, supplement) {
  if (typeof test?.includeInAIContext === 'boolean') return test.includeInAIContext;
  return !isInformationalActiveIngredientPotencyTest(test, supplement);
}

/** @param {any} supplement */
export function supplementQualityEvidenceScope(supplement) {
  const scope = clean(supplement?.qualityEvidenceScope);
  if (['matching-lot', 'different-lot', 'general-specification'].includes(scope)) return scope;
  return 'unknown';
}

/** @param {any} test */
export function formatSupplementQualityResult(test) {
  let result = clean(test?.resultText)
    || (Number.isFinite(Number(test?.value)) ? `${test?.comparator || ''}${test.value}${test?.unit ? ` ${test.unit}` : ''}` : '')
    || clean(test?.status)
    || 'Result not reported';
  const unit = clean(test?.unit);
  const basis = clean(test?.basis);
  const resultHasNumber = /\d/u.test(result);
  const resultHasUnit = unit && result.toLowerCase().includes(unit.toLowerCase());
  if (resultHasNumber && unit && !resultHasUnit) result += ` ${unit}`;
  const detail = !resultHasNumber && unit && basis ? `${unit} ${basis}` : basis || (!resultHasNumber ? unit : '');
  return `${result}${detail ? ` · ${detail}` : ''}`;
}

/** @param {number} mcg */
export function formatContaminantMass(mcg) {
  if (!Number.isFinite(mcg)) return '';
  if (Math.abs(mcg) >= 1000) return `${Number((mcg / 1000).toPrecision(4))} mg/day`;
  return `${Number(mcg.toPrecision(4))} mcg/day`;
}

/**
 * Return a daily mass only when the source result is a compatible mass per
 * serving/unit and the user supplied a personal daily frequency. ND/NQ,
 * concentrations, PRN use, and missing schedules intentionally remain null.
 * @param {any} test
 * @param {any} supplement
 */
export function contaminantDailyMass(test, supplement) {
  if (test?.category !== 'contaminant') return null;
  if (supplementQualityEvidenceScope(supplement) !== 'matching-lot') return null;
  const status = clean(test.status).toLowerCase();
  if (['not-detected', 'not-quantified', 'negative', 'unknown'].includes(status)) return null;
  const value = Number(test.value);
  const factor = MASS_TO_MCG.get(clean(test.unit).toLowerCase());
  const timesPerDay = Number(supplement?.timesPerDay ?? supplement?.schedule?.timesPerDay);
  if (!Number.isFinite(value) || value < 0 || !factor || !Number.isFinite(timesPerDay) || timesPerDay <= 0) return null;
  if (supplement?.schedule?.mode === 'prn') return null;

  const basis = clean(test.basis).toLowerCase();
  let dailyMultiplier = null;
  if (/\bper\s+serving\b/u.test(basis)) {
    dailyMultiplier = timesPerDay;
  } else if (/\bper\s+(?:capsule|tablet|softgel|drop|scoop|spray|patch)\b/u.test(basis)) {
    const servingValue = Number(supplement?.servingSize?.value);
    const servingUnit = clean(supplement?.servingSize?.unit).toLowerCase();
    const basisUnit = basis.match(/\bper\s+(capsule|tablet|softgel|drop|scoop|spray|patch)\b/u)?.[1] || '';
    if (!Number.isFinite(servingValue) || servingValue <= 0 || !servingUnit || !basisUnit
        || (basisUnit === 'softgel' ? 'capsule' : basisUnit) !== (servingUnit === 'softgel' ? 'capsule' : servingUnit)) return null;
    dailyMultiplier = servingValue * timesPerDay;
  }
  if (dailyMultiplier == null) return null;
  const comparator = clean(test.comparator) || clean(test.resultText).match(/^(≤|<=|<|>=|>|=)/u)?.[1] || '';
  return {
    mcgPerDay: value * factor * dailyMultiplier,
    upperBound: comparator === '<' || comparator === '<=' || comparator === '≤',
  };
}

/**
 * Group source-reported contaminant tests across the supplied products.
 * @param {any[]} supplements
 */
export function aggregateSupplementContaminants(supplements) {
  const groups = new Map();
  for (const supplement of Array.isArray(supplements) ? supplements : []) {
    for (const test of Array.isArray(supplement?.qualityTests) ? supplement.qualityTests : []) {
      if (test?.category !== 'contaminant' || !clean(test.analyte)) continue;
      const canonicalAnalyte = clean(test.canonicalAnalyte) || clean(test.analyte);
      const key = supplementQualityKey(canonicalAnalyte);
      if (!groups.has(key)) groups.set(key, { analyte: canonicalAnalyte, entries: [], exactMcgPerDay: 0, upperMcgPerDay: 0 });
      const group = groups.get(key);
      const daily = contaminantDailyMass(test, supplement);
      group.entries.push({ product: supplement.name || 'Unnamed product', test, daily });
      if (daily?.upperBound) group.upperMcgPerDay += daily.mcgPerDay;
      else if (daily) group.exactMcgPerDay += daily.mcgPerDay;
    }
  }
  return Array.from(groups.values()).map(group => ({
    ...group,
    summableCount: group.entries.filter(entry => entry.daily).length,
    reportedCount: group.entries.length,
  }));
}
