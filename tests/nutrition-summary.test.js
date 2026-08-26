import { describe, expect, it } from 'vitest';

import { computeNutritionSummary, NUTRITION_CONTEXT_CHAR_LIMIT } from '../js/nutrition-summary.js';

function meal(eatenAt, energyKcal, proteinG, reviewed = true) {
  return { eatenAt, reviewed, nutrients: { energyKcal, proteinG } };
}

describe('nutrition rolling summaries', () => {
  it('separates missing days from zero intake and computes compact 7/30-day windows', () => {
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
    expect(summary.windows).not.toHaveProperty('d90');
  });

  it('summarizes local meal timing without retaining meal-level details', () => {
    const summary = computeNutritionSummary([
      { ...meal('2026-08-23T06:30:00.000Z', 500, 25), localDate: '2026-08-23', localTimeMinutes: 510, mealType: 'breakfast', source: { kind: 'ai-label-scan' } },
      { ...meal('2026-08-23T18:30:00.000Z', 900, 45), localDate: '2026-08-23', localTimeMinutes: 1230, mealType: 'dinner', source: { kind: 'ai-photo-estimate' } },
      { ...meal('2026-08-22T11:00:00.000Z', 600, 30), localDate: '2026-08-22', localTimeMinutes: 780, mealType: 'lunch', source: { kind: 'manual' } },
    ], { now: new Date('2026-08-23T12:00:00.000Z') });

    expect(summary.version).toBe(14);
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
    expect(summary.contextText).toContain('occasions: breakfast 1, dinner 1, lunch 1');
    expect(summary.contextText).toContain('Never infer skipped meals, under-eating');
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
    expect(summary.contextText).toContain('7-day average compared with the previous 23-day period: kcal +50%; protein g +50%');
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
    expect(summary.contextText).toContain('logged carb-fat composition: 50% carbohydrate and 50% fat energy');
    expect(summary.contextText).toContain('no preferred center or universal target');
    expect(summary.contextText).toContain('absolute energy, carbohydrate amount, fiber, and fat quality');
    expect(summary.contextText).not.toContain('overlap index');
    expect(summary.contextText).toContain('not measured Randle-cycle activity');
    expect(summary.windows.d7.fuelResponses).toMatchObject({ checkIns: 1, minimum: 6, remaining: 5, ready: false });
    expect(summary.contextText).not.toContain('satiety');
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

    expect(summary.contextText).toContain('[section:nutrition]');
    expect(summary.contextText.length).toBeLessThanOrEqual(NUTRITION_CONTEXT_CHAR_LIMIT);
    for (const privateValue of ['PRIVATE_MEAL_NAME', 'PRIVATE_MEAL_NOTE', 'PRIVATE_INGREDIENT', 'PRIVATE_IMAGE.jpg', 'PRIVATE_BYTES', 'PRIVATE_SOURCE_TEXT', 'data:image']) {
      expect(summary.contextText).not.toContain(privateValue);
    }
  });

});
