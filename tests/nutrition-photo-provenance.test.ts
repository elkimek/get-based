import { describe, expect, it } from 'vitest';

import {
  preserveMealSourceExtensions,
  persistedNutritionComponents,
  photoEstimateNutrientAllowlist,
  photoEstimateNutrientBasis,
} from '../js/nutrition-photo-provenance.js';

describe('AI meal-photo provenance', () => {
  it('persists model and reviewed nutrients without requiring database coverage', () => {
    const allowed = photoEstimateNutrientAllowlist({
      aiNutritionEstimate: { nutrientKeys: ['sodiumMg', 'vitaminDMcg'] },
    }, ['seleniumMcg'], ['energyKcal']);

    expect([...allowed]).toEqual(['energyKcal', 'sodiumMg', 'vitaminDMcg', 'seleniumMcg']);
  });

  it('uses the model as the primary nutrient basis while recognizing historical meals', () => {
    expect(photoEstimateNutrientBasis({
      aiNutritionEstimate: { nutrientKeys: ['energyKcal', 'potassiumMg'] },
      foodComposition: { matchedComponents: 2 },
    })).toBe('model-estimated-from-food-identity-and-portions');
    expect(photoEstimateNutrientBasis({ foodComposition: { matchedComponents: 2 } }))
      .toBe('legacy-food-composition');
  });

  it('strips obsolete transient matcher state but retains historical saved metadata', () => {
    const [component] = persistedNutritionComponents([{
      name: 'Rice',
      foodDataCandidates: [{ fdcId: 1 }],
      foodCompositionAttempted: true,
      visualNutrients: { energyKcal: 200 },
      foodData: { fdcId: 1, dataset: 'Historical dataset' },
    }]);

    expect(component).toMatchObject({ name: 'Rice', foodData: { fdcId: 1, dataset: 'Historical dataset' } });
    expect(component).not.toHaveProperty('foodDataCandidates');
    expect(component).not.toHaveProperty('foodCompositionAttempted');
    expect(component).not.toHaveProperty('visualNutrients');
  });
});


describe('replacement native meal provenance', () => {
  it('keeps portable extensions and prior correction history while replacing stale analysis facts', () => {
    const previous = { kind: 'ai-label-scan', provider: 'old', model: 'old-model', usage: { cost: 2 }, recordedAt: 'old',
      label: { calories: 20 }, foodData: { barcode: 'old' }, foodComposition: { matchedComponents: 1 },
      correction: { previousMealName: 'old' }, aiNutritionEstimate: { nutrientKeys: ['sodiumMg'] },
      nutrientBasis: 'user-corrected-analysis-invalidated', opaqueSourceMetadata: { retained: true },
      review: { analysisInvalidated: true, editedNutrients: ['sodiumMg'], calculatedNutrients: ['proteinG'],
        editedPortions: 2, privateReview: 'retain', originalAnalysis: { name: 'Previous correction history' } } };
    const current = { kind: 'ai-photo-estimate', provider: 'venice', model: 'native-vision', analyzedAt: 'new',
      aiNutritionEstimate: { nutrientKeys: ['proteinG'] }, review: { userContext: 'new context' } };
    const before = structuredClone(previous);
    const result = preserveMealSourceExtensions<Record<string, unknown> & { review?: Record<string, unknown> }>(previous, current);
    expect(result).toEqual({ ...current, opaqueSourceMetadata: { retained: true }, review: {
      userContext: 'new context', privateReview: 'retain', originalAnalysis: { name: 'Previous correction history' } } });
    expect(previous).toEqual(before);
  });
  it('retains current native review fields when no replacement analysis was requested', () => {
    const current = { kind: 'manual', review: { analysisInvalidated: true, editedNutrients: ['energyKcal'], privateReview: 'keep' } };
    expect(preserveMealSourceExtensions(current, current)).toEqual(current);
  });
});
