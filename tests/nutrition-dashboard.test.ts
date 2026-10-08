// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { projectNutritionDashboard, projectNutritionFuelDashboard, nutritionDashboardGoalFields } from '../js/nutrition-dashboard-model.js';
import { resolveNutritionTargets } from '../js/nutrition-targets.js';
import { NUTRIENT_DEFINITIONS } from '../js/nutrition-nutrient-registry.js';
import { renderHTML } from '../js/components/NutritionPresentation.svelte.html.js';
function host(view: Parameters<typeof projectNutritionDashboard>[0], targets = resolveNutritionTargets({})) {
  const root = document.createElement('div'); root.innerHTML = renderHTML({ kind: 'dashboard', view: projectNutritionDashboard(view, targets) }); return root;
}
it('keeps seven local calendar days across month boundaries without changing source data', () => {
  const summary = { totalMeals: 3, windows: { d7: { loggedDays: 2, loggedDayKeys: ['2024-02-24', '2024-02-29', '2024-02-23'], dailyAverages: { energyKcal: 0 } } } };
  const before = structuredClone(summary), view = projectNutritionDashboard(summary, resolveNutritionTargets({}), new Date(2024, 2, 1, 12));
  expect(view.days.map(day => day.key)).toEqual(['2024-02-24','2024-02-25','2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01']);
  expect(view.days.filter(day => day.logged).map(day => day.key)).toEqual(['2024-02-24','2024-02-29']); expect(view.ring.value).toBe('0'); expect(summary).toEqual(before);
});
it('projects the full registry in canonical order and keeps non-target nutrients observational', () => {
  const keys = NUTRIENT_DEFINITIONS.map(field => field.key);
  expect(nutritionDashboardGoalFields([...keys].reverse().concat(['proteinG','unknown'])).map(field => field[0])).toEqual(keys.filter(key => key !== 'energyKcal'));
  const targets = resolveNutritionTargets({ nutritionTargets: { configured: true, widgetNutrients: ['ironMg','fluidMl','proteinG'], proteinBasis: 'active' }, wearableSummary: { metrics: { weight: { latest: 80, primarySource: 'fitbit' } } } });
  const view = projectNutritionDashboard({ totalMeals: 1, windows: { d7: { dailyAverages: { proteinG: 0, ironMg: 0 } } } }, targets);
  expect(view.goals.find(goal => goal.label === 'Protein')?.comparison).toBe('0 g recorded · 128 guide');
  expect(view.goals.find(goal => goal.label === 'Iron')).toMatchObject({ observation: true, grade: null, comparison: '0 mg recorded avg' });
  expect(view.goals.find(goal => goal.fluid)?.comparison).toContain('— recorded');
});
it('preserves empty, unconfigured and configured widget actions while escaping dynamic coverage text', () => {
  const empty = host(null); expect(empty.textContent).toContain('No intake logged yet'); expect(empty.querySelector('[data-nutrition-action="open-history"]')).toBeNull();
  const root = host({ totalMeals: 2, windows: { d7: { loggedDays: '<img src=x onerror=alert(1)>' } } });
  expect(root.textContent).toContain('<img src=x onerror=alert(1)> of 7 days'); expect(root.querySelector('img')).toBeNull();
  expect(root.querySelectorAll('[data-nutrition-action="open-targets"]')).toHaveLength(2); expect(root.textContent).toContain('Using starter guides');
  const configured = host({ totalMeals: 1 }, resolveNutritionTargets({ nutritionTargets: { configured: true, widgetNutrients: [] } }));
  expect(configured.querySelector('.nutrition-widget-starter-note')).toBeNull(); expect(configured.textContent).toContain('Choose nutrients in Customize.');
});
it('keeps food counts separate from drinks in fuel evidence and never invents missing composition', () => {
  const unknown = projectNutritionFuelDashboard({ totalMeals: 4, windows: { d7: { foodMeals: 0, meals: 4 } } }, resolveNutritionTargets({}));
  expect(unknown.kind === 'fuel' && unknown.fuel?.available).toBe(false);
  const known = projectNutritionFuelDashboard({ totalMeals: 4, windows: { d7: { foodMeals: 2, meals: 4, fuelOverlap: { carbEnergyPercent: 64, fatEnergyPercent: 36, completeMeals: 2, contributingMeals: 2, carbFatEnergyKcal: 900 } } } }, resolveNutritionTargets({}));
  expect(known.kind === 'fuel' && known.fuel).toMatchObject({ carb: 64, fat: 36, meta: 'Avg 450 kcal/meal from carbs + fat · 2 of 2 meals included' });
});
