import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NUTRITION_WIDGET_NUTRIENTS,
  NUTRITION_WIDGET_NUTRIENTS,
  getNutritionTargets,
  normalizeNutritionTargets,
  resolveNutritionTargets,
  resolveNutritionWeight,
} from '../js/nutrition-targets.js';

describe('nutrition targets', () => {
  it('uses the latest normalized wearable weight for per-kilogram protein targets', () => {
    const profile = {
      nutritionTargets: { proteinBasis: 'active' },
      wearableSummary: {
        metrics: {
          weight: { latest: 80, latestDate: '2026-08-24', primarySource: 'fitbit' },
        },
      },
    };

    expect(resolveNutritionWeight(profile)).toMatchObject({ kg: 80, source: 'Fitbit' });
    expect(resolveNutritionTargets(profile)).toMatchObject({
      proteinG: 128,
      proteinFactor: 1.6,
      proteinUsesWeight: true,
      proteinUsesFallback: false,
    });
  });

  it('falls back to the latest legacy biometric and converts pounds', () => {
    const profile = {
      nutritionTargets: { proteinBasis: 'general' },
      biometrics: {
        weight: [
          { date: '2026-08-20', value: 150, unit: 'lb', source: 'manual' },
          { date: '2026-08-22', value: 176.37, unit: 'lb', source: 'manual' },
        ],
      },
    };

    expect(resolveNutritionWeight(profile)?.kg).toBeCloseTo(80, 1);
    expect(resolveNutritionTargets(profile).proteinG).toBeCloseTo(66.4, 1);
  });

  it('normalizes unsafe or malformed target values and supports fixed grams', () => {
    const normalized = normalizeNutritionTargets({
      energyKcal: -1,
      proteinBasis: 'fixed',
      proteinFixedG: 120,
      sodiumMg: 'not-a-number',
    });

    expect(normalized).toMatchObject({ energyKcal: 2000, proteinBasis: 'fixed', proteinFixedG: 120, sodiumMg: 2000 });
    expect(getNutritionTargets({ nutritionTargets: normalized })).toEqual(normalized);
    expect(resolveNutritionTargets({ nutritionTargets: normalized })).toMatchObject({ proteinG: 120, proteinUsesWeight: false });
  });

  it('defaults to the four core macros while allowing every tracked nutrient as an opt-in', () => {
    const targets = getNutritionTargets({});
    expect(targets.fluidMl).toBe(2000);
    expect(targets.configured).toBe(false);
    expect(targets.widgetNutrients).toEqual([...DEFAULT_NUTRITION_WIDGET_NUTRIENTS]);
    expect(targets.widgetNutrients).toContain('carbohydrateG');
    expect(targets.widgetNutrients).not.toContain('fluidMl');
    expect(targets.widgetNutrients).not.toContain('sugarG');
    expect(targets.widgetNutrients).not.toContain('sodiumMg');
    expect(NUTRITION_WIDGET_NUTRIENTS).toContain('vitaminDMcg');
    expect(NUTRITION_WIDGET_NUTRIENTS).not.toContain('energyKcal');
    expect(normalizeNutritionTargets({ widgetNutrients: ['proteinG', 'magnesiumMg', 'bogus', 'magnesiumMg'] }).widgetNutrients)
      .toEqual(['proteinG', 'magnesiumMg']);
    expect(normalizeNutritionTargets({ widgetNutrients: ['proteinG', 'fatG', 'fiberG', 'fluidMl', 'sugarG', 'magnesiumMg'] }).widgetNutrients)
      .toEqual(['proteinG', 'fatG', 'fiberG', 'fluidMl', 'sugarG', 'magnesiumMg']);
    expect(normalizeNutritionTargets({ configured: true }).configured).toBe(true);
  });
});
