// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import type {CyclePeriod} from '../js/cycle-summary.js';
import {projectCycleImportPeriodRows, projectCycleImportPreview, projectCycleImportCoverage} from '../js/cycle-import-presentation.js';
import type {CycleImportPreviewInput, CycleImportCoverageInput} from '../js/cycle-import-presentation.js';

interface OriginalPreview {
  kind: string; name: string; html: string;
  plan: {conflictMode: string; importedPeriods: CyclePeriod[]; conflicts: {period: CyclePeriod}[]};
}
const original = JSON.parse(readFileSync('tests/fixtures/cycle-import-original.json', 'utf8')) as {revision: string; samples: OriginalPreview[]};

it.each(original.samples.filter(sample => sample.kind === 'preview'))('formats captured $name rows without changing prepared domain facts', sample => {
  const host = document.createElement('div');
  host.innerHTML = sample.html;
  const rows = [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(row => {
    const cells = [...row.querySelectorAll('td')];
    return {status: row.dataset.importStatus, statusLabel: cells[0]!.textContent, start: cells[1]!.textContent, end: cells[2]!.textContent, flow: cells[3]!.textContent, symptoms: cells[4]!.textContent};
  });
  const before = structuredClone(sample.plan);
  const conflictStarts = new Set(sample.plan.conflicts.map(conflict => conflict.period.startDate));
  expect(projectCycleImportPeriodRows(sample.plan.importedPeriods, conflictStarts, sample.plan.conflictMode)).toEqual(rows);
  expect(sample.plan).toEqual(before);
  expect(original.revision).toBe('54696fe849fe60f064a5a52700cb716b2a18ed8d');
});

it('keeps unknown conflict modes as skip and applies only the original row formatting fallbacks', () => {
  const period: CyclePeriod = {id: 'fixture', startDate: '', endDate: '', flow: 'moderate', symptoms: [], source: 'manual', confidence: null, updatedAt: null};
  expect(projectCycleImportPeriodRows([period], new Set(['']), 'unknown')).toEqual([{status: 'unmatched', statusLabel: 'Overlap · skip', start: '', end: '', flow: 'moderate', symptoms: ''}]);
  expect(projectCycleImportPeriodRows([period], new Set(['']), 'replace-overlapping')[0]!.statusLabel).toBe('Overlap · replace');
});

it('preserves prepared preview counts and confirmation text while projecting literal text and range fallbacks', () => {
  const literal = '<img src=x onerror="throw 1"> & "quoted"';
  const input: CycleImportPreviewInput = {source: literal, fileName: literal, firstDate: null, lastDate: '2026-10-09', observationCount: 7, periodCount: 20, conflictCount: 4, importCount: 16, conflictMode: 'keep-existing', conflictSummary: literal, warnings: [literal, null, 0], rows: [], confirmLabel: 'Prepared confirmation'};
  const before = structuredClone(input);
  expect(projectCycleImportPreview(input)).toEqual({...input, firstDate: '?', warnings: [literal, '', '0']});
  expect(input).toEqual(before);
});

it('preserves source/batch order, separately prepared labels and one-sided coverage without mutating input', () => {
  const input: CycleImportCoverageInput = {periodCount: 2, observationCount: 3, firstDate: null, lastDate: '2026-10-09', sources: [
    {source: 'drip', label: 'Display <literal>', periodCount: 2, observationCount: 3, importedAt: '2026-10-09', batches: [{importId: 'batch & "one"', label: 'Remove batch 1'}, {importId: undefined, label: 'Remove batch 2'}], deleteTitle: 'Remove title', deleteAriaLabel: 'Remove aria cycle data'},
    {source: 'manual', label: 'Manual', periodCount: 1, observationCount: 0, importedAt: null, batches: [], deleteTitle: null, deleteAriaLabel: null},
  ]};
  const before = structuredClone(input);
  expect(projectCycleImportCoverage(input)).toEqual({...input, firstDate: '?', showRange: true});
  expect(projectCycleImportCoverage({...input, firstDate: null, lastDate: null}).showRange).toBe(false);
  const emptyLiteral = {toString: () => ''};
  expect(projectCycleImportCoverage({...input, firstDate: emptyLiteral, lastDate: null})).toMatchObject({firstDate: '', lastDate: '?', showRange: true});
  expect(input).toEqual(before);
});
