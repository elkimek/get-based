// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { computeNutritionHistory } from '../js/nutrition-summary.js';
import { projectNutritionGoal, projectNutritionRing, projectNutritionFuel, projectNutritionHistory, projectNutritionMealRow, type NutritionPresentationProps } from '../js/nutrition-presentation-model.js';
import { renderHTML } from '../js/components/NutritionPresentation.svelte.html.js';
import History, { mount, unmount, flushSync } from '../js/components/NutritionHistory.svelte.native.js';
import type { NutritionRenderMeal } from '../js/nutrition-render.js';
import { buildNutritionFluidView, buildNutritionTargetsView } from '../js/nutrition-entry-model.js';
import { projectNutritionDashboard } from '../js/nutrition-dashboard-model.js';
import { projectNutritionMealDetail } from '../js/nutrition-meal-detail-model.js';
import { projectNutritionComparisonPicker, projectNutritionComparisonProgress } from '../js/nutrition-benchmark-model.js';
import { projectNutritionComparisonResults } from '../js/nutrition-comparison-results-model.js';
import { projectEditableIngredients, projectReviewChecks } from '../js/nutrition-editor-review-model.js';
import { projectNutritionEditor, type NutritionMealModelView } from '../js/nutrition-editor-model.js';
import { expectNativeReview } from './helpers/native-review-dom.js';
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

const load = createRequire(import.meta.url);
const recordedAt = new Date(2026, 9, 7, 11);
const savedMeal = {...meal(1, '2026-10-07'), name: 'Saved <em>meal</em>', note: 'Private synthetic note'};
const savedModel: NutritionMealModelView = {
  purpose: 'Photo model', accessibleLabel: 'Meal photo analysis model',
  selectedValue: '', automatic: true, available: false, automaticAvailable: false,
  automaticLabel: 'Follow chat assistant · unavailable', savedChoice: '',
  options: [], provider: 'Unavailable', price: '', status: 'Unavailable',
};
const benchmark = projectNutritionComparisonPicker([], [], false);
const progress = projectNutritionComparisonProgress(1, 2, 'Compare estimates', 'running');
const targets = {proteinG: 100, configured: true, energyKcal: 2000, widgetNutrients: ['proteinG']};
const selectedPhoto = 'data:image/png;base64,AA';

const surfaces: Array<{label: string; props: NutritionPresentationProps; text: string; focus?: string}> = [
  {label: 'goal', props: {kind: 'goal', view: projectNutritionGoal({dailyAverages: {proteinG: 0}}, targets, field)}, text: '0 g recorded'},
  {label: 'ring', props: {kind: 'ring', view: projectNutritionRing('Energy', 0, 2000, 'kcal')}, text: 'Energy'},
  {label: 'unmeasured fuel', props: {kind: 'fuel', view: projectNutritionFuel(null)}, text: 'Missing values stay unknown'},
  {label: 'meal row', props: {kind: 'meal', view: projectNutritionMealRow(savedMeal, 'history')}, text: savedMeal.name},
  {
    label: 'meal history',
    props: {kind: 'history', view: projectNutritionHistory(computeNutritionHistory([savedMeal], {rangeKey: 'all'}), targets, [field], false)},
    text: savedMeal.name,
  },
  {
    label: 'meal detail',
    props: {kind: 'detail', view: projectNutritionMealDetail(savedMeal)},
    text: savedMeal.name,
  },
  {
    label: 'targets',
    props: {kind: 'entry', view: buildNutritionTargetsView({}, {returnTo: 'history'})},
    text: 'No weight measurement yet',
  },
  {label: 'water entry', props: {kind: 'entry', view: buildNutritionFluidView(recordedAt)}, text: 'Log a drink'},
  {
    label: 'empty dashboard',
    props: {kind: 'dashboard', view: projectNutritionDashboard(null, targets, recordedAt)},
    text: 'intake',
  },
  {label: 'analysis tabs', props: {kind: 'editor-navigation', part: 'tabs'}, text: 'Nutrition label'},
  {label: 'saved records', props: {kind: 'editor-navigation', part: 'records'}, text: 'Browse meals'},
  {
    label: 'edit a saved meal',
    props: {kind: 'editor', view: projectNutritionEditor({editingMealId: '1', returnTo: 'history'}, '2026-10-07T11:00', false, false, savedModel)},
    text: 'Save changes', focus: '[data-nutrition-action="return-history"]',
  },
  {label: 'model picker', props: {kind: 'meal-model', view: savedModel}, text: 'Unavailable'},
  {label: 'selected photo', props: {kind: 'meal-photo', view: {urls: [selectedPhoto], kind: 'selected'}}, text: '1 view · change'},
  {
    label: 'cancellable progress',
    props: {kind: 'analysis-progress', view: {label: 'Analyzing meal', detail: 'Reading selected photo', percent: 50, state: 'running', accessibleLabel: 'Meal analysis', cancel: true}},
    text: 'Cancel analysis',
  },
  {
    label: 'remaining checks', props: {kind: 'editor-feedback', view: projectReviewChecks({analysis: {warnings: ['Review <em>portion</em>']}})},
    text: 'Review <em>portion</em>',
  },
  {
    label: 'editable ingredients', props: {kind: 'editable-ingredients', rows: projectEditableIngredients([{name: 'Synthetic ingredient', quantityG: 50}])},
    text: '',
  },
  {label: 'benchmark workspace', props: {kind: 'benchmark', view: benchmark}, text: 'Meal benchmark'},
  {label: 'comparison picker', props: {kind: 'comparison-picker', view: benchmark}, text: '0 providers available'},
  {label: 'benchmark photo', props: {kind: 'benchmark-photo', urls: [selectedPhoto]}, text: ''},
  {label: 'benchmark progress', props: {kind: 'benchmark-status', view: progress}, text: '1 of 2 finished'},
  {label: 'results before analysis', props: {kind: 'comparison-results', view: projectNutritionComparisonResults()}, text: ''},
];

it.each(surfaces)('dispatches the native Nutrition $label with the same visible control contract', async ({props, text, focus}) => {
  const component = load('../js/components/NutritionPresentation.svelte.native.js') as typeof import('../js/components/NutritionPresentation.svelte.native.js');
  const html = renderHTML(props);
  const reference = host(html);
  const actions = (root: HTMLElement) => [...root.querySelectorAll('[data-nutrition-action]')].map(action =>
    [action.getAttribute('data-nutrition-action'), action.getAttribute('data-nutrition-id')],
  );
  await expectNativeReview(html, root => {
    const mounted = component.mount(component.default, {target: root, props});
    component.flushSync();
    return () => component.unmount(mounted);
  }, root => {
    if (text) expect(root.textContent).toContain(text);
    expect(actions(root)).toEqual(actions(reference));
    expect(root.querySelector('em, script, [onerror]')).toBeNull();
    if (props.kind === 'meal-photo' || props.kind === 'benchmark-photo') {
      expect(root.querySelectorAll('img')).toHaveLength(1);
      expect(root.querySelector('img')?.getAttribute('src')).toBe(selectedPhoto);
    }
    if (props.kind === 'editable-ingredients') {
      expect([...root.querySelectorAll<HTMLInputElement>('input')].map(input => input.value)).toContain('50');
    }
  }, focus);
});
