// @ts-check
// Small always-available state boundary; the matcher and its data stay lazy.

export { updateFoodCompositionCoverage } from './nutrition-food-composition-metadata.js';

export async function enrichFreshPhotoAnalysis(result, analysisKind, onMatching = () => {}) {
  if (analysisKind !== 'meal-photo') return result;
  onMatching();
  try {
    const { enrichPhotoAnalysisWithFoodComposition } = await import('./nutrition-food-composition.js');
    return await enrichPhotoAnalysisWithFoodComposition(result);
  } catch { return result; }
}

export async function reviewFoodCompositionCandidate(result, index, fdcId) {
  const { applyFoodCompositionCandidate, loadFoodCompositionPack } = await import('./nutrition-food-composition.js');
  return applyFoodCompositionCandidate(result, index, fdcId, await loadFoodCompositionPack(), true);
}

export function persistedFoodCompositionComponents(components) {
  return (Array.isArray(components) ? components : []).map(component => {
    const persisted = { ...component };
    for (const key of ['foodDataCandidates', 'foodCompositionAttempted', 'visualNutrients', 'visualNutrientsPer100g']) delete persisted[key];
    if (persisted.foodData?.fdcId) persisted.foodData = { ...persisted.foodData, reviewed: true };
    return persisted;
  });
}

export function foodCompositionPhotoAllowlist(source, reviewedKeys = [], photoKeys = []) {
  const compositionKeys = Array.isArray(source?.foodComposition?.completeNutrientKeys)
    ? source.foodComposition.completeNutrientKeys : [];
  return new Set([...photoKeys, ...compositionKeys, ...reviewedKeys]);
}

export function foodCompositionNutrientBasis(source) {
  return Number(source?.foodComposition?.matchedComponents || 0) > 0
    ? 'visual-identity-plus-food-composition' : 'visual-core-plus-user-edits';
}
