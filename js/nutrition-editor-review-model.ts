// Pure snapshots for editable ingredients and analysis evidence. No DOM or storage access.
import { hasFiniteNumber } from './nutrition-presentation-model.js';
import type { nutritionUsageSummary } from './nutrition-analysis.js';
// Private property readers describe the original operations on opaque stored
// results; they are not validation or canonical producer guarantees.
export interface ReviewComponentReader extends Record<string, unknown> {
  name?: unknown; quantityG?: unknown; confidence?: unknown; portionReviewed?: unknown;
  nutrientsPer100g?: unknown;
  foodData?: { fdcId?: unknown; description?: unknown; dataset?: unknown } | null;
}
export interface ReviewSourceReader {
  kind?: unknown; analysisKind?: unknown; modelDisplay?: unknown; model?: unknown; provider?: unknown; usage?: unknown;
  correction?: unknown;
  aiNutritionEstimate?: { nutrientKeys?: unknown[] | null } | null;
  foodComposition?: { completeNutrientKeys?: unknown[] | null; matchedComponents?: unknown; totalComponents?: unknown } | null;
  review?: { editedNutrients?: unknown[] | null } | null;
}
export interface ReviewResultReader {
  analysis: {
    components?: Array<ReviewComponentReader | null | undefined> | null;
    mealName?: unknown; nutrients?: Record<string, unknown> | null;
    warnings: unknown[]; assumptions?: unknown[] | null;
    label?: { servingSizeText?: unknown; servingsPerContainer?: unknown; consumedAmount?: unknown; consumedUnit?: unknown; labelBasis?: unknown } | null;
  };
  source?: ReviewSourceReader | null;
  images?: Array<{ qualityWarnings?: unknown[] | null } | null | undefined> | null;
  image?: { qualityWarnings?: unknown[] | null } | null;
}

const text = (value: unknown) => value == null ? '' : String(value);
export function projectEditableIngredients(components: unknown) {
  const rows = Array.isArray(components) ? components as ReviewComponentReader[] : [];
  return rows.map(item => ({
    name: text(item.name || ''), quantity: item.quantityG == null ? '' : String(item.quantityG),
    removeLabel: `Remove ${item.name || 'ingredient'}`,
    identity: item.confidence == null ? 'Review identity' : 'Identity estimate',
    portion: hasFiniteNumber(item.quantityG) ? item.portionReviewed ? 'Portion adjusted' : 'Check portion' : 'Portion missing',
    historical: item.foodData?.fdcId ? { description: text(item.foodData.description || 'Saved food-composition record'), dataset: text(item.foodData.dataset || 'Legacy database match') } : null,
  }));
}
export type EditableIngredientView = ReturnType<typeof projectEditableIngredients>[number];
export function projectReviewEvidence(result: ReviewResultReader | null | undefined, usage: ReturnType<typeof nutritionUsageSummary>) {
  const sourceKind = result?.source?.kind;
  const source = sourceKind === 'barcode-database' ? 'Database values'
    : sourceKind === 'ai-label-scan' ? 'Printed label'
    : sourceKind === 'ai-photo-estimate' ? 'Photo estimate'
    : sourceKind === 'reused-meal' ? 'Reviewed meal copy' : 'Manual values';
  const components = result?.analysis?.components || [];
  const knownWeights = components.filter(item => hasFiniteNumber(item!.quantityG)).length;
  const linked = components.filter(item => Object.keys(item!.nutrientsPer100g || {}).length).length;
  const parts = [`${source}`, `${knownWeights}/${components.length || 0} portions quantified`];
  if (linked) parts.push(`${linked}/${components.length} linked to component nutrients`);
  const composition = result?.source?.foodComposition;
  if (sourceKind === 'ai-photo-estimate' && composition?.matchedComponents) {
    parts.push(`historical database provenance retained for ${composition.matchedComponents}/${composition.totalComponents || components.length} ingredients`);
  }
  if (sourceKind === 'ai-photo-estimate') {
    const aiNutrientCount = Array.isArray(result?.source?.aiNutritionEstimate?.nutrientKeys)
      ? result!.source!.aiNutritionEstimate!.nutrientKeys!.length : 0;
    if (aiNutrientCount) parts.push(`${aiNutrientCount} model-estimated nutrients`);
    parts.push('Uncalibrated identity self-check; verify foods');
  }
  const model = result?.source?.modelDisplay || result?.source?.model || 'Selected model';
  const usageLine = sourceKind === 'ai-photo-estimate' || sourceKind === 'ai-label-scan'
    ? usage
      ? `${model} · ${usage.costLabel} · ${usage.totalTokens.toLocaleString()} tokens (${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out)`
      : `${model} · provider did not report token usage`
    : '';
  return { kind: 'evidence' as const, title: sourceKind === 'ai-photo-estimate' ? 'Photo estimate' : 'Nutrition source', parts: parts.join(' · '), usage: usageLine };
}
export function projectReviewChecks(result: ReviewResultReader | null | undefined) {
  const imageWarnings = (result?.images || (result?.image ? [result!.image] : [])).flatMap(image => image?.qualityWarnings || []);
  const assumptions = [...new Set(result?.analysis?.assumptions || [])];
  const warnings = [...new Set([...(result?.analysis?.warnings || []), ...imageWarnings])];
  return { kind: 'checks' as const, assumptions: assumptions.map(text), warnings: warnings.map(text) };
}
export type NutritionEditorFeedbackView = ReturnType<typeof projectReviewEvidence> | ReturnType<typeof projectReviewChecks>
  | { kind: 'correction'; dirty: boolean; reasons: string };
