// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {expect, it} from 'vitest';
import {requireActualRetry, type ActualRetryGraph} from './helpers/actual-retry-graph.js';
import {renderHTML as umbrella} from '../js/components/NutritionPresentation.svelte.html.js';
import {renderHTML as fuel} from '../js/components/NutritionFuelCard.svelte.html.js';
import {renderHTML as photo} from '../js/components/NutritionMealPhoto.svelte.html.js';
import {renderHTML as picker} from '../js/components/NutritionComparisonPicker.svelte.html.js';
import {renderHTML as benchmark} from '../js/components/NutritionBenchmark.svelte.html.js';
import {renderHTML as modelPicker} from '../js/components/NutritionMealModelPicker.svelte.html.js';
import {renderHTML as editor} from '../js/components/NutritionMealEditor.svelte.html.js';
import {renderHTML as status} from '../js/components/NutritionBenchmarkStatus.svelte.html.js';
import {renderHTML as benchmarkPhoto} from '../js/components/NutritionBenchmarkPhoto.svelte.html.js';
import {renderHTML as navigation} from '../js/components/NutritionEditorNavigation.svelte.html.js';
import {renderHTML as results} from '../js/components/NutritionComparisonResults.svelte.html.js';
import {renderHTML as progress} from '../js/components/NutritionAnalysisProgress.svelte.html.js';
import {renderHTML as feedback} from '../js/components/NutritionEditorFeedback.svelte.html.js';
import {renderHTML as ingredients} from '../js/components/NutritionEditableIngredients.svelte.html.js';
import {projectNutritionFuel} from '../js/nutrition-presentation-model.js';
import {projectNutritionEditor, type NutritionMealModelView} from '../js/nutrition-editor-model.js';
import {projectEditableIngredients, projectReviewChecks, projectReviewEvidence} from '../js/nutrition-editor-review-model.js';
import {projectNutritionComparisonPicker} from '../js/nutrition-benchmark-model.js';
import {projectNutritionComparisonResults} from '../js/nutrition-comparison-results-model.js';
import type {NutritionPresentationProps} from '../js/nutrition-presentation-model.js';

// The actual builder is a Node CLI module with a shebang. Reading its export
// in native Node avoids jsdom/Vite prepending browser instrumentation to it.
const builderURL = pathToFileURL(path.resolve('scripts/build-svelte.mjs')).href;
const htmlComponentNames: unknown = JSON.parse(execFileSync(process.execPath, [
  '--max-old-space-size=512', '--input-type=module', '--eval',
  `import {HTML_COMPONENTS} from ${JSON.stringify(builderURL)}; process.stdout.write(JSON.stringify([...HTML_COMPONENTS]));`,
], {cwd: process.cwd(), encoding: 'utf8', timeout: 10_000, maxBuffer: 16_384}));
if (!Array.isArray(htmlComponentNames)) throw new Error('Expected actual HTML_COMPONENTS array');
const HTML_COMPONENTS = new Set<string>();
for (const name of htmlComponentNames) {
  if (typeof name !== 'string') throw new Error('Expected actual HTML_COMPONENTS string');
  HTML_COMPONENTS.add(name);
}

const components = {
  'fuel': 'NutritionFuelCard', 'meal-photo': 'NutritionMealPhoto',
  'comparison-picker': 'NutritionComparisonPicker', 'benchmark': 'NutritionBenchmark',
  'meal-model': 'NutritionMealModelPicker', 'editor': 'NutritionMealEditor',
  'benchmark-status': 'NutritionBenchmarkStatus', 'benchmark-photo': 'NutritionBenchmarkPhoto',
  'editor-navigation': 'NutritionEditorNavigation', 'comparison-results': 'NutritionComparisonResults',
  'analysis-progress': 'NutritionAnalysisProgress', 'editor-feedback': 'NutritionEditorFeedback',
  'editable-ingredients': 'NutritionEditableIngredients',
} as const;
type LiveKind = keyof typeof components;
type LiveProps = Extract<NutritionPresentationProps, {kind: LiveKind}>;
const arm: Record<LiveKind, number> = {
  'editable-ingredients': 0, 'editor-feedback': 1, editor: 2, 'meal-model': 3,
  'meal-photo': 4, 'editor-navigation': 5, 'analysis-progress': 6, fuel: 9,
  'comparison-results': 13, benchmark: 14, 'comparison-picker': 15,
  'benchmark-photo': 16, 'benchmark-status': 17,
};
function direct(props: LiveProps): string {
  switch (props.kind) {
    case 'fuel': return fuel({view: props.view});
    case 'meal-photo': return photo({view: props.view});
    case 'comparison-picker': return picker({view: props.view});
    case 'benchmark': return benchmark({view: props.view});
    case 'meal-model': return modelPicker({view: props.view});
    case 'editor': return editor({view: props.view});
    case 'benchmark-status': return status({view: props.view});
    case 'benchmark-photo': return benchmarkPhoto({urls: props.urls});
    case 'editor-navigation': return navigation({part: props.part});
    case 'comparison-results': return results({view: props.view});
    case 'analysis-progress': return progress({view: props.view});
    case 'editor-feedback': return feedback({view: props.view});
    case 'editable-ingredients': return ingredients({rows: props.rows});
  }
}
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
// These are the untouched authored owners before the import-only optimization.
const pins: Record<string, string> = {
  "js/components/NutritionPresentation.svelte": "36e1cfa09cb20659347e9c46ab44ac0e79136b3ed1ed9b44397defc1e33b7b8b",
  "js/components/NutritionFuelCard.svelte": "52472c5601ae349533eb9a218d9b55462351fd721d43c24952ed3c75f8e909e2",
  "js/components/NutritionMealPhoto.svelte": "93a61e68df998106c05af9d29219ddc07b9810a3f5008c1e7edf62d8cb50772a",
  "js/components/NutritionComparisonPicker.svelte": "8c98617a760166c4eb4f6c019c88dfa5c5b160418328c01b8b6234cfd0746ca1",
  "js/components/NutritionBenchmark.svelte": "eb1c56a451973cc35776bcf76378be404d9c5572d208eff2d7f1b8c7022cdc08",
  "js/components/NutritionMealModelPicker.svelte": "f9a303d8cd2538f117e9fff91c6d0406127f38d06fa9e12a709833f7a1310b0c",
  "js/components/NutritionMealEditor.svelte": "a0f94abe4c6f9fdac920eee7b31a793e8a62e02ddf949524371fb1a30e130411",
  "js/components/NutritionBenchmarkStatus.svelte": "5c6f1b9f308a27806e5afe8e05e9ba6787a9665c973ecf8c2de7543b4fd7eddd",
  "js/components/NutritionBenchmarkPhoto.svelte": "9b18b471967919f3029d3e04748459ea2faa4c2bbffe3c0b552f5138faf857a0",
  "js/components/NutritionEditorNavigation.svelte": "d233f4212a24367fc4c04c9b744281695d7d93e327d05ed4d69a3df73e23c3cd",
  "js/components/NutritionComparisonResults.svelte": "4f5d7a7da6ccd7d76efdff800cf5905b28624927096d285a63d9f87a98147d95",
  "js/components/NutritionAnalysisProgress.svelte": "8d3ddb59154a4a13506b9b31f170a34c4af6710abf3483907fcf48096df1eea0",
  "js/components/NutritionEditorFeedback.svelte": "788a99abd0191b8d854a324d815fe603f363f5e404315991fa22574a56adda30",
  "js/components/NutritionEditableIngredients.svelte": "3d6644001e6dc4fa48044d11ed0b89725b82093f1cfb649912d63e78e60ffda7"
};
// The later accessibility fixes change only these reviewed source spans. Restore
// the exact pre-fix source for its original whole-file pin; candidate HTML stays
// completely untouched and still compares byte for byte with the dispatcher.
const reviewedLeafEdits: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  "js/components/NutritionFuelCard.svelte": [
    [
      "  import { readableCopy as copy, fuelSummary, goalHead } from '../nutrition-view-classes.js';",
      "  import { copy, fuelSummary, goalHead } from '../nutrition-view-classes.js';"
    ],
    [
      "nutrition-fuel-meta gb:nutrition:text-[10px] gb:nutrition:text-secondary",
      "nutrition-fuel-meta gb:nutrition:text-[10px] gb:nutrition:text-muted"
    ]
  ],
  "js/components/NutritionMealEditor.svelte": [
    [
      "  import { button, readableCopy as copy, field, input, editorSummary as summary, focus , textAction } from '../nutrition-view-classes.js';",
      "  import { button, copy, field, input, editorSummary as summary, focus , textAction } from '../nutrition-view-classes.js';"
    ]
  ],
  "js/components/NutritionComparisonResults.svelte": [
    [
      "  import { button, readableCopy as copy, summary , readableTextAction as textAction } from '../nutrition-view-classes.js';",
      "  import { button, copy, summary , textAction } from '../nutrition-view-classes.js';"
    ]
  ],
  "js/components/NutritionEditorFeedback.svelte": [
    [
      "  import { readableCopy as copy } from '../nutrition-view-classes.js';",
      "  import { copy } from '../nutrition-view-classes.js';"
    ]
  ],
  "js/components/NutritionEditableIngredients.svelte": [
    [
      "gb:nutrition:min-[721px]:[@media(pointer:coarse)]:grid-cols-[minmax(150px,1fr)_92px_minmax(126px,.65fr)_45px]",
      "gb:nutrition:[@media(pointer:coarse)]:grid-cols-[minmax(150px,1fr)_92px_minmax(126px,.65fr)_45px]"
    ]
  ]
};
function qualifyPinnedLeafSource(file: string, source: string): string {
  if (!Object.hasOwn(pins, file)) throw new Error('Unknown Nutrition leaf owner: ' + file);
  const hash = pins[file]!;
  for (const [current, previous] of reviewedLeafEdits[file] || []) {
    if (source.split(current).length !== 2) throw new Error('Unqualified reviewed Nutrition leaf span: ' + file);
    source = source.replace(current, previous);
  }
  if (sha(source) !== hash) throw new Error('Unqualified original Nutrition leaf source: ' + file);
  return source;
}
function qualifyReference(): void {
  expect(JSON.parse(fs.readFileSync('node_modules/svelte/package.json', 'utf8')).version).toBe('5.57.1');
  for (const [file, hash] of Object.entries(pins)) expect(sha(qualifyPinnedLeafSource(file, fs.readFileSync(file, 'utf8'))), file).toBe(hash);
  for (const name of Object.values(components)) expect(HTML_COMPONENTS.has(name), name).toBe(true);
}
/**
 * Expected-only transport for the exact single if/else owner above. Svelte 5.57.1
 * wraps render().body in root anchors and the selected authored arm in another
 * pair. A direct child loses only that owner's outer arm. Never strip comments,
 * walk/normalize a candidate DOM, or change any child bytes.
 */
function expectedDirect(reference: string, kind: LiveKind): string {
  const prefix = `<!--[--><!--[${arm[kind]}-->`, suffix = '<!--]--><!--]-->';
  if (!reference.startsWith(prefix) || !reference.endsWith(suffix)) throw new Error('Unqualified Nutrition dispatcher framing');
  return '<!--[-->' + reference.slice(prefix.length, -suffix.length) + '<!--]-->';
}
const hostile = '<svg data-foreign onload="attack()">Literal & private</svg>';
const model: NutritionMealModelView = {
  purpose: 'Photo model', accessibleLabel: 'Meal photo analysis model', selectedValue: '',
  automatic: true, available: false, automaticLabel: 'Unavailable', savedChoice: '',
  options: [], provider: 'Local AI', price: 'Local', status: 'Unavailable',
};
const pickerEmpty = projectNutritionComparisonPicker([], [], false);
const pickerPopulated = {...pickerEmpty, query: hostile, selectedCount: 1, providerSummary: hostile, models: [
  {value: hostile, selected: true, current: true, searchText: hostile, providerLabel: hostile, label: hostile, price: hostile},
  {value: 'fixture-other', selected: false, current: false, searchText: 'Other', providerLabel: 'Other', label: 'Other', price: 'Unknown'},
]};
const inputs: LiveProps[] = [
  {kind: 'fuel', view: null}, {kind: 'fuel', view: projectNutritionFuel(null)},
  {kind: 'fuel', view: projectNutritionFuel({carbEnergyPercent: 0, fatEnergyPercent: 100, totalMeals: 1, completeMeals: 1, carbFatEnergyKcal: 0, contributingMeals: 1}, {scope: 'meal', compact: true})},
  {kind: 'meal-photo', view: {kind: 'stored', urls: []}},
  {kind: 'meal-photo', view: {kind: 'selected', urls: ['data:image/png;base64,AA==', 'https://fixture.invalid/" data-foreign="yes']}},
  {kind: 'comparison-picker', view: pickerEmpty}, {kind: 'comparison-picker', view: pickerPopulated},
  {kind: 'benchmark', view: pickerEmpty}, {kind: 'benchmark', view: pickerPopulated},
  {kind: 'meal-model', view: model}, {kind: 'meal-model', view: {...model, available: true, automatic: false, purpose: hostile, accessibleLabel: hostile, selectedValue: hostile, savedChoice: hostile, options: [{value: hostile, label: hostile}]}},
  {kind: 'editor', view: projectNutritionEditor({}, '2026-10-17T12:30', false, false, model)},
  {kind: 'editor', view: projectNutritionEditor({editingMealId: hostile, returnTo: 'detail', returnMealId: hostile, returnMealOrigin: hostile}, '2026-10-17T12:30', true, true, {...model, purpose: hostile})},
  {kind: 'benchmark-status', view: {kind: 'history', label: hostile, savedLabel: hostile}},
  {kind: 'benchmark-status', view: {kind: 'progress', state: 'running', label: hostile, detail: hostile, percent: 0}},
  {kind: 'benchmark-photo', urls: []}, {kind: 'benchmark-photo', urls: ['data:image/png;base64,AA==', 'https://fixture.invalid/" data-foreign="yes']},
  {kind: 'editor-navigation', part: 'tabs'}, {kind: 'editor-navigation', part: 'records'},
  {kind: 'comparison-results', view: projectNutritionComparisonResults({})},
  {kind: 'comparison-results', view: projectNutritionComparisonResults({runs: [
    {providerLabel: hostile, modelLabel: hostile, status: 'complete', durationMs: 0, result: {analysis: {mealName: hostile, components: [{name: hostile, quantityG: 0}], nutrients: {energyKcal: 0, proteinG: 0}, warnings: [hostile], assumptions: [hostile]}}},
    {providerLabel: 'Fixture', modelLabel: 'Failed', status: 'error', durationMs: 1, result: null, error: hostile},
    {providerLabel: 'Fixture', modelLabel: 'Running', status: 'running', durationMs: 2, result: null},
  ], reference: {energyKcal: 0}})},
  {kind: 'analysis-progress', view: {label: hostile, detail: hostile, state: 'running', percent: 0, accessibleLabel: hostile, cancel: true}},
  {kind: 'analysis-progress', view: {label: 'Complete', detail: '', state: 'success', percent: null, accessibleLabel: 'Analysis complete'}},
  {kind: 'editor-feedback', view: {kind: 'correction', dirty: true, reasons: hostile}},
  {kind: 'editor-feedback', view: projectReviewEvidence(undefined, null)},
  {kind: 'editor-feedback', view: projectReviewChecks({analysis: {warnings: [hostile], assumptions: [hostile]}})},
  {kind: 'editable-ingredients', rows: []},
  {kind: 'editable-ingredients', rows: projectEditableIngredients([{name: hostile, quantityG: 0, foodData: {fdcId: 1, description: hostile, dataset: hostile}}, {name: 'Unknown', quantityG: null}])},
];

it('qualifies the complete untouched dispatcher, thirteen genuine children, SDK and direct facade registrations', qualifyReference);
for (const [file, edits] of Object.entries(reviewedLeafEdits)) {
  it(`reviewed accessibility source reconstructs the unchanged whole original pin: ${file}`, () => {
    const current = fs.readFileSync(file, 'utf8');
    const original = qualifyPinnedLeafSource(file, current);
    expect(original).not.toBe(current);
    expect(sha(original)).toBe(pins[file]);
  });
  for (const [index, [current, previous]] of edits.entries()) {
    it(`source qualification rejects missing, duplicate and wrong reviewed span ${index}: ${file}`, () => {
      const source = fs.readFileSync(file, 'utf8');
      const corruptions = [source.replace(current, previous), source + '\n' + current, source.replace(current, current + ' changed')];
      for (const corrupted of corruptions) {
        expect(corrupted).not.toBe(source);
        expect(() => qualifyPinnedLeafSource(file, corrupted)).toThrow('Unqualified');
      }
    });
  }
  it(`source qualification rejects unrelated bytes after exact reviewed span restoration: ${file}`, () => {
    const source = fs.readFileSync(file, 'utf8');
    expect(() => qualifyPinnedLeafSource(file, source + '\n<!--unrelated source change-->')).toThrow('Unqualified original Nutrition leaf source');
  });
}
it('source qualification rejects changed actions, unrelated base columns and wrong owners', () => {
  const editorFile = 'js/components/NutritionMealEditor.svelte', editorSource = fs.readFileSync(editorFile, 'utf8');
  const action = 'data-nutrition-action="analyze"';
  expect(editorSource.split(action)).toHaveLength(2);
  expect(() => qualifyPinnedLeafSource(editorFile, editorSource.replace(action, 'data-nutrition-action="wrong"'))).toThrow('Unqualified original Nutrition leaf source');
  const gridFile = 'js/components/NutritionEditableIngredients.svelte', gridSource = fs.readFileSync(gridFile, 'utf8');
  const baseColumns = 'grid-cols-[minmax(150px,1fr)_92px_minmax(126px,.65fr)_30px]';
  expect(gridSource.split(baseColumns)).toHaveLength(2);
  expect(() => qualifyPinnedLeafSource(gridFile, gridSource.replace(baseColumns, baseColumns.replace('_30px]', '_31px]')))).toThrow('Unqualified original Nutrition leaf source');
  expect(() => qualifyPinnedLeafSource(gridFile, gridSource.replace('min-[721px]', 'min-[720px]'))).toThrow('Unqualified reviewed Nutrition leaf span');
  expect(() => qualifyPinnedLeafSource(editorFile, editorSource.replace('readableCopy as copy', 'wrongCopy as copy'))).toThrow('Unqualified reviewed Nutrition leaf span');
  expect(() => qualifyPinnedLeafSource('js/components/NutritionEditorFeedback.svelte', editorSource)).toThrow('Unqualified reviewed Nutrition leaf span');
  expect(() => qualifyPinnedLeafSource('js/components/Unknown.svelte', editorSource)).toThrow('Unknown Nutrition leaf owner');
  expect(() => qualifyPinnedLeafSource('toString', editorSource)).toThrow('Unknown Nutrition leaf owner');
});

for (const [index, input] of inputs.entries()) it(`${input.kind} witness ${index}: exact complete direct HTML retains every native child byte and action`, () => {
  qualifyReference();
  const before = structuredClone(input), rawReference = umbrella(input), rawActual = direct(input);
  const expected = expectedDirect(rawReference, input.kind);
  expect(rawActual).toBe(expected);
  const root = document.createElement('div'); root.innerHTML = rawActual;
  expect(root.querySelector('script,[onload],[onerror],[data-foreign]')).toBeNull();
  expect(input).toEqual(before);
  const receiptDirectory = process.env['GETBASED_NUTRITION_LEAF_RECEIPTS'];
  if (receiptDirectory) {
    fs.mkdirSync(receiptDirectory, {recursive: true});
    fs.writeFileSync(path.join(receiptDirectory, `${index}-${input.kind}.json`), JSON.stringify({rawReference, rawActual, expected, input: before}, null, 2) + '\n');
  }
});

it('closed expected-only framing rejects a wrong arm, missing root anchor and extra outer bytes', () => {
  const input: LiveProps = {kind: 'editor-navigation', part: 'tabs'}, original = umbrella(input);
  for (const corrupted of [original.replace('<!--[5-->', '<!--[4-->'), original.slice(8), original + '<!--extra-->']) expect(() => expectedDirect(corrupted, input.kind)).toThrow('Unqualified Nutrition dispatcher framing');
});
it('whole direct HTML comparison rejects changed classes, action, attribute, text and child comment', () => {
  const input: LiveProps = {kind: 'editor-navigation', part: 'tabs'}, expected = expectedDirect(umbrella(input), input.kind), actual = direct(input);
  const mutations = [actual.replace('gb:nutrition:', 'changed:nutrition:'), actual.replace('data-nutrition-action="set-kind"', 'data-nutrition-action="wrong"'), actual.replace('role="tab"', 'role="button"'), actual.replace('Photo', 'Changed'), actual.replace('<!--]-->', '<!--changed-->')];
  expect(actual).toBe(expected);
  for (const corrupted of mutations) { expect(corrupted).not.toBe(actual); expect(() => expect(corrupted).toBe(expected)).toThrow(); }
});

const controllers = {
  'nutrition-render.ts': ['fuel', 'meal-photo', 'comparison-picker', 'benchmark', 'meal-model', 'editor'],
  'nutrition-comparison-ui.ts': ['benchmark-status'], 'nutrition-benchmark-workspace.ts': ['benchmark-photo'],
  'nutrition-review-ui.ts': ['analysis-progress', 'editor-feedback', 'editable-ingredients'],
  'nutrition-editor-navigation.ts': ['editor-navigation'], 'nutrition.ts': ['meal-photo'],
  'nutrition-comparison-results.ts': ['comparison-results'],
} as const;
it('each real controller imports its finite genuine leaves while four compatibility wrapper bodies remain exact', () => {
  for (const [file, kinds] of Object.entries(controllers)) {
    const source = fs.readFileSync('js/' + file, 'utf8');
    for (const kind of kinds) expect(source).toContain(`from './components/${components[kind]}.svelte.html.js'`);
    if (file !== 'nutrition-render.ts') expect(source).not.toContain('NutritionPresentation.svelte.html.js');
  }
  const source = fs.readFileSync('js/nutrition-render.ts', 'utf8');
  expect([...source.matchAll(/renderPresentation\(\{ kind: '([^']+)'/g)].map(match => match[1])).toEqual(['history', 'entry', 'entry', 'detail']);
  for (const body of [
    "export function renderNutritionHistoryModal(history: NutritionRenderHistory | null | undefined, options: { storageError?: unknown; returnTo?: unknown } = {}) {\n  return renderPresentation({ kind: 'history', view: buildNutritionHistoryView(history, options) });\n}",
    "export function renderNutritionCustomizeModal(options: { returnTo?: unknown } = {}) {\n  return renderPresentation({ kind: 'entry', view: buildNutritionTargetsView(state.importedData, options) });\n}",
    "export function renderFluidLogModal() {\n  return renderPresentation({ kind: 'entry', view: buildNutritionFluidView() });\n}",
    "export function renderMealDetail(meal: NutritionRenderMeal, options: { returnTo?: unknown } = {}) {\n  return renderPresentation({ kind: 'detail', view: projectNutritionMealDetail(meal, options) });\n}",
  ]) expect(source).toContain(body);
});

type GraphReceipt = ActualRetryGraph;
/** Actual bundler receipts are supplied only for explicit artifact acceptance. */
function requireOptimizedGraph(receipt: GraphReceipt, kind: 'native' | 'kit'): void {
  expect(receipt.chunks.length).toBeGreaterThan(0);
  const ids = receipt.chunks.flatMap(chunk => chunk.modules.filter(module => module.renderedLength === undefined || module.renderedLength > 0).map(module => module.id));
  expect(ids.length).toBeGreaterThan(100);
  for (const name of ['NutritionPresentation', 'NutritionHistory', 'NutritionEntry', 'NutritionTargets', 'NutritionFluidLog', 'NutritionMealDetail', 'NutritionMealResponse']) {
    expect(ids.some(id => id.includes('getbased:svelte:html:') && id.endsWith('/' + name + '.svelte.compiled.js')), `${kind}: obsolete HTML ${name}`).toBe(false);
  }
  for (const name of ['NutritionHistory', 'NutritionEntry', 'NutritionTargets', 'NutritionFluidLog', 'NutritionMealDetail', 'NutritionMealResponse']) {
    expect(ids.some(id => kind === 'native' ? id.includes('getbased:svelte:client:') && id.endsWith('/' + name + '.svelte.compiled.js') : id.split('?')[0]!.endsWith('/' + name + '.svelte')), `${kind}: genuine client ${name}`).toBe(true);
  }
  for (const name of Object.values(components)) expect(ids.some(id => id.includes('getbased:svelte:html:') && id.endsWith('/' + name + '.svelte.compiled.js')), `${kind}: live HTML ${name}`).toBe(true);
  for (const entry of ['nutrition.js']) {
    requireActualRetry(receipt, kind, entry);
  }
}
const graphPaths = process.env['GETBASED_NUTRITION_GRAPH_RECEIPTS'];
if (graphPaths) for (const kind of ['native', 'kit'] as const) it(`${kind}: actual artifact removes only obsolete HTML graphs while genuine client/live HTML and independent retries remain`, () => {
  const paths: Record<'native' | 'kit', string> = JSON.parse(graphPaths);
  expect(typeof paths[kind]).toBe('string');
  requireOptimizedGraph(JSON.parse(fs.readFileSync(paths[kind], 'utf8')), kind);
});
