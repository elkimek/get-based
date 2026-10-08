import { expect, it } from 'vitest';
import { buildNutritionTargetsView, buildNutritionFluidView, fluidDraftError, fluidPreview, mealFromFluidDraft, targetProteinPreview } from '../js/nutrition-entry-model.js';
import { NUTRITION_KEYS } from '../js/nutrition-summary.js';
it('projects every tracked nutrient and weight-aware guides without retaining full meal/profile records', () => {
  const profile = { wearableSummary: { metrics: { weight: { latest: 80, primarySource: 'fitbit' } } }, nutritionMeals: [{ private: 'meal' }] };
  const before = structuredClone(profile), view = buildNutritionTargetsView(profile, { returnTo: 'history' });
  expect(view.groups.flatMap(group => group.nutrients.map(field => field.key)).sort()).toEqual(NUTRITION_KEYS.filter(key => key !== 'energyKcal').sort());
  expect(view.profile).not.toHaveProperty('nutritionMeals'); expect(view.weight).toBe('80 kg · Fitbit'); expect(view.returnTo).toBe('history');
  expect(targetProteinPreview(view.profile, { ...view.targets, proteinBasis: 'active' })).toContain('128 g/day');
  expect(targetProteinPreview(view.profile, { ...view.targets, proteinBasis: 'fixed', proteinFixedG: 95 })).toContain('95 g/day');
  expect(profile).toEqual(before);
});
it('keeps beverage volume, local timing, custom labels and plain water semantics distinct', () => {
  const initial = buildNutritionFluidView(new Date('2026-10-08T10:30:00Z')).initial;
  expect(fluidPreview(initial)).toMatchObject({ title: '350 mL water', button: 'Log 350 mL' });
  const water = mealFromFluidDraft({ ...initial, amount: 250.25, at: '2026-10-08T10:30', label: '  Sparkling water  ' });
  expect(water).toMatchObject({ name: 'Sparkling water', nutrients: { fluidMl: 250.3, plainWaterMl: 250.3 }, localDate: '2026-10-08', localTimeMinutes: 630, source: { kind: 'manual-water', nutrientBasis: 'user-entered' }, images: [] });
  expect(mealFromFluidDraft({ ...initial, kind: 'other' }).nutrients).not.toHaveProperty('plainWaterMl');
  expect(fluidPreview({ ...initial, kind: 'tea-coffee' }).detail).toContain('plain-water total stays unchanged');
});
it('rejects missing, nonfinite, zero, excessive and invalid-date drink values without fabricating nutrients', () => {
  const initial = buildNutritionFluidView().initial;
  for (const amount of [undefined, NaN, Infinity, 0, -1, 10001]) {
    expect(fluidDraftError({ ...initial, amount })?.field).toBe('nutrition-fluid-amount');
    expect(() => mealFromFluidDraft({ ...initial, amount })).toThrow('drink amount');
  }
  expect(fluidDraftError({ ...initial, at: '' })?.field).toBe('nutrition-fluid-at');
  expect(fluidDraftError({ ...initial, amount: 10000 })).toBeNull();
});
