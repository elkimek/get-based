import { describe, expect, it } from 'vitest';

import {
  normalizeNutritionComponent,
  recalculateMealFromComponents,
  updateComponentQuantity,
} from '../js/nutrition-food-data.js';

describe('deterministic meal component arithmetic', () => {
  it('rescales a reviewed gram amount from its per-100 g nutrient profile', () => {
    const original = normalizeNutritionComponent({
      name: 'Edam cheese',
      quantityG: 100,
      nutrients: { energyKcal: 357, proteinG: 25 },
    });
    const updated = updateComponentQuantity(original, 150);
    expect(updated).toMatchObject({
      quantityG: 150,
      portionReviewed: true,
      nutrients: { energyKcal: 535.5, proteinG: 37.5 },
    });
  });

  it('reduces rice carbohydrates and calories when 250 g is corrected to 200 g', () => {
    const rice = normalizeNutritionComponent({
      name: 'White rice',
      quantityG: 250,
      nutrients: { energyKcal: 325, carbohydrateG: 70, proteinG: 6 },
    });
    const corrected = updateComponentQuantity(rice, 200);
    const meal = recalculateMealFromComponents([corrected], rice.nutrients);

    expect(corrected).toMatchObject({
      quantityG: 200,
      nutrients: { energyKcal: 260, carbohydrateG: 56, proteinG: 4.8 },
    });
    expect(meal.nutrients).toEqual({ energyKcal: 260, proteinG: 4.8, carbohydrateG: 56 });
  });

  it('sums only keys supported by every component and preserves explicit edits', () => {
    const result = recalculateMealFromComponents([
      normalizeNutritionComponent({ name: 'Cheese', quantityG: 100, nutrients: { energyKcal: 350, proteinG: 25 } }),
      normalizeNutritionComponent({ name: 'Fries', quantityG: 200, nutrients: { energyKcal: 600, proteinG: 8 } }),
    ], { energyKcal: 1000, proteinG: 40, sodiumMg: 1200 }, { sodiumMg: 900 });

    expect(result.nutrients).toEqual({ energyKcal: 950, proteinG: 33, sodiumMg: 900 });
    expect(result.recalculatedKeys).toEqual(expect.arrayContaining(['energyKcal', 'proteinG']));
    expect(result.removedEstimatedKeys).not.toContain('sodiumMg');
  });

  it('keeps extended nutrient profiles through repeated portion edits', () => {
    const original = normalizeNutritionComponent({
      name: 'Greek yogurt',
      quantityG: 300,
      nutrients: {
        energyKcal: 240,
        proteinG: 30,
        addedSugarG: 8,
        sodiumMg: 140,
        potassiumMg: 420,
        calciumMg: 360,
      },
    });
    const half = updateComponentQuantity(original, 150);
    const halfMeal = recalculateMealFromComponents([half], original.nutrients);
    const oneAndHalf = updateComponentQuantity(half, 450);
    const oneAndHalfMeal = recalculateMealFromComponents([oneAndHalf], halfMeal.nutrients);

    expect(halfMeal.nutrients).toMatchObject({
      energyKcal: 120,
      proteinG: 15,
      addedSugarG: 4,
      sodiumMg: 70,
      potassiumMg: 210,
      calciumMg: 180,
    });
    expect(oneAndHalfMeal.nutrients).toMatchObject({
      energyKcal: 360,
      proteinG: 45,
      addedSugarG: 12,
      sodiumMg: 210,
      potassiumMg: 630,
      calciumMg: 540,
    });
    expect(oneAndHalf.nutrientsPer100g).toEqual(original.nutrientsPer100g);
  });

});
