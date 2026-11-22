// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {expect, it} from 'vitest';
import {renderHTML as renderCycleImportPreview} from '../js/components/CycleImportPreview.svelte.html.js';
import {renderHTML as renderWearableManualLog} from '../js/components/WearableManualLog.svelte.html.js';
import {renderHTML as renderEnvironmentAI} from '../js/components/LightEnvironmentAI.svelte.html.js';
import {renderHTML as renderEnvironmentSummary} from '../js/components/LightEnvironmentSummary.svelte.html.js';
import {renderHTML as renderComparisonResults} from '../js/components/NutritionComparisonResults.svelte.html.js';
import {renderHTML as renderSupplementImportReview} from '../js/components/SupplementImportReview.svelte.html.js';
import {projectCycleImportPeriodRows, projectCycleImportPreview} from '../js/cycle-import-presentation.js';
import type {CyclePeriod} from '../js/cycle-summary.js';
import {projectWearableManualLog, projectWearableNoteField, projectWearableTagChips, type ManualLogMode} from '../js/wearables-entry-presentation.js';
import {projectEnvironmentAI} from '../js/light-environment-ai-presentation.js';
import type {EnvironmentSummaryView} from '../js/light-environment-summary-presentation.js';
import {projectNutritionComparisonResults} from '../js/nutrition-comparison-results-model.js';
import type {SupplementImportReviewView} from '../js/supplement-import-review-view.js';
import {nutritionComparisonFixture} from './helpers/nutrition-comparison-fixture.js';
import {nativeBurdenView} from './helpers/light-genuine-child-native-receipts.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);

type EnvironmentFixture = Omit<Parameters<typeof projectEnvironmentAI>[0], 'targetId' | 'actionOwner'> & {
  provider: boolean;
  html: string;
};
const environment = JSON.parse(readFileSync('tests/fixtures/light-environment-ai-original.json', 'utf8')) as {cases: EnvironmentFixture[]};
const verdicts = environment.cases.filter(item => item.provider && item.html);

it.each(verdicts)('retains the native $kind verdict controls when $status', async sample => {
  const native = load('../js/components/LightEnvironmentAI.svelte.native.js') as typeof import('../js/components/LightEnvironmentAI.svelte.native.js');
  const view = projectEnvironmentAI({...sample, targetId: 'review-session', actionOwner: 'fixture-owner'});
  await expectNativeReview(renderEnvironmentAI({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  });
});

const literal = '<span>Imported review text</span>';
const summary = {color: 'green', label: literal, parts: ['Known daylight', literal]};
const summaries: Array<[string, EnvironmentSummaryView]> = [
  ['unconfigured assessment', {...summary, kind: 'assessment', lead: literal, actionLabel: 'Map a room', hasRooms: false, metrics: []}],
  ['complete assessment', {...summary, kind: 'assessment', lead: literal, actionLabel: 'Edit room', hasRooms: true,
    metrics: [{label: 'Daylight', value: 'Some', sub: literal}, {label: 'Evening', value: 'Unknown', sub: 'No saved value'}]}],
  ['indoor burden overview', {...summary, kind: 'load', interp: literal, burden: nativeBurdenView()}],
  ['assessment overview without burden', {...summary, kind: 'load', color: 'incomplete', parts: [], interp: literal, burden: null}],
];

it.each(summaries)('retains actual native summary controls for %s', async (_title, view) => {
  const native = load('../js/components/LightEnvironmentSummary.svelte.native.js') as typeof import('../js/components/LightEnvironmentSummary.svelte.native.js');
  await expectNativeReview(renderEnvironmentSummary({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    expect(root.textContent).toContain(literal);
    expect(Array.from(root.querySelectorAll('span')).some(span => span.textContent === 'Imported review text')).toBe(false);
  });
});

const comparison = nutritionComparisonFixture();
const runs = [...comparison.runs,
  {...comparison.runs[2]!, modelLabel: 'Loading native example', status: 'running'},
  {...comparison.runs[2]!, modelLabel: 'Canceled native example', status: 'cancelled'},
];

it.each(['unranked', 'known values', 'model baseline', 'restored'] as const)('retains the native comparison controls for %s', async variant => {
  const native = load('../js/components/NutritionComparisonResults.svelte.native.js') as typeof import('../js/components/NutritionComparisonResults.svelte.native.js');
  const view = projectNutritionComparisonResults({
    runs,
    reference: variant === 'unranked' ? {} : comparison.manualReference,
    ...(variant === 'model baseline' ? {referenceRun: comparison.runs[0]!, referenceRunIndex: 0} : {}),
    isRestored: variant === 'restored',
  });
  await expectNativeReview(renderComparisonResults({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    expect(root.querySelectorAll('[data-nutrition-comparison-card]')).toHaveLength(runs.length);
    expect(root.querySelector('[data-nutrition-action="cancel-comparison-run"]')?.getAttribute('data-nutrition-index')).toBe('3');
    expect(root.textContent).toContain('Provider unavailable <literal>');
    expect(root.querySelector('literal')).toBeNull();
  });
});

const supplement: SupplementImportReviewView = {
  applied: false, combined: true, sources: ['Bottle label', 'Synthetic lot report'],
  facts: [literal], issues: ['Directions are missing'], showFacts: true, showIssues: true,
  hasIngredients: true, ingredients: [{index: '0', name: 'Recorded ingredient', amount: '5 mg', source: 'Label'}],
  showInactive: true, inactive: [{index: '0', name: 'Capsule shell'}], showQuality: true,
  quality: [
    {index: '0', categoryValue: 'contaminant', category: 'Contaminant', analyte: 'Lead', result: 'Below the measured limit', selected: true},
    {index: '1', categoryValue: 'potency', category: 'Potency', analyte: 'Recorded ingredient', result: '5 mg', selected: false},
  ],
  directions: literal, warnings: 'Synthetic warning', editAction: 'Save changes',
};
const supplements: Array<[string, SupplementImportReviewView | null]> = [
  ['combined source choices', supplement],
  ['empty ingredient choices', {...supplement, combined: false, showFacts: false, showIssues: false, hasIngredients: false,
    showInactive: false, showQuality: false, directions: null, warnings: null}],
  ['applied draft', {...supplement, applied: true}],
  ['unopened draft', null],
];

it.each(supplements)('retains private native supplement review defaults for %s', async (_title, view) => {
  const native = load('../js/components/SupplementImportReview.svelte.native.js') as typeof import('../js/components/SupplementImportReview.svelte.native.js');
  await expectNativeReview(renderSupplementImportReview({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    if (view?.showQuality && !view.applied) {
      const checks = Array.from(root.querySelectorAll<HTMLInputElement>('[data-supp-import-kind="quality"]'), input => input.checked);
      expect(checks).toEqual([true, false]);
    }
  });
});

const periods: CyclePeriod[] = [
  {id: 'first', startDate: '2026-08-01', endDate: '2026-08-03', flow: 'moderate', symptoms: ['Fatigue'], source: 'manual', confidence: null, updatedAt: null},
  {id: 'second', startDate: '2026-09-02', endDate: '2026-09-04', flow: 'light', symptoms: [literal], source: 'manual', confidence: null, updatedAt: null},
];

it.each(['keep-existing', 'replace-overlapping', 'daily observations'] as const)('retains the native Cycle import choices for %s', async conflictMode => {
  const native = load('../js/components/CycleImportPreview.svelte.native.js') as typeof import('../js/components/CycleImportPreview.svelte.native.js');
  const daily = conflictMode === 'daily observations';
  const view = projectCycleImportPreview({
    source: 'Synthetic CSV', fileName: literal, firstDate: periods[0]!.startDate, lastDate: periods[1]!.endDate,
    observationCount: 6, periodCount: daily ? 0 : 2, conflictCount: daily ? 0 : 1,
    importCount: daily ? 0 : conflictMode === 'keep-existing' ? 1 : 2,
    conflictMode, conflictSummary: '1 imported period overlaps an existing entry.',
    warnings: [literal], rows: daily ? [] : projectCycleImportPeriodRows(periods, new Set([periods[1]!.startDate]), conflictMode),
    confirmLabel: daily ? 'Import 6 daily observations' : 'Review selected periods',
  });
  await expectNativeReview(renderCycleImportPreview({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    const checked = root.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    if (daily) expect(checked).toBeNull();
    else expect(checked?.value).toBe(conflictMode);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(view.periodCount);
    expect(root.textContent).toContain(literal);
  });
});

const wearableModes = ['strip-weight', 'strip-bp', 'strip-rhr', 'detail-weight', 'detail-rhr', 'detail-bp'] as const satisfies readonly ManualLogMode[];

it.each(wearableModes)('retains the native wearable entry restrictions for %s', async mode => {
  const native = load('../js/components/WearableManualLog.svelte.native.js') as typeof import('../js/components/WearableManualLog.svelte.native.js');
  const metric = mode.split('-')[1]!;
  const view = projectWearableManualLog({
    mode, today: '2026-10-09',
    placeholder: () => 'lb', label: () => 'Weight in pounds',
    tags: () => metric === 'weight' ? null : projectWearableTagChips(metric === 'bp' ? 'bp_systolic' : 'rhr'),
    note: () => projectWearableNoteField('fixture-note'),
    form: () => `data-wearable-form="detail-manual-add" data-wearable-kind="${metric}"`,
    save: () => `data-wearable-action="manual-log-save" data-wearable-kind="${metric}"`,
    cancel: () => 'data-wearable-action="manual-log-cancel"',
  });
  await expectNativeReview(renderWearableManualLog({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    const date = root.querySelector<HTMLInputElement>('input[type="date"]');
    expect(date?.value).toBe('2026-10-09');
    if (mode.startsWith('detail-')) {
      expect(date?.max).toBe('');
      expect(root.querySelector('[data-wearable-form="detail-manual-add"] button[type="submit"]')).not.toBeNull();
    } else {
      expect(date?.max).toBe('2026-10-09');
      expect(root.querySelector('[data-wearable-action="manual-log-save"]')).not.toBeNull();
    }
    expect(root.querySelector('#fixture-note')).not.toBeNull();
  });
});
