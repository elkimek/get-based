import { afterEach, describe, expect, it } from 'vitest';

import { buildNutritionContext, buildNutritionHistoryReceiptContext, doesNutritionContextOverrideTypicalMeals, nutritionHistoryRequestFromQuery, setNutritionContextEnabled } from '../js/nutrition-context.js';
import { renderNutritionCircadianExtension, renderNutritionDietExtension } from '../js/nutrition-context-card-extensions.js';
import { buildNutritionSummaryContext } from '../js/nutrition-summary.js';
import { getNutritionContextDays, setNutritionContextDays } from '../js/lab-context-settings.js';
import { state } from '../js/state.js';

const previousSummary = state.nutritionSummary;
const previousImported = state.importedData;

function attachContextWindows(summary) {
  summary.contextByDays = Object.fromEntries([7, 30, 90].map(days => [`d${days}`, buildNutritionSummaryContext(summary, { days })]));
  return summary;
}

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
    attachContextWindows(state.nutritionSummary);

    const context = buildNutritionContext();
    expect(context).toContain('[section:nutrition]');
    expect(context).toContain('[/section:nutrition]');
    expect(context).toContain('Last 7 days: 3 meals across 3/7 days');
    expect(context).toContain('Last 30 days: 5 meals across 4/30 days');
    expect(context).toContain('occasions: breakfast 1, dinner 2');
    expect(context).toContain('missing days/values are unknown, not zero');
    expect(context).toContain('Never infer skipped meals, under-eating');
    expect(context).toContain('Detailed logs replace, never supplement');
    expect(context).toContain('7-day average compared with the previous 23-day period');
    expect(context).not.toContain('Recent weeks:');
    expect(context).not.toContain('average last logged meal 20:15');
    expect(context).not.toContain('data:image');
    expect(context).not.toContain('Lentil bowl');
    const actionAttrs = (action, attrs = {}) => `data-action="${action}" data-surface="${attrs.surface || ''}"`;
    expect(renderNutritionDietExtension(actionAttrs)).toContain('Detailed meal log active');
    expect(renderNutritionDietExtension(actionAttrs)).toContain('Replaces Typical meals');
    expect(renderNutritionDietExtension(actionAttrs)).toContain('data-surface="meals"');
    expect(renderNutritionCircadianExtension(actionAttrs)).toContain('first 08:30 · last 20:15');
    expect(renderNutritionCircadianExtension(actionAttrs)).toContain('data-surface="timing"');
  });

  it('uses the profile-scoped 7/30/90-day routine AI timeframe independently of History', () => {
    state.importedData = { contextSourceSettings: {}, nutritionContextDays: 30 };
    state.nutritionSummary = {
      totalMeals: 12,
      windows: {
        d7: { days: 7, meals: 2, loggedDays: 2, reviewRatio: 1, dailyAverages: { proteinG: 90 }, nutrientCoverage: { proteinG: { completeDays: 2 } } },
        d30: { days: 30, meals: 6, loggedDays: 6, reviewRatio: 1, dailyAverages: { proteinG: 80 }, nutrientCoverage: { proteinG: { completeDays: 6 } } },
        d90: { days: 90, meals: 12, loggedDays: 12, reviewRatio: 1, dailyAverages: { proteinG: 75 }, nutrientCoverage: { proteinG: { completeDays: 12 } } },
      },
    };
    attachContextWindows(state.nutritionSummary);

    expect(getNutritionContextDays()).toBe(30);
    expect(buildNutritionContext()).toContain('Last 30 days');
    setNutritionContextDays(7);
    expect(buildNutritionContext()).not.toContain('Last 30 days');
    expect(buildNutritionContext()).not.toContain('Last 90 days');
    setNutritionContextDays(90);
    expect(getNutritionContextDays()).toBe(90);
    expect(buildNutritionContext()).toContain('Last 90 days');
    expect(state.importedData.nutritionContextDays).toBe(90);
  });

  it('qualifies nutrient-specific incomplete coverage in AI context', () => {
    state.importedData = { contextSourceSettings: {}, nutritionContextDays: 7 };
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
    attachContextWindows(state.nutritionSummary);

    expect(buildNutritionContext()).toContain('magnesium mg 100 [1/2 complete days]');
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
    attachContextWindows(state.nutritionSummary);

    expect(buildNutritionContext()).not.toContain('compared with');
  });

  it('honors the profile-scoped nutrition context toggle', () => {
    state.importedData = { contextSourceSettings: {} };
    state.nutritionSummary = { totalMeals: 1, windows: {} };
    attachContextWindows(state.nutritionSummary);
    setNutritionContextEnabled(false);
    expect(buildNutritionContext()).toBe('');
    expect(buildNutritionContext(state, { ignoreContextToggles: true })).toContain('[section:nutrition]');
    expect(renderNutritionDietExtension(() => 'data-action="open"')).toContain('AI source off');
    expect(renderNutritionDietExtension(() => 'data-action="open"')).toContain('Typical meals active');
  });

  it('keeps Typical meals active when nutrition entries fall outside the selected automatic timeframe', () => {
    state.importedData = { contextSourceSettings: {}, nutritionContextDays: 30 };
    state.nutritionSummary = {
      totalMeals: 4,
      windows: {
        d7: { days: 7, meals: 0, loggedDays: 0 },
        d30: { days: 30, meals: 0, loggedDays: 0 },
        d90: { days: 90, meals: 4, loggedDays: 4 },
      },
    };

    expect(doesNutritionContextOverrideTypicalMeals()).toBe(false);
    expect(renderNutritionDietExtension(() => 'data-action="open"')).toContain('No entries in the 30-day AI timeframe');
    setNutritionContextDays(90);
    expect(doesNutritionContextOverrideTypicalMeals()).toBe(true);
  });

  it('recognizes an explicit History prompt and builds a receipt without a second aggregate', () => {
    const query = 'Review my Meals & Nutrition history.\nNutrition history range: 6M (the last 6 calendar months).\nSelected 6M: 20 meals.';
    expect(nutritionHistoryRequestFromQuery(query)).toEqual({ label: '6M', description: 'the last 6 calendar months' });
    const receipt = buildNutritionHistoryReceiptContext(query);
    expect(receipt).toContain('[section:nutritionHistory]');
    expect(receipt).toContain('6M one-off history');
    expect(receipt).toContain('automatic nutrition summary is omitted');
    expect(receipt).not.toContain('20 meals');
  });
});
