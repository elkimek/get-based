import { describe, expect, it } from 'vitest';

import {
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
