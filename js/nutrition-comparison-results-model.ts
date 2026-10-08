// Pure benchmark projection: scoring and provider usage remain domain services.
import { nutritionUsageSummary } from './nutrition-analysis.js';
import { rankMealComparisonRuns } from './nutrition-comparison.js';
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { formatNumber, hasFiniteNumber } from './nutrition-presentation-model.js';
import type { MealPhotoAnalysis, analyzeMealPhoto } from './nutrition-analysis.js';
import type { NutritionAIRoute } from './nutrition-ai-settings.js';
import type { MealComponent } from '../types/nutrition-data.js';
import type { MealReferenceInput, MealComparisonMetric } from './nutrition-comparison.js';

// The controller rebuilds route labels, status, errors and elapsed time. Restored
// result metadata is a structural view reader with opaque nutrient/name values.
export type ComparisonComponentView = { [Field in keyof Pick<MealComponent, 'name' | 'quantityG'>]?: unknown };
export type ComparisonAnalysisView = { [Field in keyof Pick<MealPhotoAnalysis, 'mealName'>]?: unknown } & {
  components?: ComparisonComponentView[] | null;
  nutrients?: Record<string, unknown> | null; warnings?: Iterable<unknown> | null; assumptions?: Iterable<unknown> | null;
}
export type ComparisonResultView = { [Field in keyof Pick<Awaited<ReturnType<typeof analyzeMealPhoto>>, 'analysis'>]: ComparisonAnalysisView } & { source?: Parameters<typeof nutritionUsageSummary>[0] };
export type ComparisonRunView = {
  providerLabel: string; modelLabel: string; status: string; durationMs: number;
  result?: ComparisonResultView | null; error?: string; route?: NutritionAIRoute;
}
export type ComparisonReferenceView = MealReferenceInput | Partial<Pick<MealReferenceInput, 'mealName' | 'ingredients' | 'totalWeightG' | 'energyKcal' | 'proteinG' | 'carbohydrateG' | 'fatG'>>;
export interface NutritionComparisonResultsOptions {
  runs?: readonly ComparisonRunView[]; reference?: ComparisonReferenceView; referenceRun?: ComparisonRunView | null;
  referenceRunIndex?: unknown; isRestored?: unknown;
}
export function comparisonTotalWeight(analysis: {components?: readonly (ComparisonComponentView | null | undefined)[] | null} | null | undefined) {
  const quantities = (analysis?.components || []).map(item => Number(item?.quantityG)).filter(Number.isFinite);
  return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null;
}

export type ComparisonTone = '' | 'is-reference' | 'is-close' | 'is-far' | 'is-missing';
export interface ComparisonDifference { label: string; tone: ComparisonTone }
export interface ComparisonTableRow { label: string; predicted: string; expected: string; difference: ComparisonDifference }
export interface NutritionComparisonCardView {
  index: number; provider: string; model: string; duration: string; status: string; error: string; restored: boolean;
  successful: boolean; baseline: boolean; best: boolean; title: string; scoreLabel: string; rankLabel: string;
  scored: boolean; numericScore: string; identityScore: string; scoredValues: string;
  cost: string; tokens: string; usageKnown: boolean; mealName: string;
  metrics: { label: string; value: string; difference: ComparisonDifference }[];
  detailed: ComparisonTableRow[]; detailedCount: string; differences: ComparisonTableRow[];
  ingredients: string[]; ingredientCount: string; checks: string[];
}
export interface NutritionComparisonResultsView {
  baseline: string; hasBaseline: boolean; manualReference: boolean; referenceHeading: string; cards: NutritionComparisonCardView[];
}
function relativeDifference(value: unknown, reference: unknown) {
  if (!hasFiniteNumber(value) || !hasFiniteNumber(reference)) return null;
  const expected = Number(reference), predicted = Number(value);
  if (expected === 0) return predicted === 0 ? 0 : null;
  return (predicted - expected) / Math.abs(expected) * 100;
}
const PRIMARY = new Set(['energyKcal', 'proteinG', 'carbohydrateG', 'fatG']);
const DETAILED = NUTRIENT_DEFINITIONS.filter(field => !PRIMARY.has(field.key));
const DEFINITIONS = new Map(NUTRIENT_DEFINITIONS.map(field => [field.key, field]));
function digits(step: unknown) {
  const match = String(step || '').match(/\.(\d+)/);
  return match ? Math.min(2, match[1]!.length) : 0;
}
function difference(value: unknown, expected: unknown, baseline = false): ComparisonDifference {
  if (baseline && hasFiniteNumber(value)) return { label: 'Reference', tone: 'is-reference' };
  const delta = relativeDifference(value, expected);
  if (delta === null) return { label: '—', tone: '' };
  if (Math.abs(delta) < 0.05) return { label: 'Same', tone: 'is-close' };
  return { label: `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta), 1)}%`, tone: Math.abs(delta) <= 10 ? 'is-close' : Math.abs(delta) >= 30 ? 'is-far' : '' };
}
function valueLabel(value: unknown, unit: string, precision: number) {
  return hasFiniteNumber(value) ? `${formatNumber(value, precision)} ${unit}` : '—';
}
function referenceRow(metric: MealComparisonMetric): ComparisonTableRow {
  const delta = metric.predicted == null ? null : relativeDifference(metric.predicted, metric.expected);
  const definition = DEFINITIONS.get(metric.key), precision = definition ? digits(definition.step) : 0;
  return { label: metric.label, predicted: metric.predicted == null ? 'Missing' : `${formatNumber(metric.predicted, precision)} ${metric.unit}`,
    expected: `${formatNumber(metric.expected, precision)} ${metric.unit}`, difference: {
      label: delta === null ? 'Missing estimate' : Math.abs(delta) < 0.05 ? 'Same' : `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta), 1)}%`,
      tone: delta === null ? 'is-missing' : Math.abs(delta) <= 10 ? 'is-close' : Math.abs(delta) >= 30 ? 'is-far' : '',
    } };
}
export function projectNutritionComparisonResults({ runs = [], reference = {}, referenceRun = null, referenceRunIndex = null, isRestored = false }: NutritionComparisonResultsOptions = {}): NutritionComparisonResultsView {
  const ranked = rankMealComparisonRuns(runs, reference as MealReferenceInput, { excludedIndex: referenceRunIndex });
  const expected = reference as MealReferenceInput;
  return { baseline: referenceRun ? String(referenceRun.modelLabel) : '', hasBaseline: Boolean(referenceRun), manualReference: !referenceRun && ranked.some(run => run.evaluation?.hasReference), referenceHeading: referenceRun ? 'Baseline' : 'Known value',
    cards: ranked.map(run => {
      const analysis = run.result?.analysis, baseline = run.originalIndex === referenceRunIndex, score = run.evaluation?.score;
      const usage = run.result ? nutritionUsageSummary(run.result.source) : null;
      const components = Array.isArray(analysis?.components) ? analysis.components : [];
      const ingredients = components.slice(0, 6).map(item => `${item.name}${hasFiniteNumber(item.quantityG) ? ` · ${formatNumber(item.quantityG, 0)} g` : ''}`);
      const detailed = DETAILED.flatMap(field => {
        const predicted = analysis?.nutrients?.[field.key], known = expected[field.key];
        return !hasFiniteNumber(predicted) && !hasFiniteNumber(known) ? [] : [{ label: field.label, predicted: valueLabel(predicted, field.unit, digits(field.step)), expected: valueLabel(known, field.unit, digits(field.step)), difference: difference(predicted, known, baseline) }];
      });
      const returned = DETAILED.filter(field => hasFiniteNumber(analysis?.nutrients?.[field.key])).length;
      const compared = DETAILED.filter(field => hasFiniteNumber(expected[field.key])).length;
      const count = run.evaluation?.metrics?.length || 0;
      const metricFields = [
        ['Amount', comparisonTotalWeight(analysis), 'g', 0, expected.totalWeightG],
        ['Energy', analysis?.nutrients?.energyKcal, 'kcal', 0, expected.energyKcal],
        ['Protein', analysis?.nutrients?.proteinG, 'g', 1, expected.proteinG],
        ['Carbs', analysis?.nutrients?.carbohydrateG, 'g', 1, expected.carbohydrateG],
        ['Fat', analysis?.nutrients?.fatG, 'g', 1, expected.fatG],
      ] as const;
      return { index: run.originalIndex, provider: String(run.providerLabel), model: String(run.modelLabel), duration: formatNumber(run.durationMs / 1000, 1), status: run.status,
        error: run.error || (run.status === 'cancelled' ? 'Canceled by user.' : 'No usable estimate returned.'), restored: Boolean(isRestored), successful: Boolean(run.result), baseline, best: run.rank === 1 && !baseline,
        title: baseline ? 'Baseline' : score == null ? 'Not ranked' : formatNumber(score, 1),
        scoreLabel: baseline ? 'Selected model' : score == null ? 'Add known values' : `${referenceRun ? 'Baseline' : 'Known-value'} agreement / 100`,
        rankLabel: score == null || baseline ? '' : run.rank === 1 ? `Closest to ${referenceRun ? 'baseline' : 'known values'}` : `Rank #${run.rank}`,
        scored: score != null, numericScore: formatNumber(run.evaluation?.numericScore, 1), identityScore: formatNumber(run.evaluation?.identityScore, 1), scoredValues: `${count} value${count === 1 ? '' : 's'}`,
        cost: usage?.costLabel || 'Cost unknown', tokens: usage ? `${usage.totalTokens.toLocaleString()} tokens · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out` : '', usageKnown: Boolean(usage), mealName: String(analysis?.mealName || 'Meal'),
        metrics: metricFields.map(([label, value, unit, precision, known]) => ({ label, value: valueLabel(value, unit, precision), difference: difference(value, known, baseline) })),
        detailed, detailedCount: `${returned} returned${compared ? ` · ${compared} compared` : ''}`, differences: (run.evaluation?.metrics || []).map(referenceRow), ingredients,
        ingredientCount: components.length > ingredients.length ? `${ingredients.length} of ${components.length} shown` : `${ingredients.length} returned`,
        checks: [...new Set([...(analysis?.warnings || []), ...(analysis?.assumptions || [])])].slice(0, 8).map(item => item == null ? '' : String(item)),
      };
    }) };
}
