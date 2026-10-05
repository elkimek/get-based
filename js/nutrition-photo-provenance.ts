interface NutritionPhotoSource {
  aiNutritionEstimate?: { nutrientKeys?: unknown } | null;
  foodComposition?: { completeNutrientKeys?: unknown; matchedComponents?: unknown } | null;
}

// nutrition-photo-provenance.js — AI-photo nutrient persistence boundaries.

/** Remove editor-only composition state after the original shallow copy. */
export function persistedNutritionComponent(component: unknown): Record<string, unknown> {
  const persisted = { ...component as Record<string, unknown> };
  delete persisted.foodDataCandidates;
  delete persisted.foodCompositionAttempted;
  delete persisted.visualNutrients;
  delete persisted.visualNutrientsPer100g;
  return persisted;
}

export function persistedNutritionComponents(components: unknown) {
  return (Array.isArray(components) ? components as unknown[] : []).map(persistedNutritionComponent);
}

export function photoEstimateNutrientAllowlist(source: NutritionPhotoSource | null | undefined, reviewedKeys: readonly unknown[] = [], photoKeys: readonly unknown[] = []) {
  const aiEstimatedKeys = Array.isArray(source?.aiNutritionEstimate?.nutrientKeys)
    ? source.aiNutritionEstimate!.nutrientKeys as unknown[] : [];
  const legacyCompositionKeys = Array.isArray(source?.foodComposition?.completeNutrientKeys)
    ? source.foodComposition!.completeNutrientKeys as unknown[] : [];
  return new Set([...photoKeys, ...aiEstimatedKeys, ...legacyCompositionKeys, ...reviewedKeys]);
}

export function photoEstimateNutrientBasis(source: NutritionPhotoSource | null | undefined) {
  if (Array.isArray(source?.aiNutritionEstimate?.nutrientKeys) && (source.aiNutritionEstimate!.nutrientKeys as unknown[]).length) {
    return 'model-estimated-from-food-identity-and-portions';
  }
  if (Number(source?.foodComposition?.matchedComponents || 0) > 0) return 'legacy-food-composition';
  return 'visual-core-plus-user-edits';
}
