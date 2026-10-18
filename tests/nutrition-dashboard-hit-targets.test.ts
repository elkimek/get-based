// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import postcss, {type Rule} from 'postcss';
import {expect, it} from 'vitest';
import {renderHTML} from '../js/components/NutritionPresentation.svelte.html.js';
import {projectNutritionDashboard, projectNutritionFuelDashboard} from '../js/nutrition-dashboard-model.js';
import {resolveNutritionTargets} from '../js/nutrition-targets.js';
import type {NutritionDashboardView} from '../js/nutrition-dashboard-model.js';

// Inspect actual emitted selectors against actual rendered controls. Browser
// acceptance remains responsible for geometry, theme contrast and overflow.
function targetRules() {
  const rules: Rule[] = [];
  postcss.parse(readFileSync('css/nutrition.css', 'utf8')).walkRules(rule => {
    if (!rule.selector.includes('nutrition-dashboard')) return;
    const dimensions = rule.nodes.filter(node => node.type === 'decl' && ['min-height', 'min-width'].includes(node.prop));
    if (!dimensions.length) return;
    expect(rule.selector).toContain('[data-nutrition-dashboard-view]');
    for (let parent: Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
      expect(parent.type === 'atrule' && parent.name === 'media', 'Dashboard action minimums apply on every pointer and viewport').toBe(false);
    }
    expect(rule.nodes.every(node => node.type === 'decl' && ['min-height', 'min-width'].includes(node.prop)
      && node.value === '44px' && !node.important), 'Target rules change only minimum hit area, without typography or spacing').toBe(true);
    rules.push(rule);
  });
  expect(rules).toHaveLength(2);
  return rules;
}
function dimensions(element: Element, rules: Rule[]) {
  return rules.filter(rule => element.matches(rule.selector)).flatMap(rule => rule.nodes.flatMap(node => node.type === 'decl' ? [[node.prop, node.value]] : []));
}
function host(view: NutritionDashboardView) {
  const root = document.createElement('div');
  root.innerHTML = renderHTML({kind: 'dashboard', view});
  return root;
}
const summary = {totalMeals: 2, windows: {d7: {loggedDays: 1, dailyAverages: {energyKcal: 1800, proteinG: 80, fluidMl: 700}}}};
for (const configured of [false, true]) it(`${configured ? 'configured' : 'starter'} Dashboard controls have unconditional scoped44px hit areas`, () => {
  const targets = resolveNutritionTargets({nutritionTargets: {configured, widgetNutrients: ['proteinG', 'fluidMl']}});
  const root = host(projectNutritionDashboard(summary, targets, new Date(2026, 9, 16, 12)));
  const controls = [...root.querySelectorAll('button,summary')];
  expect(controls.length).toBeGreaterThanOrEqual(3);
  if (configured) expect(root.querySelector('[data-nutrition-action="open-fluid-log"]')).not.toBeNull();
  else expect(root.querySelector('.nutrition-widget-starter-note button')).not.toBeNull();
  const rules = targetRules();
  for (const control of controls) expect(dimensions(control, rules), control.textContent || '').toEqual(expect.arrayContaining([['min-height', '44px'], ['min-width', '44px']]));
});
it('Fuel disclosure receives the same target only inside its Dashboard owner', () => {
  const view = projectNutritionFuelDashboard({totalMeals: 2, windows: {d7: {foodMeals: 2, meals: 2, fuelOverlap: {carbEnergyPercent: 60, fatEnergyPercent: 40, completeMeals: 2, contributingMeals: 2, carbFatEnergyKcal: 900}}}}, resolveNutritionTargets({}));
  if (view.kind !== 'fuel' || !view.fuel) throw new Error('Expected a real fuel view');
  view.fuel.compact = false;
  const root = host(view), disclosure = root.querySelector('summary');
  expect(disclosure).not.toBeNull();
  const rules = targetRules();
  expect(dimensions(disclosure!, rules)).toEqual(expect.arrayContaining([['min-height', '44px'], ['min-width', '44px']]));
  const unscoped = disclosure!.cloneNode(true) as HTMLElement;
  expect(dimensions(unscoped, rules)).toEqual([]);
});
