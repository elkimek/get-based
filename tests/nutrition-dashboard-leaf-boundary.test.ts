// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript/unstable/ast';
import {expect, it} from 'vitest';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
import Leaf, {mount, unmount, flushSync} from '../js/components/NutritionDashboard.svelte.native.js';
import Wrapper, {mount as mountWrapper, unmount as unmountWrapper, flushSync as flushWrapper} from '../js/components/NutritionPresentation.svelte.native.js';
import LensBody, {mount as mountLens, unmount as unmountLens, flushSync as flushLens} from '../js/components/LensWidgetBody.svelte.native.js';
import DataBody, {mount as mountData, unmount as unmountData, flushSync as flushData} from '../js/components/LensDataWidgetBody.svelte.native.js';
import {projectNutritionDashboard, projectNutritionFuelDashboard} from '../js/nutrition-dashboard-model.js';
import {resolveNutritionTargets} from '../js/nutrition-targets.js';
import type {NutritionDashboardView} from '../js/nutrition-dashboard-model.js';
import {state} from '../js/state.js';

const now = () => new Date(2026, 9, 16, 12);
const starter = () => resolveNutritionTargets({});
const configured = () => resolveNutritionTargets({nutritionTargets: {configured: true, widgetNutrients: ['proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'fluidMl', 'sodiumMg', 'ironMg']}});
const fixtures: {name: string; view(): NutritionDashboardView}[] = [
  {name: 'empty intake', view: () => projectNutritionDashboard(null, starter(), now())},
  {name: 'logged starter intake', view: () => projectNutritionDashboard({totalMeals: 3, windows: {d7: {loggedDays: 2, loggedDayKeys: ['2026-10-15', '2026-10-16'], dailyAverages: {energyKcal: 1800, proteinG: 83, carbohydrateG: 200, fatG: 60, fiberG: 18}}}}, starter(), now())},
  {name: 'configured recorded zero', view: () => projectNutritionDashboard({totalMeals: 1, windows: {d7: {loggedDays: 1, dailyAverages: {energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, fluidMl: 0, sodiumMg: 0, ironMg: 0}}}}, configured(), now())},
  {name: 'configured unknown and expanded observations', view: () => projectNutritionDashboard({totalMeals: 2, windows: {d7: {loggedDays: 1, dailyAverages: {energyKcal: 2400, proteinG: 100, sodiumMg: 2700}}}}, configured(), now())},
  {name: 'configured no nutrient rows', view: () => projectNutritionDashboard({totalMeals: 1}, resolveNutritionTargets({nutritionTargets: {configured: true, widgetNutrients: []}}), now())},
  {name: 'unknown food fuel', view: () => projectNutritionFuelDashboard({totalMeals: 4, windows: {d7: {foodMeals: 0, meals: 4}}}, starter())},
  {name: 'recorded food fuel', view: () => projectNutritionFuelDashboard({totalMeals: 4, windows: {d7: {foodMeals: 2, meals: 4, fuelOverlap: {carbEnergyPercent: 64, fatEnergyPercent: 36, completeMeals: 2, contributingMeals: 2, carbFatEnergyKcal: 900}}}}, configured())},
  {name: 'null fuel payload', view: () => ({kind: 'fuel', fuel: null})},
  {name: 'literal hostile coverage and labels', view: () => {
    const view = projectNutritionDashboard({totalMeals: 1, windows: {d7: {loggedDays: '<img src=x onerror=alert(1)>'}}}, configured(), now());
    view.ring.label = '<button data-foreign>Literal & private</button>';
    view.goals[0]!.label = '<svg onload=alert(1)>Protein';
    return view;
  }},
];
function storage() {return {local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])), session: Object.fromEntries(Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)]))};}
function snapshot(root: HTMLElement) {
  const owned = root.querySelector<HTMLElement>('[data-nutrition-dashboard-view]');
  if (!owned) throw new Error('Missing genuine NutritionDashboard root');
  return {html: owned.outerHTML, text: owned.textContent, controls: [...owned.querySelectorAll<HTMLButtonElement>('button')].map(button => ({type: button.type, disabled: button.disabled, tabIndex: button.tabIndex, action: button.dataset.nutritionAction, text: button.textContent, attrs: [...button.attributes].map(attribute => [attribute.name, attribute.value])}))};
}

for (const fixture of fixtures) it(`${fixture.name}: actual direct leaf and existing wrapper retain the complete owned DOM, controls and input data`, async () => {
  const view = fixture.view(), before = structuredClone(view), profile = state.currentProfile, imported = state.importedData, profileBefore = structuredClone(imported), stored = storage();
  const roots = Array.from({length: 4}, () => document.createElement('div')); roots.forEach(root => document.body.append(root));
  // Each compatibility artifact owns its own Svelte runtime and lifecycle exports.
  const wrapped = mountWrapper(Wrapper, {target: roots[0]!, props: {kind: 'dashboard', view}});
  const direct = mount(Leaf, {target: roots[1]!, props: {view}});
  const lens = mountLens(LensBody, {target: roots[2]!, props: {content: {kind: view.kind === 'fuel' ? 'fuel' : 'nutrition', view}}});
  const data = mountData(DataBody, {target: roots[3]!, props: {content: {kind: view.kind === 'fuel' ? 'fuel' : 'nutrition', view}}});
  const flush = () => {flushWrapper(); flushSync(); flushLens(); flushData();};
  try {
    flush(); const expected = snapshot(roots[0]!);
    // Preserve whole raw outputs, including Svelte's outer wrapper markers.
    // Equality below applies to the complete actual Dashboard-owned element;
    // no comments, fields, classes, styles or actions inside it are normalized.
    const output = process.env['GETBASED_NUTRITION_LEAF_RECEIPTS'];
    if (output) {
      fs.mkdirSync(output, {recursive: true});
      fs.writeFileSync(path.join(output, fixture.name.replace(/[^a-z0-9]+/g, '-') + '.json'), JSON.stringify({
        name: fixture.name, raw: roots.map(root => root.innerHTML),
        wrapperEqualsDirectRaw: roots[0]!.innerHTML === roots[1]!.innerHTML,
        wrapperEqualsLensRaw: roots[0]!.innerHTML === roots[2]!.innerHTML,
        owned: roots.map(snapshot), view: before,
      }, null, 2) + '\n');
    }
    expect(snapshot(roots[1]!)).toEqual(expected); expect(snapshot(roots[2]!)).toEqual(expected); expect(snapshot(roots[3]!)).toEqual(expected);
    const actions: string[][] = [];
    for (const root of roots) {
      const calls: string[] = [], listen = (event: Event) => {const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-nutrition-action]') : null; if (target && root.contains(target)) calls.push(target.dataset.nutritionAction!);};
      root.addEventListener('click', listen);
      for (const button of root.querySelectorAll<HTMLButtonElement>('button')) button.click();
      root.removeEventListener('click', listen); actions.push(calls);
      expect(root.querySelector('img,svg[onload],[onerror],[data-foreign]')).toBeNull();
    }
    expect(actions[1]).toEqual(actions[0]); expect(actions[2]).toEqual(actions[0]); expect(actions[3]).toEqual(actions[0]);
    expect(view).toEqual(before); expect(state.currentProfile).toBe(profile); expect(state.importedData).toBe(imported); expect(state.importedData).toEqual(profileBefore); expect(storage()).toEqual(stored);
  } finally {await unmountWrapper(wrapped); await unmount(direct); await unmountLens(lens); await unmountData(data); flush(); roots.forEach(root => root.remove());}
});

it.each(['nutrition', 'fuel'] as const)('%s keeps the original null-view guard without rendering any Dashboard subtree', async kind => {
  const target = document.createElement('div'); document.body.append(target);
  const instance = mountLens(LensBody, {target, props: {content: {kind, view: null}}});
  try {flushLens(); expect(target.querySelector('[data-nutrition-dashboard-view],button')).toBeNull(); expect(target.textContent).toBe('');}
  finally {await unmountLens(instance); target.remove();}
});

function runtimeImports(file: string) {
  const raw = fs.readFileSync(file, 'utf8'), source = file.endsWith('.svelte') ? raw.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] || '' : raw;
  return withParsedSource(source, file + (file.endsWith('.svelte') ? '.ts' : ''), node => node.statements.flatMap(statement => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const clause = statement.importClause;
    if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return [];
    if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every(binding => binding.isTypeOnly)) return [];
    return [statement.moduleSpecifier.text];
  }));
}

it('the Dashboard-only leaf boundary excludes the umbrella and editor/history/benchmark/AI/storage owners', () => {
  const body = path.resolve('js/components/LensDataWidgetBody.svelte'), imports = runtimeImports(body);
  expect(imports).toContain('./NutritionDashboard.svelte'); expect(imports).not.toContain('./NutritionPresentation.svelte');
  const source = fs.readFileSync(body, 'utf8');
  expect(source).toContain("content.kind === 'nutrition' || content.kind === 'fuel'}{#if content.view}<NutritionDashboard view={content.view}/>{/if}");
  const seen = new Set<string>();
  function walk(file: string) {
    if (seen.has(file)) return; seen.add(file);
    for (const relative of runtimeImports(file)) {
      if (!relative.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), relative).replace(/\.js$/, '.ts');
      if (fs.existsSync(resolved)) walk(resolved); else throw new Error('Missing canonical dependency: ' + resolved);
    }
  }
  walk(path.resolve('js/components/NutritionDashboard.svelte'));
  const closure = [...seen].map(file => path.relative(process.cwd(), file));
  expect(closure).toEqual(expect.arrayContaining(['js/components/NutritionDashboard.svelte', 'js/components/NutritionGoalRow.svelte', 'js/components/NutritionTargetRing.svelte', 'js/components/NutritionFuelCard.svelte']));
  const forbidden = /(?:Nutrition(?:Presentation|MealEditor|History|ComparisonResults|ComparisonPicker|Benchmark|Entry|MealDetail)\.svelte$|js\/(?:nutrition|nutrition-store|nutrition-analysis|nutrition-comparison-ui|api|ai-feature-routing)\.ts$)/;
  expect(closure.filter(file => forbidden.test(file))).toEqual([]);
});
