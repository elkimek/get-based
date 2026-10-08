// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { computeNutritionHistory } from '../js/nutrition-summary.js';
import { projectNutritionGoal, projectNutritionRing, projectNutritionFuel, projectNutritionHistory, projectNutritionMealRow } from '../js/nutrition-presentation-model.js';
import { renderHTML } from '../js/components/NutritionPresentation.svelte.html.js';
import History, { mount, unmount, flushSync } from '../js/components/NutritionHistory.svelte.native.js';
import type { NutritionRenderMeal } from '../js/nutrition-render.js';
function host(html: string) { const root = document.createElement('div'); root.innerHTML = html; return root; }
const field = ['proteinG', 'Protein', 'g', 'proteinG', 'goal'] as const;
function meal(id: number, day: string): NutritionRenderMeal {
  return { id: String(id), name: `Meal ${id}`, eatenAt: `${day}T12:00:00Z`, localDate: day, nutrients: { energyKcal: 500, proteinG: 20, carbohydrateG: 50, fatG: 20 } };
}
describe('authored nutrition projections and compatibility HTML', () => {
  it('distinguishes unknown, zero, starter guides and configured target attainment', () => {
    const unknown = projectNutritionGoal({}, { proteinG: 100 }, field);
    expect(unknown.comparison).toBe('— recorded · 100 g guide'); expect(unknown.grade).toBeNull(); expect(unknown.percent).toBe(0);
    const zero = projectNutritionGoal({ dailyAverages: { proteinG: 0 } }, { proteinG: 100, configured: true }, field);
    expect(zero.grade).toEqual({ tone: 'poor', label: 'Well below target' }); expect(host(renderHTML({ kind: 'goal', view: zero })).querySelector('.nutrition-goal-grade')?.textContent).toBe('Well below target'); expect(zero.comparison).toContain('0 g recorded');
    expect(projectNutritionGoal({ dailyAverages: { proteinG: 100 } }, { proteinG: 100 }, field).grade).toBeNull();
    expect(projectNutritionGoal({ dailyAverages: { proteinG: 100 } }, { proteinG: 100, configured: true }, field).grade?.tone).toBe('excellent');
  });
  it.each([['sodiumMg', 'Sodium', 'mg', 'sodiumMg', 'limit'], ['fiberG', 'Fiber', 'g', 'fiberG', 'minimum'], ['fluidMl', 'Logged drinks', 'ml', 'fluidMl', 'fluid']])('keeps %s target semantics and truthful partial coverage', (key, label, unit, target, kind) => {
    const view = projectNutritionGoal({ dailyAverages: { [key]: 100 }, nutrientCoverage: { [key]: { completeDays: 2 } } }, { [target]: 100, configured: true }, [key, label, unit, target, kind]);
    expect(view.grade?.tone).toBe(kind === 'limit' ? 'good' : 'excellent'); expect(view.note).toContain('2 days'); expect(view.fluid).toBe(kind === 'fluid');
  });
  it('never grades optional observations and preserves zero rings', () => {
    const view = projectNutritionGoal({ dailyAverages: { ironMg: 0 } }, { configured: true }, ['ironMg', 'Iron', 'mg', '', 'observe']);
    expect(view.observation).toBe(true); expect(view.grade).toBeNull(); expect(view.comparison).toBe('0 mg recorded avg');
    const ring = projectNutritionRing('Energy', 0, 2000, 'kcal'); expect(ring.value).toBe('0'); expect(ring.grade?.tone).toBe('poor'); expect(ring.aria).toContain('days may be partial');
  });
  it('keeps missing fuel unknown and its explanatory safeguards', () => {
    expect(projectNutritionFuel(null, { scope: 'meal' })).toBeNull();
    expect(host(renderHTML({ kind: 'fuel', view: projectNutritionFuel(null) })).textContent).toContain('Missing values stay unknown');
    const view = projectNutritionFuel({ carbEnergyPercent: 150, fatEnergyPercent: -20, totalMeals: 4, completeMeals: 2, carbFatEnergyKcal: 1000, contributingMeals: 2 });
    expect(view).toMatchObject({ carb: 100, fat: 0, meta: 'Avg 500 kcal/meal from carbs + fat · 2 of 4 meals included' });
    const root = host(renderHTML({ kind: 'fuel', view })); expect(root.textContent).toContain('They do not measure Randle-cycle activity');
  });
  it('does not infer a strategy when fuel inputs are unavailable', () => {
    const period = { get dailyAverages(): never { throw new Error('Unavailable inputs must not be assessed'); } };
    expect(projectNutritionFuel(null, { period })?.available).toBe(false);
  });
  it('keeps meal actions and all text literal in shared HTML', () => {
    const view = projectNutritionMealRow({ ...meal(1, '2026-10-01'), id: 'x" data-bad="yes', name: '<img src=x onerror=alert(1)>', components: [{ name: '<svg onload=alert(1)>' }] }, 'history');
    const root = host(renderHTML({ kind: 'meal', view })); expect(root.querySelectorAll('img, svg, [onerror], [data-bad]')).toHaveLength(0);
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>'); expect(root.textContent).toContain('<svg onload=alert(1)>');
    expect(root.querySelector('[data-nutrition-action="delete"]')?.getAttribute('data-nutrition-id')).toBe('x" data-bad="yes');
    expect(root.querySelector('[data-nutrition-action="detail"]')?.getAttribute('data-nutrition-origin')).toBe('history');
  });
  it('extends a page to its day boundary, preserving input order and leaving source data unchanged', () => {
    const meals = Array.from({ length: 15 }, (_, index) => meal(index, index < 13 ? '2026-10-07' : '2026-10-06'));
    const before = JSON.stringify(meals), history = { meals, visibleMealCount: 12, period: { meals: 15, loggedDays: 2 }, rangeKey: 'all' };
    const view = projectNutritionHistory(history, {}, [], true);
    expect(view.shown).toBe('13'); expect(view.remaining).toBe(2); expect(view.groups[0]?.count).toBe(13); expect(view.groups[0]?.meals.map(item => item.id)).toEqual(meals.slice(0, 13).map(item => item.id)); expect(JSON.stringify(meals)).toBe(before);
  });
  it('preserves range selection, empty ranges, storage errors and AI consent', () => {
    const history = computeNutritionHistory([], { rangeKey: '30d' });
    const view = projectNutritionHistory(history, {}, [], false, { storageError: '<b>Unavailable</b>', returnTo: 'editor' });
    const root = host(renderHTML({ kind: 'history', view })); expect(root.querySelector('[role="status"]')?.textContent).toBe('<b>Unavailable</b>');
    expect(root.querySelector('b')).toBeNull(); expect(root.textContent).toContain('rather than silently showing older data');
    expect(root.querySelector('[data-nutrition-action="return-editor"]')).not.toBeNull(); expect(view.ranges.filter(range => range.selected)).toHaveLength(1);
    const populated = { ...view, hasMeals: true, tab: 'trends' as const };
    expect(host(renderHTML({ kind: 'history', view: populated })).querySelector<HTMLButtonElement>('[data-nutrition-action="ask-history"]')?.disabled).toBe(true);
  });
  it('blocks retired client controls before their delegated action can run', async () => {
    const target = document.createElement('div'); document.body.append(target);
    let current = true, calls = 0;
    const delegated = () => calls++; document.addEventListener('click', delegated);
    const instance = mount(History, { target, props: { view: projectNutritionHistory({ period: { meals: 0 } }, {}, [], false), current: () => current } }); flushSync();
    target.querySelector<HTMLButtonElement>('[data-nutrition-action="set-history-range"]')!.click(); expect(calls).toBe(1);
    current = false; target.querySelector<HTMLButtonElement>('[data-nutrition-action="set-history-range"]')!.click(); expect(calls).toBe(1);
    document.removeEventListener('click', delegated); await unmount(instance); target.remove();
  });
});
