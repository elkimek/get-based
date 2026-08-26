import { afterEach, describe, expect, it } from 'vitest';

import { buildNutritionContext, renderNutritionCircadianExtension, renderNutritionDietExtension, setNutritionContextEnabled } from '../js/nutrition-context.js';
import { buildNutritionSummaryContext } from '../js/nutrition-summary.js';
import { state } from '../js/state.js';

const previousSummary = state.nutritionSummary;
const previousImported = state.importedData;

afterEach(() => {
  state.nutritionSummary = previousSummary;
  state.importedData = previousImported;
  localStorage.clear();
});

describe('nutrition AI context', () => {
  it('includes coverage-qualified rolling averages but no meals or photos', () => {
    state.importedData = { contextSourceSettings: {} };
    state.nutritionSummary = {
      totalMeals: 5,
      windows: {
        d7: {
          days: 7, meals: 3, loggedDays: 3, reviewRatio: 1,
          dailyAverages: { energyKcal: 1900, proteinG: 92 },
          nutrientCoverage: { energyKcal: { completeDays: 3 }, proteinG: { completeDays: 3 } },
          timing: {
            mealsWithTiming: 3,
            averageFirstMealMinutes: 510,
            averageLastMealMinutes: 1215,
            averageFirstMealLocalTime: '08:30',
            averageLastMealLocalTime: '20:15',
            averageEatingWindowMinutes: 705,
            eatingWindowDays: 2,
            eveningOrNightMeals: 1,
            occasionCounts: { breakfast: 1, dinner: 2 },
            sourceCounts: { labelScans: 1, mealPhotos: 2, manualEntries: 0 },
            contextSummary: 'average first logged meal 08:30; average last logged meal 20:15; average observed eating window 11.8 h (2 sufficiently logged days); occasions: breakfast 1, dinner 2; 1 meal(s) logged 20:00–03:59 local time; capture sources: label 1, meal photo 2, manual 0',
          },
        },
        d30: { days: 30, meals: 5, loggedDays: 4, reviewRatio: 0.8, dailyAverages: { energyKcal: 1800, proteinG: 85 } },
      },
      trendBaseline: {
        days: 23,
        loggedDays: 5,
        dailyAverages: { energyKcal: 1800, proteinG: 85 },
        nutrientCoverage: { energyKcal: { completeDays: 5 }, proteinG: { completeDays: 5 } },
      },
    };
    state.nutritionSummary.contextText = buildNutritionSummaryContext(state.nutritionSummary);

    const context = buildNutritionContext();
    expect(context).toContain('[section:nutrition]');
    expect(context).toContain('[/section:nutrition]');
    expect(context).toContain('Last 7 days: 3 meals across 3/7 days');
    expect(context).toContain('occasions: breakfast 1, dinner 2');
    expect(context).toContain('missing days/values are unknown, not zero');
    expect(context).toContain('Never infer skipped meals, under-eating');
    expect(context).toContain('Detailed logs replace, never supplement');
    expect(context).toContain('7-day average compared with the previous 23-day period');
    expect(context).not.toContain('Recent weeks:');
    expect(context).not.toContain('average last logged meal 20:15');
    expect(context).not.toContain('data:image');
    expect(context).not.toContain('Lentil bowl');
    expect(renderNutritionDietExtension(() => 'data-action="open"')).toContain('Detailed meal log active');
    expect(renderNutritionDietExtension(() => 'data-action="open"')).toContain('Replaces Typical meals');
    expect(renderNutritionCircadianExtension(() => 'data-action="open"')).toContain('first 08:30 · last 20:15');
  });

  it('qualifies nutrient-specific incomplete coverage in AI context', () => {
    state.importedData = { contextSourceSettings: {} };
    state.nutritionSummary = {
      totalMeals: 2,
      windows: {
        d7: {
          days: 7,
          meals: 2,
          loggedDays: 2,
          reviewRatio: 1,
          dailyAverages: { magnesiumMg: 100 },
          nutrientCoverage: {
            magnesiumMg: { completeDays: 1, loggedDays: 2 },
          },
        },
      },
    };
    state.nutritionSummary.contextText = buildNutritionSummaryContext(state.nutritionSummary);

    expect(buildNutritionContext()).not.toContain('magnesium mg');
  });

  it('omits trend claims until both periods have enough complete logged days', () => {
    state.importedData = { contextSourceSettings: {} };
    state.nutritionSummary = {
      totalMeals: 4,
      windows: {
        d7: {
          days: 7, meals: 2, loggedDays: 2, reviewRatio: 1,
          dailyAverages: { proteinG: 100 },
          nutrientCoverage: { proteinG: { completeDays: 2 } },
        },
      },
      trendBaseline: {
        days: 23, loggedDays: 4,
        dailyAverages: { proteinG: 60 },
        nutrientCoverage: { proteinG: { completeDays: 4 } },
      },
    };
    state.nutritionSummary.contextText = buildNutritionSummaryContext(state.nutritionSummary);

    expect(buildNutritionContext()).not.toContain('compared with');
  });

  it('honors the profile-scoped nutrition context toggle', () => {
    state.importedData = { contextSourceSettings: {} };
    state.nutritionSummary = { totalMeals: 1, windows: {} };
    state.nutritionSummary.contextText = buildNutritionSummaryContext(state.nutritionSummary);
    setNutritionContextEnabled(false);
    expect(buildNutritionContext()).toBe('');
    expect(buildNutritionContext(state, { ignoreContextToggles: true })).toContain('[section:nutrition]');
    expect(renderNutritionDietExtension(() => 'data-action="open"')).toContain('AI source off');
    expect(renderNutritionDietExtension(() => 'data-action="open"')).toContain('Typical meals active');
  });
});
