// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import * as ts from 'typescript/unstable/ast';
import { withParsedSource } from '../scripts/native-typescript-ast.js';
import { state } from '../js/state.js';
import { renderHTML as umbrella } from '../js/components/NutritionPresentation.svelte.html.js';
import { renderHTML as dashboard } from '../js/components/NutritionDashboard.svelte.html.js';
import { projectNutritionWidget, projectNutritionFuelWidget, renderNutritionWidget, renderNutritionFuelWidget } from '../js/nutrition-widget-runtime.js';

for (const summary of [null, {totalMeals: 0}, {totalMeals: 2, windows: {d7: {loggedDays: 2, dailyAverages: {energyKcal: 0, proteinG: 0}, loggedDayKeys: ['literal <value>'], foodMeals: 0}}}]) {
  it(`the summary facade retains the exact owned intake and fuel DOM for ${JSON.stringify(summary)}`, () => {
    const previous = state.nutritionSummary; state.nutritionSummary = summary;
    const before = structuredClone(state.importedData), original = state.importedData;
    try {
      for (const [view, render] of [[projectNutritionWidget(), renderNutritionWidget], [projectNutritionFuelWidget(), renderNutritionFuelWidget]] as const) {
        const roots = [umbrella({kind: 'dashboard', view}), dashboard({view}), render()].map(raw => { const root = document.createElement('div'); root.innerHTML = raw; return root; });
        const owned = roots.map(root => root.querySelector('[data-nutrition-dashboard-view]')!.outerHTML);
        expect(owned[1]).toBe(owned[0]); expect(owned[2]).toBe(owned[0]);
        expect(roots.map(root => root.textContent)).toEqual([roots[0]!.textContent, roots[0]!.textContent, roots[0]!.textContent]);
        expect(roots[2]!.querySelector('script,img,[onerror]')).toBeNull();
      }
      expect(state.importedData).toBe(original); expect(state.importedData).toEqual(before); expect(state.nutritionSummary).toBe(summary);
    } finally {state.nutritionSummary = previous;}
  });
}
function staticDependencies(file: string): string[] {
  const raw = fs.readFileSync(file, 'utf8'), code = file.endsWith('.svelte') ? raw.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] || '' : raw;
  return withParsedSource(code, file + (file.endsWith('.svelte') ? '.ts' : ''), source => source.statements.flatMap(statement => {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
      return [statement.moduleSpecifier.text];
    }
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) return [statement.moduleSpecifier.text];
    return [];
  }));
}
function closure(entry: string) {
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return; seen.add(file);
    for (const specifier of staticDependencies(file)) {
      if (!specifier.startsWith('.')) continue;
      const source = specifier.replace(/\.svelte\.(?:native|html)\.js$/, '.svelte').replace(/\.js$/, '.ts');
      const next = path.resolve(path.dirname(file), source); if (fs.existsSync(next)) visit(next);
    }
  }
  visit(path.resolve(entry)); return [...seen].map(file => path.relative(process.cwd(), file));
}
it('actual summary/context static closures exclude the full editor, AI, history, benchmark and encrypted store owners', () => {
  for (const entry of ['js/nutrition-widget-runtime.ts', 'js/nutrition-context.ts']) {
    const files = closure(entry); expect(files).toContain('js/components/NutritionDashboard.svelte');
    for (const forbidden of ['js/nutrition.ts', 'js/nutrition-render.ts', 'js/nutrition-analysis.ts', 'js/nutrition-history.ts', 'js/nutrition-benchmark-workspace.ts', 'js/nutrition-ai-settings.ts', 'js/nutrition-store.ts', 'js/components/NutritionPresentation.svelte']) expect(files, `${entry} imports ${forbidden}`).not.toContain(forbidden);
  }
});
it('the startup hydration port has one lazy store hop and excludes every presentation/controller owner', () => {
  const files = closure('js/nutrition-summary-runtime.ts');
  expect(files).not.toContain('js/nutrition-context.ts'); expect(files).not.toContain('js/nutrition-store.ts'); expect(files.some(file => /nutrition.*(?:render|widget|analysis|history)|\.svelte$/.test(file))).toBe(false);
});
