// @ts-check

const NON_MICRONUTRIENT_KEYS = new Set([
  'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG',
  'sugarG', 'addedSugarG', 'saturatedFatG', 'transFatG', 'cholesterolMg',
  'omega3G', 'waterG', 'fluidMl', 'plainWaterMl', 'caffeineMg', 'alcoholG',
]);

export function updateFoodCompositionCoverage(result, completeKeys = []) {
  if (!result?.source?.foodComposition) return result;
  const components = result?.analysis?.components || [];
  const keys = [...new Set((Array.isArray(completeKeys) ? completeKeys : []).filter(key => typeof key === 'string'))];
  result.source.foodComposition = {
    ...result.source.foodComposition,
    matchedComponents: components.filter(component => component?.foodData?.fdcId).length,
    totalComponents: components.length,
    completeNutrientKeys: keys,
    completeMicronutrientKeys: keys.filter(key => !NON_MICRONUTRIENT_KEYS.has(key)),
  };
  return result;
}
