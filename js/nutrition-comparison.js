// @ts-check
// nutrition-comparison.js — deterministic, device-local scoring for Debug mode meal tests.

const SCORE_FIELDS = Object.freeze([
  ['totalWeightG', 'Total amount', 'g', 20],
  ['energyKcal', 'Energy', 'kcal', 50],
  ['proteinG', 'Protein', 'g', 5],
  ['carbohydrateG', 'Carbohydrate', 'g', 5],
  ['fatG', 'Fat', 'g', 5],
]);

const IDENTITY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'dish', 'food', 'fresh', 'in', 'meal', 'of', 'plate', 'the', 'with',
]);

function finiteNonNegative(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function identityTokens(value) {
  return new Set(String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 1 && !IDENTITY_STOP_WORDS.has(token)));
}

function diceSimilarity(first, second) {
  const left = identityTokens(first);
  const right = identityTokens(second);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

export function parseReferenceIngredients(value) {
  return [...new Set(String(value || '')
    .split(/[\n,;]+/)
    .map(item => item.trim().replace(/\s+/g, ' ').slice(0, 120))
    .filter(Boolean))]
    .slice(0, 24);
}

export function normalizeMealReference(reference = {}) {
  const normalized = {
    mealName: String(reference?.mealName || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    ingredients: Array.isArray(reference?.ingredients)
      ? reference.ingredients.map(item => String(item || '').trim()).filter(Boolean).slice(0, 24)
      : parseReferenceIngredients(reference?.ingredients),
  };
  for (const [key] of SCORE_FIELDS) {
    const number = finiteNonNegative(reference?.[key]);
    if (number !== null) normalized[key] = number;
  }
  return normalized;
}

function predictedTotalWeight(analysis) {
  const quantities = (analysis?.components || [])
    .map(item => finiteNonNegative(item?.quantityG))
    .filter(value => value !== null);
  return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null;
}

function ingredientScore(analysis, reference) {
  const expectedIngredients = (reference.ingredients || []).filter(Boolean);
  const predictedIngredients = (analysis?.components || []).map(item => item?.name).filter(Boolean);
  if (!expectedIngredients.length) {
    return reference.mealName ? diceSimilarity(reference.mealName, analysis?.mealName) * 100 : null;
  }
  if (!predictedIngredients.length) return 0;
  const recall = expectedIngredients.reduce((sum, item) => {
    return sum + Math.max(...predictedIngredients.map(candidate => diceSimilarity(item, candidate)));
  }, 0) / expectedIngredients.length;
  const precision = predictedIngredients.reduce((sum, item) => {
    return sum + Math.max(...expectedIngredients.map(candidate => diceSimilarity(item, candidate)));
  }, 0) / predictedIngredients.length;
  return (precision + recall) ? (2 * precision * recall) / (precision + recall) * 100 : 0;
}

function numericScore(analysis, reference) {
  const metrics = [];
  for (const [key, label, unit, floor] of SCORE_FIELDS) {
    const expected = finiteNonNegative(reference[key]);
    if (expected === null) continue;
    const predicted = key === 'totalWeightG'
      ? predictedTotalWeight(analysis)
      : finiteNonNegative(analysis?.nutrients?.[key]);
    if (predicted === null) {
      metrics.push({ key, label, unit, expected, predicted: null, errorPercent: null, score: 0 });
      continue;
    }
    const errorPercent = Math.abs(predicted - expected) / Math.max(expected, Number(floor)) * 100;
    metrics.push({
      key, label, unit, expected, predicted,
      errorPercent,
      score: Math.max(0, 100 - errorPercent),
    });
  }
  return {
    metrics,
    score: metrics.length ? metrics.reduce((sum, item) => sum + item.score, 0) / metrics.length : null,
  };
}

export function scoreMealAnalysis(analysis, rawReference = {}) {
  const reference = normalizeMealReference(rawReference);
  const numeric = numericScore(analysis, reference);
  const identity = ingredientScore(analysis, reference);
  /** @type {Array<{score: number, weight: number}>} */
  const categories = [];
  if (numeric.score !== null) categories.push({ score: numeric.score, weight: 0.7 });
  if (identity !== null) categories.push({ score: identity, weight: 0.3 });
  const totalWeight = categories.reduce((sum, item) => sum + item.weight, 0);
  const score = totalWeight
    ? categories.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
    : null;
  return {
    score: score === null ? null : Math.round(score * 10) / 10,
    identityScore: identity === null ? null : Math.round(identity * 10) / 10,
    numericScore: numeric.score === null ? null : Math.round(numeric.score * 10) / 10,
    metrics: numeric.metrics,
    hasReference: categories.length > 0,
  };
}

export function rankMealComparisonRuns(runs, reference = {}, { excludedIndex = null } = {}) {
  const scored = (Array.isArray(runs) ? runs : []).map((run, originalIndex) => ({
    ...run,
    originalIndex,
    evaluation: run?.result?.analysis ? scoreMealAnalysis(run.result.analysis, reference) : null,
  }));
  const competitiveScore = run => run.originalIndex === excludedIndex ? null : run.evaluation?.score;
  scored.sort((first, second) => {
    if (!first.result && second.result) return 1;
    if (first.result && !second.result) return -1;
    const firstScore = competitiveScore(first);
    const secondScore = competitiveScore(second);
    if (firstScore == null && secondScore != null) return 1;
    if (firstScore != null && secondScore == null) return -1;
    if (firstScore != null && secondScore != null && firstScore !== secondScore) return secondScore - firstScore;
    return first.originalIndex - second.originalIndex;
  });
  let rank = 0;
  let scoredPosition = 0;
  let previousScore = null;
  return scored.map(run => {
    const score = competitiveScore(run);
    if (score == null) return { ...run, rank: null };
    scoredPosition += 1;
    if (score !== previousScore) rank = scoredPosition;
    previousScore = score;
    return { ...run, rank };
  });
}

export { SCORE_FIELDS as MEAL_COMPARISON_REFERENCE_FIELDS };
