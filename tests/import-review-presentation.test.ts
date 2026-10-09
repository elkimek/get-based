// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {projectImportReviewPresentation, projectImportReviewRow, projectImportUnitControl, projectImportMapControl, projectImportExcludeControl, projectImportUnitMenu} from '../js/import-review-presentation.js';
import type {ImportReviewPresentationInput} from '../js/import-review-presentation.js';
import {renderHTML as renderReview} from '../js/components/ImportReviewPresentation.svelte.html.js';
import {renderHTML as renderUnit} from '../js/components/ImportUnitControl.svelte.html.js';
import {renderHTML as renderMapping} from '../js/components/ImportMapControl.svelte.html.js';
import {renderHTML as renderAction} from '../js/components/ImportReviewRowAction.svelte.html.js';
import {renderHTML as renderMenu} from '../js/components/ImportUnitMenu.svelte.html.js';

function parse(html: string) {const host = document.createElement('div'); host.innerHTML = html; return host;}
function input(): ImportReviewPresentationInput {
  return {batchLabel: 'Lab import', fileName: 'fixture.pdf', date: '2026-07-31', sampleTime: '08:15', fasting: null,
    counts: {matched: 1, new: 1, unmatched: 1}, rows: [
      projectImportReviewRow({rawName: 'Matched', value: 0, mappedKey: 'iron.ferritin', unit: 'ng/ml'}, 2, 'matched', {labRange: '0–2', unitOptions: {units: ['ng/ml'], schemaBacked: true}}),
      projectImportReviewRow({rawName: 'Custom', value: 3, suggestedKey: 'custom.signal', unit: ''}, 0, 'new', {labRange: '', unitOptions: {units: [''], schemaBacked: false}}),
      projectImportReviewRow({rawName: 'Unmapped', value: null}, 1, 'unmatched', {labRange: '?–5', unitOptions: {units: ['mg/L'], schemaBacked: false}}),
    ], unmatchedWarning: false, dateWarning: false, ranges: null, privacy: null, cost: null, debug: null, privacyDetails: false, cancelLabel: 'Cancel', confirmLabel: 'Import 2 Markers', confirmDisabled: false};
}

it('preserves prepared row order and original indexes with status-specific initial controls', () => {
  const host = parse(renderReview({view: projectImportReviewPresentation(input())}));
  const rows = [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  expect(rows.map(row => row.dataset.importIdx)).toEqual(['2', '0', '1']);
  expect(rows.map(row => row.dataset.importStatus)).toEqual(['matched', 'new', 'unmatched']);
  expect(rows.map(row => row.querySelector('.import-status-dot')?.getAttribute('aria-label'))).toEqual(['Matched', 'New', 'Unmatched']);
  expect(rows[0]!.querySelector<HTMLInputElement>('.import-value-input')?.value).toBe('0');
  expect(rows[0]!.querySelector('.import-map-cell')?.textContent).toBe('iron.ferritin');
  expect(rows[0]!.querySelector('.import-map-picker-btn')).toBeNull();
  expect(rows[1]!.querySelector('.import-suggested-key code')?.textContent).toBe('custom.signal');
  expect(rows[1]!.querySelector('.import-range-cell')?.textContent).toBe('—');
  expect(rows[2]!.querySelector('.import-exclude-btn')).toBeNull();
  expect(rows[2]!.querySelector('.import-skip-note')?.textContent).toBe('Skipped unless mapped');
  expect(host.querySelectorAll('[data-import-review-action="toggle-row"]')).toHaveLength(2);
});

it.each([null, true, false])('retains fasting selection, labels and delegated form/actions for %s', fasting => {
  const source = {...input(), fasting};
  const host = parse(renderReview({view: projectImportReviewPresentation(source)}));
  expect(host.querySelector<HTMLSelectElement>('#import-fasting')?.value).toBe(fasting === null ? 'unknown' : fasting ? 'fasting' : 'not-fasting');
  expect(host.querySelector<HTMLInputElement>('#import-manual-date')?.value).toBe(source.date);
  expect(host.querySelector<HTMLInputElement>('#import-sample-time')?.value).toBe(source.sampleTime);
  expect(host.querySelector('.import-filter-btn.active')?.getAttribute('data-filter')).toBe('all');
  expect([...host.querySelectorAll('.import-filter-btn')].map(button => button.getAttribute('data-import-review-action'))).toEqual(Array(5).fill('filter'));
  expect(host.querySelector('#import-review-search')?.getAttribute('autocomplete')).toBe('off');
  expect(host.querySelector('#import-visible-count')?.getAttribute('aria-live')).toBe('polite');
  expect(host.querySelector('#import-confirm-btn')?.textContent).toBe('Import 2 Markers');
});

it('renders missing-date, range, batch/review, privacy, cost and debug facts without calculating them', () => {
  const source: ImportReviewPresentationInput = {...input(), batchLabel: 'File 2 of 3', date: '', unmatchedWarning: true, dateWarning: true, ranges: {count: 1, checked: false}, privacy: {kind: 'regex', replacements: 1}, cost: {model: 'Fixture model', tokens: '123', cost: '$0.01'}, debug: {piiLabel: 'PII: regex', analysis: 0, model: 'Fixture model'}, privacyDetails: true, cancelLabel: 'Skip', confirmLabel: 'Update Import (2 Markers)', confirmDisabled: true};
  const host = parse(renderReview({view: projectImportReviewPresentation(source)}));
  expect(host.querySelector('.gb-modal-kicker')?.textContent).toBe('File 2 of 3');
  expect(host.querySelectorAll('.import-review-warning')).toHaveLength(2);
  expect(host.querySelector<HTMLInputElement>('#import-adopt-ranges')?.checked).toBe(false);
  expect(host.querySelector('.import-range-option small')?.textContent).toContain('1 marker differ');
  expect(host.querySelector('.privacy-notice')?.textContent).toContain('1 personal detail replaced');
  expect(host.querySelector('.import-cost-note')?.textContent).toBe('📊 Fixture model · 123 tokens · $0.01');
  expect(host.querySelector('.import-debug-note')?.textContent).toContain('Analysis: 0s (Fixture model)');
  expect(host.querySelector('[data-import-review-action="privacy-details"]')?.textContent).toBe('🔍 View privacy details');
  expect(host.querySelector<HTMLButtonElement>('#import-confirm-btn')?.disabled).toBe(true);
  expect(host.querySelector('.import-review-actions [data-import-review-action="close"]')?.textContent).toBe('Skip');
});

it('preserves schema unit display fallback, custom editable units and unsupported selected options', () => {
  const schema = parse(renderUnit({view: projectImportUnitControl({rawName: 'Ferritin', unit: ''}, 7, {units: ['ng/ml'], schemaBacked: true})}));
  expect(schema.querySelector('.import-unit-button-text')?.textContent).toBe('ng/ml');
  expect(schema.querySelector('input')).toBeNull();
  expect(schema.querySelector('button')?.getAttribute('data-marker-idx')).toBe('7');
  expect(schema.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  const custom = parse(renderUnit({view: projectImportUnitControl({rawName: 'Custom', unit: 'arbitrary/unit'}, 4, {units: [''], schemaBacked: false})}));
  expect(custom.querySelector<HTMLInputElement>('input')?.value).toBe('arbitrary/unit');
  expect(custom.querySelector('input')?.getAttribute('data-import-review-action')).toBe('edit-unit');
  expect(custom.querySelector('button')?.getAttribute('aria-haspopup')).toBe('listbox');
  const menu = parse(renderMenu({options: projectImportUnitMenu([{unit: 'legacy-unit', index: 7, selected: true, disabled: true}, {unit: '', index: 7, selected: false, disabled: false}])}));
  const options = [...menu.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options.map(option => option.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  expect(options.map(option => option.disabled)).toEqual([true, false]);
  expect(options.map(option => option.textContent)).toEqual(['legacy-unit', 'No unit']);
});

it('escapes literal imported text and attribute values across initial and incremental controls', () => {
  const hostile = '<img src=x onerror="throw 1"> & "quoted"';
  const marker = {rawName: hostile, value: 1, unit: hostile, mappedKey: hostile};
  const source: ImportReviewPresentationInput = {...input(), fileName: hostile, privacy: {kind: 'local', reviewed: true}, cost: {model: hostile, tokens: '0', cost: '$0'}, debug: {piiLabel: hostile, analysis: hostile, model: hostile}, rows: [projectImportReviewRow(marker, 3, 'new', {labRange: hostile, unitOptions: {units: [hostile], schemaBacked: false}})]};
  const host = parse(renderReview({view: projectImportReviewPresentation(source)}));
  expect(host.querySelector('.import-review-file strong')?.textContent).toBe(hostile);
  expect(host.querySelector('.import-name-cell')?.textContent).toBe(hostile);
  expect(host.querySelector('.import-unit-text')?.getAttribute('value')).toBe(hostile);
  expect(host.querySelector('.import-unit-text')?.getAttribute('aria-label')).toBe(`Unit for ${hostile}`);
  const mapping = parse(renderMapping({view: projectImportMapControl(marker, 3)}));
  expect(mapping.querySelector('code')?.textContent).toBe(hostile);
  expect(mapping.querySelector('button')?.getAttribute('aria-label')).toBe(`Open marker picker for ${hostile}`);
  const action = parse(renderAction({view: projectImportExcludeControl(hostile)}));
  expect(action.querySelector('button')?.getAttribute('aria-label')).toBe(`Exclude ${hostile} from import`);
  for (const tree of [host, mapping, action]) expect(tree.querySelector('img,script,[onclick],[onerror]')).toBeNull();
});

it('keeps prepared inputs unchanged and duplicate original row indexes intact', () => {
  const source = input();
  source.rows = [source.rows[0]!, {...source.rows[0]!}];
  const before = structuredClone(source);
  const host = parse(renderReview({view: projectImportReviewPresentation(source)}));
  expect([...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(row => row.dataset.importIdx)).toEqual(['2', '2']);
  expect(source).toEqual(before);
  expect(parse(renderAction({view: projectImportExcludeControl('', true)})).querySelector('.sr-only')?.textContent).toBe('Include in import');
  expect(parse(renderAction({skipped: true})).querySelector('button')).toBeNull();
});

it('authors all migrated boundaries without raw HTML or inline action handlers', () => {
  for (const name of ['ImportReviewPresentation', 'ImportReviewRow', 'ImportUnitControl', 'ImportMapControl', 'ImportReviewRowAction', 'ImportExcludeContent', 'ImportReviewStatus', 'ImportUnitMenu']) {
    const source = readFileSync(`js/components/${name}.svelte`, 'utf8');
    expect(source).not.toContain('{@html');
    expect(source).not.toMatch(/\bon(?:click|input|change)=|on:(?:click|input|change)/);
  }
  for (const file of ['js/pdf-import-review.ts', 'js/pdf-import-review-formatting.ts', 'js/import-review-row-actions.ts']) {
    expect(readFileSync(file, 'utf8')).not.toContain('`<');
  }
});
