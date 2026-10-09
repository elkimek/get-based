// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import {projectReportBuilder} from '../js/report-builder-presentation.js';
import type {ReportBuilderInput} from '../js/report-builder-presentation.js';
import {renderHTML} from '../js/components/ReportBuilderPresentation.svelte.html.js';

function input(overrides: Partial<ReportBuilderInput> = {}): ReportBuilderInput {
  return {
    overlayId: 'report-builder-overlay',
    presetId: 'full',
    preset: {description: 'All records', dateRange: 'all', sections: ['categories', 'notes']},
    presets: [{id: 'full', label: 'Full report', subtitle: 'All dates'}, {id: 'personal', label: 'Labs', subtitle: 'Only labs'}],
    dateOptions: [{value: 'current', label: 'Current'}, {value: 'all', label: 'All'}],
    rangeOptions: [{value: 'reference', label: 'Reference'}, {value: 'both', label: 'Both'}],
    rangeMode: 'both',
    sections: [{id: 'categories', label: 'Lab results'}, {id: 'context', label: 'Personal context'}, {id: 'notes', label: 'Timeline notes'}],
    categories: [{key: 'one', label: 'One', markerCount: 1, flaggedCount: 0}, {key: 'many', label: 'Many', markerCount: 3, flaggedCount: 2}],
    selectedCategoryKeys: ['many'],
    contextTitles: ['Activity'],
    notes: [],
    aiAvailable: true,
    ...overrides,
  };
}

function documentFor(fixture: ReportBuilderInput): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = renderHTML({view: projectReportBuilder(fixture)});
  return root;
}

describe('authored report setup presentation', () => {
  it('projects selected sections, categories, dates, ranges and presets without changing inputs', () => {
    const source = input();
    const before = structuredClone(source);
    const view = projectReportBuilder(source);
    expect(view.presets.map(preset => preset.active)).toEqual([true, false]);
    expect(view.dateOptions.map(option => option.selected)).toEqual([false, true]);
    expect(view.rangeOptions.map(option => option.selected)).toEqual([false, true]);
    expect(view.sections.map(section => section.checked)).toEqual([true, false, true]);
    expect(view.categories).toEqual([
      {key: 'one', label: 'One', checked: false, priority: false, summary: '1 marker'},
      {key: 'many', label: 'Many', checked: true, priority: true, summary: '3 markers · 2 flagged'},
    ]);
    expect(source).toEqual(before);
  });

  it('keeps note sorting separate from the original edit indices and retains multiline text', () => {
    const notes = [{date: '2024-01-01', text: 'Earlier'}, {text: 'Undated'}, {date: '2026-01-01', text: 'First line\nSecond line'}, {date: '2026-01-01', text: 'Same date'}];
    const view = projectReportBuilder(input({notes}));
    expect(view.notes).toEqual([
      {index: 2, date: '2026-01-01', text: 'First line\nSecond line'},
      {index: 3, date: '2026-01-01', text: 'Same date'},
      {index: 0, date: '2024-01-01', text: 'Earlier'},
      {index: 1, date: 'Undated', text: 'Undated'},
    ]);
    expect(notes[0]?.date).toBe('2024-01-01');
  });

  it('preserves fallback-preset semantics without marking an unknown preset active', () => {
    const root = documentFor(input({presetId: 'unknown'}));
    expect(root.querySelector<HTMLElement>('[data-report-builder-overlay]')?.dataset.reportPreset).toBe('unknown');
    expect(root.querySelectorAll('.report-preset-btn.active')).toHaveLength(0);
    expect(root.querySelector<HTMLSelectElement>('#report-date-range')?.value).toBe('all');
    expect(root.querySelector<HTMLInputElement>('[data-report-section="categories"]')?.checked).toBe(true);
  });

  it.each([true, false])('preserves AI availability %s and initially hidden review controls', available => {
    const root = documentFor(input({aiAvailable: available}));
    const checkbox = root.querySelector<HTMLInputElement>('#report-include-ai');
    expect(checkbox?.checked).toBe(available);
    expect(checkbox?.disabled).toBe(!available);
    expect(root.querySelector<HTMLElement>('[data-report-ai-status]')?.textContent).toBe(available ? 'Ready to generate with your preview.' : 'Not included.');
    for (const action of ['generate-ai-summary', 'clear-ai-summary', 'preview-without-ai']) {
      expect(root.querySelector<HTMLButtonElement>(`[data-report-action="${action}"]`)?.hidden).toBe(true);
    }
    expect(root.querySelector<HTMLTextAreaElement>('#report-ai-summary-text')?.hidden).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[name="report-detail"][value="summary"]')?.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[name="report-detail"][value="appendix"]')?.checked).toBe(false);
  });

  it('renders explicit empty categories, context and notes without omitting the controls', () => {
    const root = documentFor(input({categories: [], contextTitles: []}));
    expect(root.querySelector('.report-builder-empty')?.textContent).toBe('No lab categories with data.');
    expect(root.querySelector('[data-report-for="context"]')?.textContent).toContain('No personal context recorded.');
    expect(root.querySelector('[data-report-for="notes"]')?.textContent).toContain('No timeline notes recorded.');
    expect(root.querySelectorAll('[data-report-action="close"]')).toHaveLength(2);
    expect(root.querySelectorAll('[data-report-action="export"]')).toHaveLength(1);
  });

  it('escapes literal note, context and category data and keeps delegated values intact', () => {
    const literal = '<img src=x onerror="window.injected=true"> & "quoted"';
    const root = documentFor(input({
      categories: [{key: literal, label: literal, markerCount: 1, flaggedCount: 0}],
      selectedCategoryKeys: [literal],
      contextTitles: [literal],
      notes: [{date: literal, text: literal}],
    }));
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.report-category-title')?.textContent).toBe(literal);
    expect(root.querySelector<HTMLInputElement>('[data-report-category]')?.dataset.reportCategory).toBe(literal);
    expect(root.querySelector<HTMLInputElement>('[data-report-context]')?.dataset.reportContext).toBe(literal);
    expect(root.querySelector('.report-note-review strong')?.textContent).toBe(literal);
    expect(root.querySelector('.report-note-review p')?.textContent).toBe(literal);
    expect(root.querySelector<HTMLButtonElement>('[data-report-action="edit-note"]')?.dataset.reportIndex).toBe('0');
  });
});
