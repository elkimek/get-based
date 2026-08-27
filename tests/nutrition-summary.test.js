import { describe, expect, it } from 'vitest';

import { buildNutritionHistoryAnalysisPrompt, buildNutritionSummaryContext, computeNutritionHistory, computeNutritionSummary, NUTRITION_CONTEXT_CHAR_LIMIT, NUTRITION_SUMMARY_VERSION } from '../js/nutrition-summary.js';

function meal(eatenAt, energyKcal, proteinG, reviewed = true) {
  return { eatenAt, reviewed, nutrients: { energyKcal, proteinG } };
}

describe('nutrition rolling summaries', () => {
  it('separates missing days from zero intake and computes compact 7/30/90-day windows', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const summary = computeNutritionSummary([
      meal('2026-08-23T08:00:00.000Z', 600, 30),
      meal('2026-08-23T18:00:00.000Z', 900, 45),
      meal('2026-08-20T12:00:00.000Z', 500, 25, false),
      meal('2026-08-01T12:00:00.000Z', 700, 35),
      meal('2026-06-10T12:00:00.000Z', 800, 40),
      meal('2026-04-01T12:00:00.000Z', 999, 99),
    ], { now });

    expect(summary.totalMeals).toBe(6);
    expect(summary.windows.d7).toMatchObject({ meals: 3, loggedDays: 2, reviewedMeals: 2 });
    expect(summary.windows.d7.coverageRatio).toBeCloseTo(2 / 7, 3);
    expect(summary.windows.d7.dailyAverages).toMatchObject({ energyKcal: 1000, proteinG: 50 });
    expect(summary.windows.d30).toMatchObject({ meals: 4, loggedDays: 3 });
    expect(summary.windows.d90).toMatchObject({ meals: 5, loggedDays: 4 });
  });

  it('builds honest 30D, calendar 3M/6M/1Y, and all-history views on demand', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const meals = [
      { ...meal('2026-08-31T08:00:00.000Z', 600, 30), localDate: '2026-08-31' },
      { ...meal('2026-05-31T08:00:00.000Z', 700, 35), localDate: '2026-05-31' },
      { ...meal('2026-05-30T08:00:00.000Z', 800, 40), localDate: '2026-05-30' },
      { ...meal('2026-02-28T08:00:00.000Z', 900, 45), localDate: '2026-02-28' },
      { ...meal('2025-08-31T08:00:00.000Z', 1000, 50), localDate: '2025-08-31' },
      { ...meal('2024-01-01T08:00:00.000Z', 1100, 55), localDate: '2024-01-01' },
    ];

    const d30 = computeNutritionHistory(meals, { rangeKey: '30d', now });
    const d3m = computeNutritionHistory(meals, { rangeKey: '3m', now });
    const d6m = computeNutritionHistory(meals, { rangeKey: '6m', now });
    const y1 = computeNutritionHistory(meals, { rangeKey: '1y', now });
    const all = computeNutritionHistory(meals, { rangeKey: 'all', now });

    expect(d30).toMatchObject({ rangeKey: '30d', startKey: '2026-08-02', endKey: '2026-08-31' });
    expect(d30.period).toMatchObject({ meals: 1, loggedDays: 1, days: 30 });
    expect(d3m).toMatchObject({ rangeKey: '3m', startKey: '2026-05-31', endKey: '2026-08-31' });
    expect(d3m.period).toMatchObject({ meals: 2, loggedDays: 2 });
    expect(d3m.coverageBuckets).toHaveLength(4);
    expect(d6m).toMatchObject({ rangeKey: '6m', startKey: '2026-02-28' });
    expect(d6m.period).toMatchObject({ meals: 4, loggedDays: 4 });
    expect(y1).toMatchObject({ rangeKey: '1y', startKey: '2025-08-31' });
    expect(y1.period).toMatchObject({ meals: 5, loggedDays: 5 });
    expect(all).toMatchObject({ rangeKey: 'all', startKey: '2024-01-01' });
    expect(all.period).toMatchObject({ meals: 6, loggedDays: 6 });
    const emptyRecent = computeNutritionHistory(meals.slice(-1), { rangeKey: '3m', now });
    expect(emptyRecent.period).toMatchObject({ meals: 0, loggedDays: 0 });
    expect(computeNutritionHistory(meals, { rangeKey: 'unsupported', now }).rangeKey).toBe('30d');
  });

  it('summarizes local meal timing without retaining meal-level details', () => {
    const summary = computeNutritionSummary([
      { ...meal('2026-08-23T06:30:00.000Z', 500, 25), localDate: '2026-08-23', localTimeMinutes: 510, mealType: 'breakfast', source: { kind: 'ai-label-scan' } },
      { ...meal('2026-08-23T18:30:00.000Z', 900, 45), localDate: '2026-08-23', localTimeMinutes: 1230, mealType: 'dinner', source: { kind: 'ai-photo-estimate' } },
      { ...meal('2026-08-22T11:00:00.000Z', 600, 30), localDate: '2026-08-22', localTimeMinutes: 780, mealType: 'lunch', source: { kind: 'manual' } },
    ], { now: new Date('2026-08-23T12:00:00.000Z') });

    expect(summary.version).toBe(NUTRITION_SUMMARY_VERSION);
    expect(summary.windows.d7.timing).toMatchObject({
      mealsWithTiming: 3,
      daysWithTiming: 2,
      averageFirstMealMinutes: 645,
      averageLastMealMinutes: 1005,
      averageFirstMealLocalTime: '10:45',
      averageLastMealLocalTime: '16:45',
      averageEatingWindowMinutes: 720,
      eatingWindowDays: 1,
    });
    expect(summary.windows.d7.timing).not.toHaveProperty('meals');
    expect(summary.windows.d7.timing.occasionCounts).toEqual({ breakfast: 1, dinner: 1, lunch: 1 });
    expect(summary.windows.d7.timing).not.toHaveProperty('sourceCounts');
    const contextText = buildNutritionSummaryContext(summary);
    expect(contextText).toContain('occasions: breakfast 1, dinner 1, lunch 1');
    expect(contextText).toContain('Never infer skipped meals, under-eating');
  });

  it('does not treat an unknown nutrient on another logged meal or day as zero', () => {
    const summary = computeNutritionSummary([
      { eatenAt: '2026-08-23T08:00:00.000Z', localDate: '2026-08-23', nutrients: { energyKcal: 500, magnesiumMg: 100 } },
      { eatenAt: '2026-08-22T08:00:00.000Z', localDate: '2026-08-22', nutrients: { energyKcal: 500 } },
    ], { now: new Date('2026-08-23T12:00:00.000Z') });

    expect(summary.windows.d7.dailyAverages).toMatchObject({ energyKcal: 500, magnesiumMg: 100 });
    expect(summary.windows.d7.nutrientCoverage.magnesiumMg).toMatchObject({
      observedMeals: 1,
      totalMeals: 2,
      completeDays: 1,
      loggedDays: 2,
      completeDayRatio: 0.5,
    });
  });

  it('excludes unreviewed photo-only micronutrients while retaining explicit edits', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const summary = computeNutritionSummary([
      { eatenAt: '2026-08-23T08:00:00.000Z', localDate: '2026-08-23', nutrients: { energyKcal: 500, vitaminDMcg: 20 }, source: { kind: 'ai-photo-estimate' } },
      { eatenAt: '2026-08-22T08:00:00.000Z', localDate: '2026-08-22', nutrients: { energyKcal: 600, vitaminDMcg: 10 }, source: { kind: 'ai-photo-estimate', review: { editedNutrients: ['vitaminDMcg'] } } },
    ], { now });

    expect(summary.windows.d7.dailyAverages.energyKcal).toBe(550);
    expect(summary.windows.d7.dailyAverages.vitaminDMcg).toBe(10);
    expect(summary.windows.d7.nutrientCoverage.vitaminDMcg).toMatchObject({ observedMeals: 1, totalMeals: 1 });
  });

  it('includes explicitly attributed AI composition estimates in nutrient summaries', () => {
    const summary = computeNutritionSummary([
      {
        eatenAt: '2026-08-23T08:00:00.000Z',
        localDate: '2026-08-23',
        nutrients: { energyKcal: 500, vitaminDMcg: 12, potassiumMg: 780 },
        source: {
          kind: 'ai-photo-estimate',
          aiNutritionEstimate: { nutrientKeys: ['energyKcal', 'vitaminDMcg', 'potassiumMg'] },
        },
      },
    ], { now: new Date('2026-08-23T12:00:00.000Z') });

    expect(summary.windows.d7.dailyAverages).toMatchObject({ vitaminDMcg: 12, potassiumMg: 780 });
    expect(summary.windows.d7.nutrientCoverage.vitaminDMcg).toMatchObject({ observedMeals: 1, totalMeals: 1 });
  });

  it('sends observed detailed nutrients through routine and one-off aggregate context', () => {
    const meals = [{
      eatenAt: '2026-08-23T08:00:00.000Z',
      localDate: '2026-08-23',
      nutrients: {
        energyKcal: 500,
        sugarG: 18,
        saturatedFatG: 6,
        sodiumMg: 740,
        potassiumMg: 920,
        calciumMg: 280,
        vitaminCMg: 42,
      },
    }];
    const now = new Date('2026-08-23T12:00:00.000Z');
    const summary = computeNutritionSummary(meals, { now });
    const routine = buildNutritionSummaryContext(summary, { days: 30 });
    const history = buildNutritionHistoryAnalysisPrompt(computeNutritionHistory(meals, { rangeKey: '30d', now }));

    for (const expected of [
      'sugar g 18',
      'saturated fat g 6',
      'sodium mg 740',
      'potassium mg 920',
      'calcium mg 280',
      'vitamin c mg 42',
    ]) {
      expect(routine).toContain(expected);
      expect(history).toContain(expected);
    }
    expect(routine).toContain('missing days/values are unknown, not zero');
    expect(routine.length).toBeLessThanOrEqual(NUTRITION_CONTEXT_CHAR_LIMIT);
  });

  it('excludes partial days from a nutrient average when another meal lacks that nutrient', () => {
    const summary = computeNutritionSummary([
      { eatenAt: '2026-08-23T08:00:00.000Z', localDate: '2026-08-23', nutrients: { magnesiumMg: 100 } },
      { eatenAt: '2026-08-23T18:00:00.000Z', localDate: '2026-08-23', nutrients: { energyKcal: 800 } },
      { eatenAt: '2026-08-22T08:00:00.000Z', localDate: '2026-08-22', nutrients: { magnesiumMg: 200 } },
    ], { now: new Date('2026-08-23T12:00:00.000Z') });

    expect(summary.windows.d7.dailyAverages.magnesiumMg).toBe(200);
    expect(summary.windows.d7.nutrientCoverage.magnesiumMg.completeDays).toBe(1);
  });

  it('sums explicit drink events without requiring every meal to contain a fluid field', () => {
    const summary = computeNutritionSummary([
      { eatenAt: '2026-08-23T08:00:00.000Z', localDate: '2026-08-23', nutrients: { fluidMl: 350 }, source: { kind: 'manual-beverage' } },
      { eatenAt: '2026-08-23T12:00:00.000Z', localDate: '2026-08-23', nutrients: { energyKcal: 700 } },
      { eatenAt: '2026-08-22T08:00:00.000Z', localDate: '2026-08-22', nutrients: { fluidMl: 500, plainWaterMl: 500 }, source: { kind: 'manual-water' } },
    ], { now: new Date('2026-08-23T12:00:00.000Z') });

    expect(summary.windows.d7).toMatchObject({ meals: 3, foodMeals: 1, drinkEntries: 2 });
    expect(summary.windows.d7.dailyAverages).toMatchObject({ energyKcal: 700, fluidMl: 425, plainWaterMl: 500 });
    expect(summary.windows.d7.nutrientCoverage.energyKcal).toMatchObject({ totalMeals: 1, completeDays: 1 });
    expect(summary.windows.d7.nutrientCoverage.fluidMl).toMatchObject({ observedMeals: 2, completeDays: 2 });
    expect(summary.windows.d7.nutrientCoverage.plainWaterMl).toMatchObject({ observedMeals: 1, completeDays: 1 });
  });

  it('connects logged meal times to wearable-relative sleep gaps', () => {
    const summary = computeNutritionSummary([
      { ...meal('2026-08-21T18:00:00.000Z', 700, 30), localDate: '2026-08-21', localTimeMinutes: 1200 },
      { ...meal('2026-08-22T07:00:00.000Z', 450, 25), localDate: '2026-08-22', localTimeMinutes: 540 },
      { ...meal('2026-08-22T18:30:00.000Z', 800, 35), localDate: '2026-08-22', localTimeMinutes: 1230 },
      { ...meal('2026-08-23T07:30:00.000Z', 500, 25), localDate: '2026-08-23', localTimeMinutes: 570 },
    ], {
      now: new Date('2026-08-23T12:00:00.000Z'),
      sleepIntervals: [
        { source: 'oura', sleepStart: '2026-08-21T22:00:00.000Z', sleepEnd: '2026-08-22T06:00:00.000Z' },
        { source: 'oura', sleepStart: '2026-08-22T23:00:00.000Z', sleepEnd: '2026-08-23T06:30:00.000Z' },
      ],
    });

    expect(summary.windows.d7.timing.sleepRelative).toMatchObject({
      averageLastMealToSleepMinutes: 255,
      averageWakeToFirstMealMinutes: 60,
      averageSleepSpanningMealGapMinutes: 780,
      sleepSpanningMealGapCount: 2,
      sourceCounts: { oura: 2 },
    });
  });

  it('builds a non-overlapping trend baseline from days 8 through 30', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const meals = [0, 1, 2].map(offset => meal(new Date('2026-08-23T12:00:00.000Z').getTime() - offset * 86400000, 600, 30));
    for (let offset = 7; offset < 12; offset += 1) {
      meals.push(meal(new Date('2026-08-23T12:00:00.000Z').getTime() - offset * 86400000, 400, 20));
    }
    const summary = computeNutritionSummary(meals, { now });

    expect(summary.windows.d7.dailyAverages).toMatchObject({ energyKcal: 600, proteinG: 30 });
    expect(summary.trendBaseline).toMatchObject({ days: 23, loggedDays: 5, dailyAverages: { energyKcal: 400, proteinG: 20 } });
    expect(buildNutritionSummaryContext(summary)).toContain('7-day average compared with the previous 23-day period: kcal +50%; protein g +50%');
  });

  it('builds range-aware routine context without making History selection implicit', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const meals = [];
    const richMeal = (date, energyKcal, proteinG) => ({
      ...meal(date, energyKcal, proteinG),
      nutrients: {
        energyKcal,
        proteinG,
        carbohydrateG: energyKcal / 10,
        fatG: energyKcal / 30,
        fiberG: energyKcal / 100,
        fluidMl: energyKcal,
        plainWaterMl: energyKcal / 2,
      },
    });
    for (let offset = 0; offset < 21; offset += 1) {
      meals.push(richMeal(new Date(now.getTime() - offset * 86400000), offset < 7 ? 600 : 400, offset < 7 ? 30 : 20));
    }
    for (let offset = 30; offset < 50; offset += 1) {
      meals.push(richMeal(new Date(now.getTime() - offset * 86400000), 300, 15));
    }
    const summary = computeNutritionSummary(meals, { now });

    const d7 = buildNutritionSummaryContext(summary, { days: 7 });
    const d30 = buildNutritionSummaryContext(summary, { days: 30 });
    const d90 = buildNutritionSummaryContext(summary, { days: 90 });
    expect(d7).toContain('Last 7 days:');
    expect(d7).not.toContain('Last 30 days:');
    expect(d7).not.toContain('compared with');
    expect(d30).toContain('Last 30 days:');
    expect(d30).toContain('previous 23-day period');
    expect(d90).toContain('Last 90 days:');
    expect(d90).toContain('previous 83-day period');
    expect(Math.max(d7.length, d30.length, d90.length)).toBeLessThanOrEqual(NUTRITION_CONTEXT_CHAR_LIMIT);
  });

  it('adds meal-level dietary fuel overlap without claiming measured metabolism', () => {
    const summary = computeNutritionSummary([
      { eatenAt: '2026-08-23T08:00:00.000Z', localDate: '2026-08-23', nutrients: { carbohydrateG: 90, fatG: 0 } },
      { eatenAt: '2026-08-23T18:00:00.000Z', localDate: '2026-08-23', nutrients: { carbohydrateG: 0, fatG: 40 } },
      { eatenAt: '2026-08-22T12:00:00.000Z', localDate: '2026-08-22', nutrients: { carbohydrateG: 45, fatG: 20 }, responseCheckIn: { satiety2h: 3, energy2h: 2 } },
    ], { now: new Date('2026-08-23T12:00:00.000Z') });

    expect(summary.windows.d7.fuelOverlap).toMatchObject({
      available: true,
      totalMeals: 3,
      completeMeals: 3,
      carbEnergyPercent: 50,
      fatEnergyPercent: 50,
      overlapScore: 33,
    });
    const contextText = buildNutritionSummaryContext(summary);
    expect(contextText).toContain('logged carb-fat composition: 50% carbohydrate and 50% fat energy');
    expect(contextText).toContain('no preferred center or universal target');
    expect(contextText).toContain('absolute energy, carbohydrate amount, fiber, and fat quality');
    expect(contextText).not.toContain('overlap index');
    expect(contextText).toContain('not measured Randle-cycle activity');
    expect(summary.windows.d7.fuelResponses).toMatchObject({ checkIns: 1, minimum: 6, remaining: 5, ready: false });
    expect(contextText).not.toContain('satiety');
  });

  it('keeps chat context bounded and aggregate-only even when meals contain private media and detail', () => {
    const privateMeal = {
      ...meal('2026-08-23T12:00:00.000Z', 720, 38),
      localDate: '2026-08-23',
      localTimeMinutes: 720,
      mealType: 'lunch',
      name: 'PRIVATE_MEAL_NAME',
      note: 'PRIVATE_MEAL_NOTE',
      components: [{ name: 'PRIVATE_INGREDIENT', amount: 100, unit: 'g' }],
      images: [{ fileName: 'PRIVATE_IMAGE.jpg', dataUrl: 'data:image/jpeg;base64,PRIVATE_BYTES' }],
      source: { kind: 'ai-photo-estimate', rawText: 'PRIVATE_SOURCE_TEXT' },
    };
    const summary = computeNutritionSummary([privateMeal], { now: new Date('2026-08-23T13:00:00.000Z') });

    const contextText = buildNutritionSummaryContext(summary);
    expect(contextText).toContain('[section:nutrition]');
    expect(contextText.length).toBeLessThanOrEqual(NUTRITION_CONTEXT_CHAR_LIMIT);
    for (const privateValue of ['PRIVATE_MEAL_NAME', 'PRIVATE_MEAL_NOTE', 'PRIVATE_INGREDIENT', 'PRIVATE_IMAGE.jpg', 'PRIVATE_BYTES', 'PRIVATE_SOURCE_TEXT', 'data:image']) {
      expect(contextText).not.toContain(privateValue);
    }

    const history = computeNutritionHistory([privateMeal], { rangeKey: 'all', now: new Date('2026-08-23T13:00:00.000Z') });
    const prompt = buildNutritionHistoryAnalysisPrompt(history);
    expect(prompt).toContain('all recorded history');
    expect(prompt).toContain('coverage-limited aggregate');
    for (const privateValue of ['PRIVATE_MEAL_NAME', 'PRIVATE_MEAL_NOTE', 'PRIVATE_INGREDIENT', 'PRIVATE_IMAGE.jpg', 'PRIVATE_BYTES', 'PRIVATE_SOURCE_TEXT', 'data:image']) {
      expect(prompt).not.toContain(privateValue);
    }
  });

});
