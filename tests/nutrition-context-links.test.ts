// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { renderNutritionCircadianExtension, renderNutritionDietExtension } from '../js/nutrition-context-card-extensions.js';
import Link, { mount, unmount, flushSync } from '../js/components/ContextNutritionLink.svelte.native.js';
const previousSummary = state.nutritionSummary, previousImported = state.importedData;
afterEach(() => { state.nutritionSummary = previousSummary; state.importedData = previousImported; localStorage.clear(); });
function summary(value: unknown) {
  (state as { nutritionSummary: unknown }).nutritionSummary = value;
  (state as { importedData: unknown }).importedData = { contextSourceSettings: {}, nutritionContextDays: 7 };
}
function host(html: string) { const element = document.createElement('div'); element.innerHTML = html; return element; }
const attributes = (action: string, options: { surface: string }) => ({'data-context-card-action': action, 'data-context-card-surface': options.surface});
describe('authored nutrition context links', () => {
  it('keeps summary text literal and retains food-only meal counts, singular copy and coverage', () => {
    summary({ totalMeals: 3, windows: { d7: { meals: 3, foodMeals: 1, loggedDays: '<img src=x onerror=alert(1)>' } } });
    const root = host(renderNutritionDietExtension(attributes)), button = root.querySelector('button')!;
    expect(button.type).toBe('button');
    expect(button.textContent).toContain('Detailed meal log active');
    expect(button.textContent).toContain('Replaces Typical meals · 1 logged meal · <img src=x onerror=alert(1)>/7 days');
    expect(button.dataset.contextCardAction).toBe('open-nutrition'); expect(button.dataset.contextCardSurface).toBe('meals');
    expect(root.querySelectorAll('img, script, [onerror]')).toHaveLength(0);
    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('→');
    expect(root.querySelector('[data-nutrition-action-slot]')).toBeNull();
  });
  it.each([null, { windows: {} }, { windows: { d7: { meals: 0, timing: { mealsWithTiming: 1 } } } }, { windows: { d7: { meals: 1, timing: { mealsWithTiming: 0 } } } }, { windows: { d7: { meals: 1, timing: { mealsWithTiming: 1, sleepRelative: { averageLastMealToSleepMinutes: 'bad', averageWakeToFirstMealMinutes: null } } } } }])('omits timing links without meaningful logged timing (%j)', value => {
    summary(value); let calls = 0;
    expect(renderNutritionCircadianExtension(() => { calls++; return {}; })).toBe(''); expect(calls).toBe(0);
  });
  it('preserves zero and finite sleep-relative durations and literal clock text', () => {
    summary({ windows: { d7: { meals: 1, timing: { mealsWithTiming: 1, averageFirstMealLocalTime: '<svg onload=alert(1)>', sleepRelative: { averageLastMealToSleepMinutes: 0, averageWakeToFirstMealMinutes: '125' } } } } });
    const root = host(renderNutritionCircadianExtension(attributes));
    expect(root.textContent).toContain('7-day average · first <svg onload=alert(1)> · 0h 0m before sleep · 2h 5m after wake');
    expect(root.querySelectorAll('svg, [onload]')).toHaveLength(0);
    expect(root.querySelector<HTMLButtonElement>('button')?.dataset.contextCardSurface).toBe('timing');
  });
  it('preserves caller-built action attributes including dollar replacement characters and escaped values', () => {
    summary(null);
    const root = host(renderNutritionDietExtension(() => ({'data-action': 'open', 'data-probe': '$& " &'})));
    expect(root.querySelector('button')?.getAttribute('data-probe')).toBe('$& " &');
    expect(root.querySelector('button')?.getAttribute('data-action')).toBe('open');
    expect(root.querySelector('[data-nutrition-action-slot]')).toBeNull();
    expect(root.textContent).toContain('Meals & Nutrition'); expect(root.textContent).toContain('Add variable meals and photo estimates');
  });
  it('uses the same authored escaped structure in a client mount', async () => {
    const target = document.createElement('div'); document.body.append(target);
    const instance = mount(Link, { target, props: {view: {title: '<Title>', detail: '<img src=x> & literal', surface: 'meals', attributes: attributes('open-nutrition', {surface: 'meals'})}} }); flushSync();
    expect(target.querySelector('button')?.textContent).toContain('<Title>'); expect(target.textContent).toContain('<img src=x> & literal');
    expect(target.querySelectorAll('img, script')).toHaveLength(0);
    await unmount(instance); target.remove();
  });
});
