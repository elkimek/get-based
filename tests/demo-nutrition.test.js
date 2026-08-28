import { describe, expect, it } from 'vitest';

import { addDemoNutrition, DEMO_NOTE } from '../js/demo-nutrition.js';
import { nutrientFieldsForGroup } from '../js/nutrition-nutrient-registry.js';
import { computeNutritionSummary } from '../js/nutrition-summary.js';

const now = new Date('2026-08-27T12:00:00.000Z');

function demo(sex) {
  return addDemoNutrition({ contextSourceSettings: { labs: true } }, sex, { now });
}

describe('Alex and Sarah demo meal histories', () => {
  it.each([
    ['male', 'alex'],
    ['female', 'sarah'],
  ])('builds 30 rolling completed days of reviewable nutrition for %s', (sex, profileId) => {
    const data = demo(sex);
    const meals = data.nutrition.meals;
    const dates = new Set(meals.map(meal => meal.localDate));
    const ids = new Set(meals.map(meal => meal.id));
    const sources = new Set(meals.map(meal => meal.source.kind));
    const summary = computeNutritionSummary(meals, { now });

    expect(meals.length).toBeGreaterThanOrEqual(15);
    expect(dates).toHaveLength(30);
    expect(ids).toHaveLength(meals.length);
    expect(meals.every(meal => meal.id.startsWith(`demo-${profileId}-`))).toBe(true);
    expect(meals.every(meal => meal.note === DEMO_NOTE && meal.reviewed === true)).toBe(true);
    expect(meals.every(meal => meal.images.length === 0)).toBe(true);
    expect(sources).toEqual(new Set(['ai-photo-estimate', 'ai-label-scan', 'manual-water']));
    expect(summary.windows.d7.loggedDays).toBe(6);
    expect(summary.windows.d30.loggedDays).toBe(29);
    expect(summary.windows.d30.meals).toBeLessThan(meals.length);
    expect(summary.windows.d7.dailyAverages.energyKcal).toBeGreaterThan(1200);
    expect(summary.windows.d7.dailyAverages.proteinG).toBeGreaterThan(70);
    expect(meals.every(meal => Date.parse(meal.eatenAt) <= now.getTime())).toBe(true);
    expect(data.nutrition.includesPhotos).toBe(false);
    expect(data.nutritionTargets.configured).toBe(true);
    expect(data.contextSourceSettings).toMatchObject({ labs: true, 'meals-nutrition': true });
    expect(data.nutritionContextDays).toBe(30);
  });

  it('keeps the profiles distinct and exercises detailed nutrients, labels, drinks, and check-ins', () => {
    const alex = demo('male');
    const sarah = demo('female');
    const alexNames = alex.nutrition.meals.map(meal => meal.name);
    const sarahNames = sarah.nutrition.meals.map(meal => meal.name);
    const sarahIronMeals = sarah.nutrition.meals.filter(meal => Number(meal.nutrients.ironMg) >= 7);
    const requiredDetailedKeys = ['fats-sugars', 'minerals', 'vitamins']
      .flatMap(group => nutrientFieldsForGroup(group).map(field => field.key));

    expect(alexNames).toContain('Mediterranean chicken quinoa bowl');
    expect(sarahNames).toContain('Lentil beet and arugula salad');
    expect(new Set(alexNames)).not.toEqual(new Set(sarahNames));
    expect(sarahIronMeals.length).toBeGreaterThanOrEqual(8);
    expect(alex.nutrition.meals.some(meal => requiredDetailedKeys.every(key => key in meal.nutrients))).toBe(true);
    expect(sarah.nutrition.meals.some(meal => requiredDetailedKeys.every(key => key in meal.nutrients))).toBe(true);
    expect(alex.nutrition.meals.some(meal => meal.source.kind === 'ai-label-scan' && meal.source.label)).toBe(true);
    expect(sarah.nutrition.meals.some(meal => meal.source.kind === 'manual-water' && meal.nutrients.plainWaterMl)).toBe(true);
    expect(alex.nutrition.meals.some(meal => meal.responseCheckIn?.satiety2h === 3)).toBe(true);
    expect(sarah.nutritionTargets.widgetNutrients).toContain('ironMg');
  });

  it('uses profile-appropriate timing while keeping generated dates current', () => {
    const alex = computeNutritionSummary(demo('male').nutrition.meals, { now });
    const sarah = computeNutritionSummary(demo('female').nutrition.meals, { now });

    expect(alex.windows.d7.timing.averageFirstMealMinutes).toBeGreaterThanOrEqual(690);
    expect(sarah.windows.d7.timing.averageFirstMealMinutes).toBeLessThan(540);
    expect(alex.windows.d7.timing.averageFastingWindowMinutes).toBe(990);
    expect(sarah.windows.d7.timing.averageFastingWindowMinutes).toBe(790);
    expect([...new Set(demo('male').nutrition.meals.map(meal => meal.localDate))].sort().at(-1)).toBe('2026-08-26');
  });
});
