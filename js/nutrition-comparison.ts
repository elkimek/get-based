// nutrition-comparison.js — deterministic, device-local scoring for Debug mode meal tests.

import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';

import type { MealPhotoAnalysis } from './nutrition-analysis.js';
import type { MealComponent } from '../types/nutrition-data.js';

export interface MealReferenceInput {
  mealName?: unknown;
  ingredients?: unknown;
  [key: string]: unknown;
}
export interface NormalizedMealReference extends MealReferenceInput {
  mealName: string;
  ingredients: string[];
}
export type MealComparisonAnalysis = { [Field in keyof Pick<MealPhotoAnalysis, 'mealName' | 'components' | 'nutrients'>]?: unknown };
type ComparisonComponent = { [Field in keyof Pick<MealComponent, 'name' | 'quantityG'>]?: unknown };
export interface MealComparisonMetric {
  key: string; label: string; unit: string; expected: number;
  predicted: number | null; errorPercent: number | null; score: number;
}
export interface MealComparisonRun { result?: unknown; [key: string]: unknown }
export type RankedMealComparisonRun<Run extends MealComparisonRun = MealComparisonRun> = Omit<Run, 'originalIndex' | 'evaluation' | 'rank'> & {
  originalIndex: number; evaluation: ReturnType<typeof scoreMealAnalysis> | null; rank: number | null;
};
type ScoredMealComparisonRun = MealComparisonRun & { originalIndex: number; evaluation: ReturnType<typeof scoreMealAnalysis> | null };
export interface MealComparisonRankOptions { excludedIndex?: unknown }

const CORE_COMPARISON_FLOORS: Readonly<Record<string, unknown>> = Object.freeze({
  energyKcal: 50,
  proteinG: 5,
  carbohydrateG: 5,
  fatG: 5,
});

function comparisonFloor(field: typeof NUTRIENT_DEFINITIONS[number]) {
  if (CORE_COMPARISON_FLOORS[field.key]) return CORE_COMPARISON_FLOORS[field.key];
  const stepFloor = Math.max(0, Number(field.step) || 0) * 10;
  if (field.unit === 'kcal') return Math.max(50, stepFloor);
  if (field.unit === 'mL') return Math.max(20, stepFloor);
  if (field.unit === 'g') return Math.max(1, stepFloor);
  if (field.unit === 'mg') return Math.max(5, stepFloor);
  return Math.max(1, stepFloor);
}

const SCORE_FIELDS = Object.freeze([
  Object.freeze(['totalWeightG', 'Total amount', 'g', 20, '1', 'amount'] as const),
  ...NUTRIENT_DEFINITIONS.map(field => Object.freeze([
    field.key, field.label, field.unit, comparisonFloor(field), field.step, field.group,
  ] as const)),
]);

export type MealComparisonReferenceField = typeof SCORE_FIELDS[number];

const IDENTITY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'dish', 'food', 'fresh', 'in', 'meal', 'of', 'plate', 'the', 'with',
]);

function finiteNonNegative(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function identityTokens(value: unknown) {
  return new Set(String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 1 && !IDENTITY_STOP_WORDS.has(token)));
}

function diceSimilarity(first: unknown, second: unknown) {
  const left = identityTokens(first);
  const right = identityTokens(second);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

export function parseReferenceIngredients(value: unknown) {
  return [...new Set(String(value || '')
    .split(/[\n,;]+/)
    .map(item => item.trim().replace(/\s+/g, ' ').slice(0, 120))
    .filter(Boolean))]
    .slice(0, 24);
}

export function normalizeMealReference(reference: MealReferenceInput | null = {}) {
  const normalized: NormalizedMealReference = {
    mealName: String(reference?.mealName || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    ingredients: Array.isArray(reference?.ingredients)
      ? (reference.ingredients as unknown[]).map(item => String(item || '').trim()).filter(Boolean).slice(0, 24)
      : parseReferenceIngredients(reference?.ingredients),
  };
  for (const [key] of SCORE_FIELDS) {
    const number = finiteNonNegative(reference?.[key]);
    if (number !== null) normalized[key] = number;
  }
  return normalized;
}

function predictedTotalWeight(analysis: MealComparisonAnalysis | null | undefined) {
  const quantities = ((analysis?.components || []) as Array<ComparisonComponent | null | undefined>)
    .map(item => finiteNonNegative(item?.quantityG))
    .filter(value => value !== null);
  return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null;
}

function ingredientScore(analysis: MealComparisonAnalysis | null | undefined, reference: NormalizedMealReference) {
  const expectedIngredients = (reference.ingredients || []).filter(Boolean);
  const predictedIngredients = ((analysis?.components || []) as Array<ComparisonComponent | null | undefined>).map(item => item?.name).filter(Boolean);
  if (!expectedIngredients.length) {
    return reference.mealName ? diceSimilarity(reference.mealName, analysis?.mealName) * 100 : null;
  }
  if (!predictedIngredients.length) return 0;
  const recall = expectedIngredients.reduce((sum, item) => {
    return sum + Math.max(...predictedIngredients.map(candidate => diceSimilarity(item, candidate)));
  }, 0) / expectedIngredients.length;
  const precision = predictedIngredients.reduce<number>((sum, item) => {
    return sum + Math.max(...expectedIngredients.map(candidate => diceSimilarity(item, candidate)));
  }, 0) / predictedIngredients.length;
  return (precision + recall) ? (2 * precision * recall) / (precision + recall) * 100 : 0;
}

function numericScore(analysis: MealComparisonAnalysis | null | undefined, reference: NormalizedMealReference) {
  const metrics: MealComparisonMetric[] = [];
  for (const [key, label, unit, floor] of SCORE_FIELDS) {
    const expected = finiteNonNegative(reference[key]);
    if (expected === null) continue;
    const predicted = key === 'totalWeightG'
      ? predictedTotalWeight(analysis)
      : finiteNonNegative((analysis?.nutrients as Record<string, unknown> | null | undefined)?.[key]);
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

export function scoreMealAnalysis(analysis: MealComparisonAnalysis | null | undefined, rawReference: MealReferenceInput | null = {}) {
  const reference = normalizeMealReference(rawReference);
  const numeric = numericScore(analysis, reference);
  const identity = ingredientScore(analysis, reference);
  const categories: Array<{score: number; weight: number}> = [];
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

export function rankMealComparisonRuns<Runs extends readonly MealComparisonRun[]>(runs: Runs, reference?: MealReferenceInput | null, options?: MealComparisonRankOptions): RankedMealComparisonRun<Runs[number]>[];
export function rankMealComparisonRuns(runs: unknown, reference?: MealReferenceInput | null, options?: MealComparisonRankOptions): RankedMealComparisonRun[];
export function rankMealComparisonRuns(runs: unknown, reference: MealReferenceInput | null = {}, { excludedIndex = null }: MealComparisonRankOptions = {}) {
  const scored = (Array.isArray(runs) ? runs as Array<MealComparisonRun | null | undefined> : []).map((run, originalIndex) => ({
    ...run,
    originalIndex,
    evaluation: (run?.result as {analysis?: MealComparisonAnalysis | null} | null | undefined)?.analysis ? scoreMealAnalysis((run!.result as {analysis: MealComparisonAnalysis}).analysis, reference) : null,
  }));
  const competitiveScore = (run: ScoredMealComparisonRun) => run.originalIndex === excludedIndex ? null : run.evaluation?.score;
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
  let previousScore: number | null | undefined = null;
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
