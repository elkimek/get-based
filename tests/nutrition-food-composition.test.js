import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  applyFoodCompositionCandidate,
  enrichPhotoAnalysisWithFoodComposition,
  matchFoodCompositionCandidates,
} from '../js/nutrition-food-composition.js';
import { normalizeNutritionComponent } from '../js/nutrition-food-data.js';

const nutrientKeys = [
  'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG',
  'sugarG', 'saturatedFatG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg',
];

function values(nutrients) {
  return nutrientKeys.map(key => Object.hasOwn(nutrients, key) ? nutrients[key] : null);
}

const pack = {
  schemaVersion: 1,
  source: { name: 'USDA FoodData Central', dataset: 'FNDDS 2021-2023', published: '2024-10-31' },
  nutrientKeys,
  foods: [
    [101, '24122140', 'Chicken breast, grilled without sauce, skin not eaten', values({
      energyKcal: 165, proteinG: 31, carbohydrateG: 0, fatG: 3.6, fiberG: 0,
      sugarG: 0, saturatedFatG: 1, sodiumMg: 74, potassiumMg: 256, calciumMg: 15, ironMg: 1, magnesiumMg: 29,
    })],
    [102, '24122130', 'Chicken breast, baked, skin eaten', values({
      energyKcal: 197, proteinG: 30, carbohydrateG: 0, fatG: 7.8, fiberG: 0,
      sugarG: 0, saturatedFatG: 2.2, sodiumMg: 82, potassiumMg: 240, calciumMg: 14, ironMg: 1.1, magnesiumMg: 27,
    })],
    [201, '56205001', 'Rice, white, cooked, as ingredient', values({
      energyKcal: 129, proteinG: 2.67, carbohydrateG: 28, fatG: 0.28, fiberG: 0.4,
      sugarG: 0.05, saturatedFatG: 0.08, sodiumMg: 1, potassiumMg: 35, calciumMg: 10, ironMg: 0.2, magnesiumMg: 12,
    })],
  ],
};

function photoResult(components) {
  const normalized = components.map(normalizeNutritionComponent);
  return {
    analysis: {
      mealName: 'Chicken rice bowl',
      components: normalized,
      nutrients: { energyKcal: 480, proteinG: 50, carbohydrateG: 50, fatG: 6, fiberG: 1 },
      confidence: 0.8,
      assumptions: [], warnings: [], label: null,
    },
    source: { kind: 'ai-photo-estimate' },
  };
}

describe('local food-composition enrichment', () => {
  it('uses both searchable identity and visual macros to rank preparation-specific records', () => {
    const component = normalizeNutritionComponent({
      name: 'Grilled chicken breast', quantityG: 150,
      nutrients: { energyKcal: 247.5, proteinG: 46.5, carbohydrateG: 0, fatG: 5.4, fiberG: 0 },
    });
    const matches = matchFoodCompositionCandidates(component, pack, 3);

    expect(matches[0]).toMatchObject({ fdcId: 101, description: 'Chicken breast, grilled without sauce, skin not eaten' });
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
  });

  it('calculates complete micronutrients only after every ingredient is matched', async () => {
    const result = photoResult([
      { name: 'Grilled chicken breast', quantityG: 150, nutrients: { energyKcal: 247.5, proteinG: 46.5, carbohydrateG: 0, fatG: 5.4, fiberG: 0 } },
      { name: 'Cooked white rice', quantityG: 180, nutrients: { energyKcal: 232.2, proteinG: 4.81, carbohydrateG: 50.4, fatG: 0.5, fiberG: 0.72 } },
    ]);

    await enrichPhotoAnalysisWithFoodComposition(result, { pack });

    expect(result.source.foodComposition).toMatchObject({ matchedComponents: 2, totalComponents: 2 });
    expect(result.analysis.nutrients).toMatchObject({
      energyKcal: 479.7,
      sodiumMg: 112.8,
      potassiumMg: 447,
      calciumMg: 40.5,
      ironMg: 1.86,
      magnesiumMg: 65.1,
    });
    expect(result.source.foodComposition.completeMicronutrientKeys).toEqual(expect.arrayContaining([
      'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg',
    ]));
    expect(result.analysis.components[0].foodData).toMatchObject({ sourceName: 'USDA FoodData Central', fdcId: 101, reviewed: false });
  });

  it('keeps micronutrient totals unknown when a material ingredient has no compatible record', async () => {
    const result = photoResult([
      { name: 'Grilled chicken breast', quantityG: 150, nutrients: { energyKcal: 247.5, proteinG: 46.5, carbohydrateG: 0, fatG: 5.4, fiberG: 0 } },
      { name: 'Homemade mystery sauce', quantityG: 40, nutrients: { energyKcal: 80, proteinG: 0, carbohydrateG: 4, fatG: 7, fiberG: 0 } },
    ]);

    await enrichPhotoAnalysisWithFoodComposition(result, { pack });

    expect(result.source.foodComposition).toMatchObject({ matchedComponents: 0, totalComponents: 2 });
    expect(result.analysis.nutrients).not.toHaveProperty('sodiumMg');
    expect(result.analysis.nutrients.energyKcal).toBe(327.5);
  });

  it('recalculates from a reviewed candidate and can return unsupported values to unknown', async () => {
    const result = photoResult([
      { name: 'Grilled chicken breast', quantityG: 150, nutrients: { energyKcal: 247.5, proteinG: 46.5, carbohydrateG: 0, fatG: 5.4, fiberG: 0 } },
    ]);
    await enrichPhotoAnalysisWithFoodComposition(result, { pack });

    applyFoodCompositionCandidate(result, 0, 102, pack, true);
    expect(result.analysis.components[0].foodData).toMatchObject({ fdcId: 102, reviewed: true });
    expect(result.analysis.nutrients).toMatchObject({ energyKcal: 295.5, sodiumMg: 123, potassiumMg: 360 });

    applyFoodCompositionCandidate(result, 0, 0, pack, true);
    expect(result.analysis.components[0]).not.toHaveProperty('foodData');
    expect(result.analysis.nutrients).not.toHaveProperty('sodiumMg');
    expect(result.analysis.nutrients.energyKcal).toBe(247.5);
  });

  it('recalculates whole-meal micronutrients after every manual candidate is selected', async () => {
    const result = photoResult([
      { name: 'Poultry portion', quantityG: 150, nutrients: { energyKcal: 247.5, proteinG: 46.5, carbohydrateG: 0, fatG: 5.4 } },
      { name: 'Grain portion', quantityG: 180, nutrients: { energyKcal: 232.2, proteinG: 4.81, carbohydrateG: 50.4, fatG: 0.5 } },
    ]);
    await enrichPhotoAnalysisWithFoodComposition(result, { pack });
    expect(result.source.foodComposition).toMatchObject({ matchedComponents: 0, totalComponents: 2 });

    applyFoodCompositionCandidate(result, 0, 101, pack, true);
    expect(result.source.foodComposition).toMatchObject({ matchedComponents: 1, totalComponents: 2 });
    expect(result.analysis.nutrients).not.toHaveProperty('sodiumMg');

    applyFoodCompositionCandidate(result, 1, 201, pack, true);
    expect(result.source.foodComposition).toMatchObject({ matchedComponents: 2, totalComponents: 2 });
    expect(result.analysis.nutrients).toMatchObject({ sodiumMg: 112.8, potassiumMg: 447, magnesiumMg: 65.1 });
  });

  it('ships the versioned USDA pack with stable identifiers and supported nutrients', () => {
    const shipped = JSON.parse(fs.readFileSync(new URL('../data/nutrition/fndds-2021-2023.json', import.meta.url), 'utf8'));
    expect(shipped).toMatchObject({
      schemaVersion: 1,
      source: { name: 'USDA FoodData Central', dataset: 'FNDDS 2021-2023', published: '2024-10-31' },
    });
    expect(shipped.foods.length).toBeGreaterThan(5_000);
    expect(shipped.nutrientKeys).toEqual(expect.arrayContaining(['energyKcal', 'sodiumMg', 'potassiumMg', 'vitaminCMg']));
    expect(shipped.foods.find(record => record[2] === 'Apple, raw')).toEqual(expect.arrayContaining([expect.any(Number), '63101000', 'Apple, raw']));
  });
});
