// Pure meal-detail projection; provenance and domain calculations keep their existing contracts.
import { nutritionUsageSummary } from './nutrition-analysis.js';
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { calculateFuelOverlap } from './nutrition-fuel-mix.js';
import { formatNumber, hasFiniteNumber, mealTypeLabel, mealImages, projectNutritionFuel } from './nutrition-presentation-model.js';
import type { NutritionFuelView } from './nutrition-presentation-model.js';
import type { NutritionRenderMeal, MealSourceReader, MealComponentReader, MealImageReader, DateInput } from './nutrition-render.js';
export interface MealResponseDraft { satiety2h: number | null; energy2h: number | null; }
export interface NutritionMealDetailView {
  id: string; name: string; date: string; origin: string; backLabel: string; metadata: string[]; images: string[];
  overview: { label: string; unit: string; value: string }[]; nutrients: { label: string; unit: string; value: string }[];
  components: { name: string; quantity: string }[]; assumptions: string[]; warnings: string[]; note: string;
  usage: string; review: string; evidence: string[]; fuel: NutritionFuelView | null; response: MealResponseDraft; checkedIn: boolean;
}
export interface NutritionMealDetailActions {
  current(): boolean; save(response: MealResponseDraft | null): Promise<boolean>; failureMessage(): string;
  notify(message: string): void;
}
const text = (value: unknown) => String(value ?? '');
const list = (value: unknown) => (Array.isArray(value) ? value as unknown[] : []).map(text);
function describeMealSource(source: MealSourceReader | null | undefined): string {
  const model = source?.modelDisplay || source?.model || 'AI model';
  const provider = source?.provider ? ` via ${source.provider}` : '';
  switch (source?.kind) {
    case 'ai-label-scan': return `${model} label scan${provider}`;
    case 'ai-photo-estimate': return `${model}${provider}`;
    case 'barcode-database': return `${source.foodData?.sourceName || 'Open Food Facts'} · barcode ${source.foodData?.barcode || ''}`;
    case 'reused-meal': {
      const kind = source.originalSource?.kind;
      const original = kind === 'ai-label-scan' ? 'label scan' : kind === 'ai-photo-estimate' ? 'photo estimate' : kind === 'barcode-database' ? 'barcode database' : 'manual/reviewed values';
      return `Logged again from a reviewed meal · originally ${original}`;
    }
    default: return 'Manual entry';
  }
}
export function projectNutritionMealDetail(meal: NutritionRenderMeal, { returnTo = 'history' }: { returnTo?: unknown } = {}): NutritionMealDetailView {
  const sourceRecord = meal.source as MealSourceReader | null | undefined;
  const eaten = new Date(meal.eatenAt as DateInput);
  const date = Number.isFinite(eaten.getTime()) ? eaten.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) : '';
  const nutrients = meal.nutrients as Record<string, unknown> | null | undefined;
  const nutrientRows = NUTRIENT_DEFINITIONS.flatMap(({ key, label, unit }) => hasFiniteNumber(nutrients?.[key])
    ? [{ label, unit, value: formatNumber(nutrients![key]) }] : []);
  const components = ((meal.components || []) as MealComponentReader[]).map(item => ({ name: text(item.name), quantity: item.quantityG == null ? '—' : `${formatNumber(item.quantityG, 0)} g` }));
  const confidence = meal.confidence == null ? '' : 'Uncalibrated identity self-check';
  const usage = nutritionUsageSummary(sourceRecord);
  const usageModel = sourceRecord?.modelDisplay || sourceRecord?.model || 'Selected model';
  const hasAIUsageSource = sourceRecord?.kind === 'ai-photo-estimate' || sourceRecord?.kind === 'ai-label-scan';
  const usageDetails = usage
    ? `${usageModel} · ${usage.costLabel} · ${usage.totalTokens.toLocaleString()} tokens (${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out)`
    : hasAIUsageSource ? `${usageModel} · token usage was not reported by the provider` : '';
  const source = describeMealSource(sourceRecord);
  const corrected = sourceRecord?.correction?.userProvidedMealName ? 'Identification corrected' : '';
  const mealType = mealTypeLabel(meal.mealType);
  const label = sourceRecord?.label;
  const images = mealImages(meal);
  const editedPortions = Number(sourceRecord?.review?.editedPortions || 0);
  const editedNutrients = Array.isArray(sourceRecord?.review?.editedNutrients) ? (sourceRecord!.review!.editedNutrients as unknown[]).length : 0;
  const editedIdentities = Array.isArray(sourceRecord?.review?.editedComponentIdentities) ? (sourceRecord!.review!.editedComponentIdentities as unknown[]).length : 0;
  const reviewParts = [editedIdentities && `${editedIdentities} ingredient identit${editedIdentities === 1 ? 'y' : 'ies'} corrected`, editedPortions && `${editedPortions} portion${editedPortions === 1 ? '' : 's'} adjusted`, editedNutrients && `${editedNutrients} nutrient value${editedNutrients === 1 ? '' : 's'} adjusted`].filter(Boolean);
  const labelDetails = label ? [label.servingSizeText && `Serving size: ${label.servingSizeText}`, hasFiniteNumber(label.servingsPerContainer) && `${formatNumber(label.servingsPerContainer)} servings/container`, hasFiniteNumber(label.consumedAmount) && `${formatNumber(label.consumedAmount)} ${label.consumedUnit || 'servings'} logged`].filter(Boolean).join(' · ') : '';
  const foodData = sourceRecord?.foodData;
  const foodDataDetails = foodData ? [foodData.schemaVersion != null && `Product schema ${foodData.schemaVersion}`, foodData.productUpdatedAt && `Product updated ${new Date(foodData.productUpdatedAt as DateInput).toLocaleDateString([], { dateStyle: 'medium' })}`, foodData.cacheHit ? 'Loaded from encrypted local cache' : 'Fetched when logged', 'Community database values reviewed by user'].filter(Boolean).join(' · ') : '';
  const foodComposition = sourceRecord?.foodComposition;
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
  const overview = overviewFields.flatMap(([key, label, unit, digits]) => hasFiniteNumber(nutrients?.[key])
    ? [{ label, unit, value: formatNumber(nutrients![key], digits) }] : []);
  const response = (meal.responseCheckIn || {}) as { satiety2h?: unknown; energy2h?: unknown };
  return { id: text(meal.id), name: text(meal.name || 'Meal'), date, origin: text(returnTo), backLabel: returnTo === 'history' ? 'Meals' : 'Meal entry',
    metadata: [mealType, source, confidence, corrected].filter(Boolean),
    images: images.map(image => text((image as MealImageReader).dataUrl || (image as MealImageReader).thumbnailUrl)),
    overview, nutrients: nutrientRows, components, assumptions: list(meal.assumptions), warnings: list(meal.warnings), note: meal.note ? text(meal.note) : '',
    usage: usageDetails, review: reviewParts.join(' · '), evidence: [labelDetails, foodDataDetails, foodCompositionDetails].filter(Boolean),
    fuel: projectNutritionFuel(calculateFuelOverlap(meal.nutrients as Parameters<typeof calculateFuelOverlap>[0]), { scope: 'meal' }),
    response: { satiety2h: hasFiniteNumber(response.satiety2h) ? Number(response.satiety2h) : null, energy2h: hasFiniteNumber(response.energy2h) ? Number(response.energy2h) : null },
    checkedIn: hasFiniteNumber(response.satiety2h) || hasFiniteNumber(response.energy2h) };
}
