import { describe, expect, it } from 'vitest';

import { mergeImportedData } from '../js/data-merge.js';
import { sanitizeNutritionProfileData } from '../js/nutrition-sync-sanitize.js';
import { DELTA_ARRAYS, DELTA_SCALARS } from '../js/sync-delta-surfaces.js';
import { stripNutritionMealsFromBlob } from '../js/sync-payload.js';

describe('meal cross-device sync surface', () => {
  it('admits meal rows and targets to per-row sync while stripping full photos', () => {
    expect(DELTA_ARRAYS).toContain('nutritionMeals');
    expect(DELTA_SCALARS).toContain('nutritionTargets');

    const safe = sanitizeNutritionProfileData({
      nutritionMeals: [{
        id: 'meal-1',
        eatenAt: '2026-08-24T12:00:00.000Z',
        responseCheckIn: { satiety2h: 3, energy2h: 2, recordedAt: '2026-08-24T14:30:00.000Z' },
        components: [{
          name: 'Chicken breast', quantityG: 150,
          nutrientsPer100g: { proteinG: 31, sodiumMg: 74 },
          foodData: { sourceName: 'USDA FoodData Central', dataset: 'FNDDS 2021-2023', fdcId: 101 },
          foodDataCandidates: [{ fdcId: 101, description: 'Chicken breast, grilled' }],
          foodCompositionAttempted: true,
          visualNutrients: { proteinG: 45 },
          visualNutrientsPer100g: { proteinG: 30 },
        }],
        images: [{
          dataUrl: 'data:image/jpeg;base64,RlVMTF9TSVpF',
          futureOriginalBytes: 'a full-image field from a newer peer',
          thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=',
        }, {
          thumbnailUrl: `data:image/jpeg;base64,${'QUJD'.repeat(60_000)}`,
        }],
      }],
    });

    expect(safe.nutritionMeals[0].images).toEqual([
      { thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=' },
    ]);
    expect(safe.nutritionMeals[0].responseCheckIn).toEqual({
      satiety2h: 3, energy2h: 2, recordedAt: '2026-08-24T14:30:00.000Z',
    });
    expect(safe.nutritionMeals[0].components).toEqual([expect.objectContaining({
      name: 'Chicken breast',
      nutrientsPer100g: { proteinG: 31, sodiumMg: 74 },
      foodData: { sourceName: 'USDA FoodData Central', dataset: 'FNDDS 2021-2023', fdcId: 101 },
    })]);
    expect(JSON.stringify(safe)).not.toContain('RlVMTF9TSVpF');
    expect(JSON.stringify(safe)).not.toContain('futureOriginalBytes');
    expect(JSON.stringify(safe)).not.toContain('foodDataCandidates');
    expect(JSON.stringify(safe)).not.toContain('visualNutrients');
    expect(stripNutritionMealsFromBlob({ nutritionMeals: safe.nutritionMeals, nutritionTargets: { energyKcal: 2200 } }))
      .toEqual({ nutritionTargets: { energyKcal: 2200 } });
  });

  it('deduplicates meals by id and applies per-meal deletion tombstones', () => {
    const merged = mergeImportedData({
      nutritionMeals: [{
        id: 'meal-a', name: 'Older', eatenAt: '2026-08-24T12:00:00.000Z', updatedAt: '2026-08-24T12:05:00.000Z',
      }],
      _deleted: { nutritionMeals: ['meal-b'] },
    }, {
      nutritionMeals: [
        { id: 'meal-a', name: 'Newer', eatenAt: '2026-08-24T12:00:00.000Z', updatedAt: '2026-08-24T12:10:00.000Z' },
        { id: 'meal-b', name: 'Deleted remotely', eatenAt: '2026-08-24T13:00:00.000Z', updatedAt: '2026-08-24T13:05:00.000Z' },
      ],
    });

    expect(merged.nutritionMeals).toEqual([
      expect.objectContaining({ id: 'meal-a', name: 'Newer' }),
    ]);
  });
});
