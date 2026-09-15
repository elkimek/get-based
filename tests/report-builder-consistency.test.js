// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as dataModule from '../js/data.js';
import { invalidateActiveDataCache } from '../js/data.js';
import { getReportPreset, normalizeReportOptions, buildPreparedReportPayload } from '../js/export-report.js';
import { openReportBuilder, closeReportBuilder } from '../js/export-report-builder.js';
const { generate, preview, available, openPreview } = vi.hoisted(() => ({ generate: vi.fn(), preview: vi.fn(), available: vi.fn(), openPreview: vi.fn() }));
vi.mock('../js/ai-feature-routing.js', async load => ({ ...await load(), hasAssistantFeatureProvider: available }));
vi.mock('../js/export-report-html.js', () => ({ exportPDFReport: preview, openReportPreviewWindow: openPreview }));
vi.mock('../js/export-report.js', async importOriginal => ({ ...await importOriginal(), generateReportAISummary: generate }));

beforeEach(() => {
  state.currentProfile = 'builder-profile';
  state.rangeMode = 'reference';
  state.importedData = { entries: [], supplements: [], notes: [], customMarkers: {} };
  invalidateActiveDataCache();
  available.mockReturnValue(true);
  openPreview.mockReset();
  openPreview.mockReturnValue({ document: document.implementation.createHTMLDocument('Preview'), closed: false, close: vi.fn() });
  generate.mockReset();
  preview.mockReset();
  openReportBuilder('full');
});
afterEach(() => { closeReportBuilder(); vi.restoreAllMocks(); });

describe('report builder selection', () => {
  it.each(['clinician', 'full', 'lifestyle', 'personal'])('keeps %s template selections consistent from builder to report data', async presetId => {
    const categories = Object.fromEntries(['biochemistry', 'tumorMarkers', 'boneMetabolism', 'urinalysis', 'customLab'].map((key, index) => [key, { label: key, markers: { result: { name: key + ' result', values: [index === 0 ? 20 : 2], unit: 'u', refMin: 1, refMax: 10 } } }]));
    vi.spyOn(dataModule, 'getActiveData').mockReturnValue({ dates: ['2024-01-01'], categories });
    openReportBuilder(presetId);
    const preset = getReportPreset(presetId);
    expect(document.querySelector('#report-date-range').value).toBe(presetId === 'lifestyle' ? '3m' : 'all');
    expect(document.querySelector('[data-report-template-description]').textContent).toBe(preset.description);
    expect(document.querySelector('[data-report-template-customized]').hidden).toBe(true);
    expect([...document.querySelectorAll('[data-report-category]')].every(input => input.checked)).toBe(true);
    document.querySelector('#report-include-ai').click();
    document.querySelector('[data-report-action="export"]').click();
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    const options = preview.mock.calls[0][0];
    expect([...options.sections].sort()).toEqual([...normalizeReportOptions({ preset: presetId }).sections].sort());
    const report = buildPreparedReportPayload(options).reportData;
    if (presetId === 'lifestyle') {
      expect(report.labs).toBeNull();
      expect(report.genetics).toBeNull();
      expect(report.notes).toEqual([]);
      expect(options.sections).toEqual(expect.arrayContaining(['nutrition', 'wearables', 'light', 'environment']));
      expect(document.querySelector('[data-report-selection-summary]').textContent).toContain('labs not included');
    } else {
      expect(report.labs.categories.map(category => category.key)).toEqual(expect.arrayContaining(Object.keys(categories)));
      expect(report.labs.dates).toContain('2024-01-01');
    }
    if (presetId === 'personal') {
      expect(options.presetLabel).toBe('Lab results only');
      expect(options.sections).toHaveLength(4);
      expect(report.context).toBeNull();
      expect(report.genetics).toBeNull();
      expect(report.additionalSections).toEqual([]);
    }
  });
  it('resets template scope while preserving range basis, detail, questions, Genome and AI preferences', () => {
    document.querySelector('#report-range-mode').value = 'both';
    document.querySelector('#report-purpose').value = 'Keep these consultation questions';
    document.querySelector('#report-genome-mode').value = 'traits';
    document.querySelector('[name="report-detail"][value="appendix"]').click();
    document.querySelector('#report-include-ai').click();
    document.querySelector('[data-report-action="set-preset"][data-report-preset="lifestyle"]').click();
    expect(document.querySelector('[data-report-section="categories"]').checked).toBe(false);
    expect(document.querySelector('#report-date-range').value).toBe('3m');
    expect(document.querySelector('[data-report-for="categories"]').hidden).toBe(true);
    document.querySelector('[data-report-action="set-preset"][data-report-preset="clinician"]').click();
    expect(document.querySelector('#report-date-range').value).toBe('all');
    expect(document.querySelector('#report-range-mode').value).toBe('both');
    expect(document.querySelector('#report-purpose').value).toBe('Keep these consultation questions');
    expect(document.querySelector('#report-genome-mode').value).toBe('traits');
    expect(document.querySelector('[name="report-detail"]:checked').value).toBe('appendix');
    expect(document.querySelector('#report-include-ai').checked).toBe(false);
  });
  it('labels manual scope changes as customized and clears that label when a template is reapplied', async () => {
    document.querySelector('[data-report-section="nutrition"]').click();
    expect(document.querySelector('[data-report-template-customized]').hidden).toBe(false);
    document.querySelector('#report-include-ai').click();
    document.querySelector('[data-report-action="export"]').click();
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(preview.mock.calls[0][0].presetLabel).toBe('Full health report (customized)');
    document.querySelector('[data-report-action="set-preset"][data-report-preset="full"]').click();
    expect(document.querySelector('[data-report-template-customized]').hidden).toBe(true);
  });
  it('uses one detail choice for all selected histories and groups the lab options', async () => {
    expect(document.querySelectorAll('[data-report-detail]')).toHaveLength(0);
    expect(document.querySelectorAll('[name="report-detail"]')).toHaveLength(2);
    expect(document.querySelector('[name="report-detail"]:checked').value).toBe('summary');
    document.querySelector('[name="report-detail"][value="appendix"]').click();
    document.querySelector('[data-report-section="light"]').click();
    generate.mockResolvedValue({ text: 'Review' });
    document.querySelector('[data-report-action="generate-ai-summary"]').click();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    const options = generate.mock.calls[0][0];
    expect(options.appendixSections).toContain('nutrition');
    expect(options.appendixSections).toContain('categories');
    expect(options.appendixSections).not.toContain('light');
    expect(options.appendixSections).not.toContain('genetics');
    expect(options.sections).toEqual(expect.arrayContaining(['flagged', 'categories', 'summary', 'trends']));
    expect(options.genomeMode).toBe('risks');
  });
  it('keeps contextual settings out of the way when their section is disabled', () => {
    for (const section of ['genetics', 'context', 'notes', 'categories']) {
      document.querySelector(`[data-report-section="${section}"]`).click();
      expect(document.querySelector(`[data-report-for="${section}"]`).hidden).toBe(true);
    }
  });
  it('offers independently configurable health histories', () => {
    for (const id of ['nutrition', 'wearables', 'light', 'environment']) {
      const input = document.querySelector(`input[data-report-section="${id}"]`);
      expect(input.checked).toBe(true);
      input.click();
      expect(input.checked).toBe(false);
    }
  });
  it('refreshes category flags under report ranges while preserving checked categories', () => {
    vi.spyOn(dataModule, 'getActiveData').mockReturnValue({ dates: ['2026-01-01'], categories: { lab: { label: 'Test lab', markers: {
      sample: { name: 'Fixture', values: [7], refMin: 1, refMax: 10, optimalMin: 3, optimalMax: 5 },
    } } } });
    openReportBuilder('full');
    const category = document.querySelector('[data-report-category="lab"]');
    expect(category.dataset.reportPriority).toBe('false');
    category.click();
    const range = document.querySelector('#report-range-mode');
    range.value = 'both';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(category.checked).toBe(false);
    expect(category.dataset.reportPriority).toBe('true');
    expect(document.querySelector('.report-category-meta').textContent).toContain('1 flagged');
    document.querySelector('[data-report-action="select-priority-categories"]').click();
    expect(category.checked).toBe(true);
    expect(state.rangeMode).toBe('reference');
  });
  it('keeps report ranges independent and clears an existing overview on range changes', async () => {
    const range = document.querySelector('#report-range-mode');
    expect([...range.options].map(option => option.value)).toEqual(['reference', 'optimal', 'both']);
    expect(range.value).toBe('reference');
    generate.mockResolvedValue({ text: 'Overview under reference ranges' });
    document.querySelector('[data-report-action="generate-ai-summary"]').click();
    await vi.waitFor(() => expect(document.querySelector('#report-ai-summary-text').value).toContain('Overview'));
    expect(generate.mock.calls[0][0].rangeMode).toBe('reference');
    range.value = 'both';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('#report-ai-summary-text').value).toBe('');
    document.querySelector('[data-report-action="set-preset"][data-report-preset="personal"]').click();
    expect(range.value).toBe('both');
    expect(state.rangeMode).toBe('reference');
  });
  it('reuses the captured report after background data replacement', async () => {
    generate.mockResolvedValue({ text: 'Overview of the old data' });
    document.querySelector('[data-report-action="generate-ai-summary"]').click();
    await vi.waitFor(() => expect(document.querySelector('#report-ai-summary-text').value).toContain('old data'));
    state.importedData = { ...state.importedData };
    document.querySelector('[data-report-action="export"]').click();
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(generate).toHaveBeenCalledOnce();
    expect(preview.mock.calls[0][2]).toBe(generate.mock.calls[0][1].payload);
    expect(preview.mock.calls[0][0].aiSummary.text).toContain('old data');
  });
  it('keeps captured notes detached through in-place edits and background replacement while AI is pending', async () => {
    state.importedData.notes = [{ date: '2026-01-01', text: 'Captured note' }];
    let finish;
    generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    document.querySelector('[data-report-action="export"]').click();
    const payload = generate.mock.calls[0][1].payload;
    state.importedData.notes[0].text = 'Changed after AI started';
    state.importedData = { ...state.importedData };
    finish({ text: 'Overview for captured note' });
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(payload.notes[0].text).toBe('Captured note');
    expect(payload.reportData.notes[0].text).toBe('Captured note');
    expect(preview.mock.calls[0][2]).toBe(payload);
    expect(openPreview.mock.results[0].value.close).not.toHaveBeenCalled();
    expect(document.querySelector('.report-generation-progress')).toBeNull();
  });
  it('closes the waiting tab and removes progress when the builder is cancelled', async () => {
    let finish;
    generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    document.querySelector('[data-report-action="export"]').click();
    expect(document.querySelector('.report-generation-progress')).not.toBeNull();
    document.querySelector('[data-report-action="close"]').click();
    expect(openPreview.mock.results[0].value.close).toHaveBeenCalledOnce();
    expect(document.querySelector('.report-generation-progress')).toBeNull();
    finish({ text: 'Cancelled overview' });
    await vi.waitFor(() => expect(preview).not.toHaveBeenCalled());
  });
  it('defaults on with a provider, reserves a popup before awaiting AI, then previews the result once', async () => {
    let finish;
    generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const button = document.querySelector('[data-report-action="export"]');
    expect(document.querySelector('#report-include-ai').checked).toBe(true);
    expect(button.textContent).toBe('Generate AI overview & preview');
    expect(generate).not.toHaveBeenCalled();
    button.click();
    expect(openPreview).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
    expect(preview).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    button.click();
    finish({ text: 'Generated overview' });
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(generate).toHaveBeenCalledOnce();
    expect(preview.mock.calls[0][0].aiSummary.text).toBe('Generated overview');
    expect(preview.mock.calls[0][1]).toBe(openPreview.mock.results[0].value);
  });
  it.each(['opt-out', 'no-provider'])('previews directly with %s and never calls AI', async mode => {
    if (mode === 'no-provider') { available.mockReturnValue(false); openReportBuilder('full'); }
    else document.querySelector('#report-include-ai').click();
    expect(document.querySelector('[data-report-action="export"]').textContent).toBe('Preview PDF');
    document.querySelector('[data-report-action="export"]').click();
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(generate).not.toHaveBeenCalled();
    expect(preview.mock.calls[0][0].aiSummary).toBeUndefined();
  });
  it.each(['failure', 'empty'])('offers an explicit fallback after %s and preserves the report selection', async mode => {
    if (mode === 'failure') generate.mockRejectedValue(new Error('Service unavailable'));
    else generate.mockResolvedValue(null);
    document.querySelector('#report-purpose').value = 'Keep my questions';
    document.querySelector('[data-report-action="export"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-report-action="preview-without-ai"]').hidden).toBe(false));
    expect(preview).not.toHaveBeenCalled();
    expect(openPreview.mock.results[0].value.close).toHaveBeenCalledOnce();
    document.querySelector('[data-report-action="preview-without-ai"]').click();
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(preview.mock.calls[0][0].purpose).toBe('Keep my questions');
    expect(preview.mock.calls[0][0].aiSummary).toBeUndefined();
    expect(generate).toHaveBeenCalledOnce();
  });
  it('does not send data when popup creation is blocked', () => {
    openPreview.mockReturnValue(null);
    document.querySelector('[data-report-action="export"]').click();
    expect(generate).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });
  it('discards pending generation when the user opts out, including off then on', async () => {
    let finish;
    generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    document.querySelector('[data-report-action="export"]').click();
    document.querySelector('#report-include-ai').click();
    document.querySelector('#report-include-ai').click();
    finish({ text: 'Unwanted overview' });
    await vi.waitFor(() => expect(openPreview.mock.results[0].value.close).toHaveBeenCalledOnce());
    expect(preview).not.toHaveBeenCalled();
    expect(document.querySelector('#report-ai-summary-text').value).toBe('');
  });
  it('requires reopening after a profile switch before generating or previewing', () => {
    state.currentProfile = 'other-profile';
    document.querySelector('[data-report-action="export"]').click();
    document.querySelector('[data-report-action="generate-ai-summary"]').click();
    expect(preview).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(['selection', 'profile', 'ranges', 'appendix', 'purpose', 'genome'])('discards a pending overview when %s changes', async change => {
    let finish;
    generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const button = document.querySelector('[data-report-action="generate-ai-summary"]');
    button.click();
    expect(generate).toHaveBeenCalledOnce();
    if (change === 'selection') document.querySelector('input[data-report-section="nutrition"]').click();
    if (change === 'ranges') {
      const range = document.querySelector('#report-range-mode');
      range.value = 'both';
      range.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (change === 'appendix') document.querySelector('[name="report-detail"][value="appendix"]').click();
    if (change === 'genome') {
      const mode = document.querySelector('#report-genome-mode');
      mode.value = 'traits';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (change === 'purpose') {
      const purpose = document.querySelector('#report-purpose');
      purpose.value = 'A different consultation question';
      purpose.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (change === 'profile') state.currentProfile = 'different-profile';
    if (change === 'data') state.importedData = { ...state.importedData };
    finish({ text: 'Stale overview from earlier selection' });
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(document.querySelector('#report-ai-summary-text').value).toBe('');
    expect(document.querySelector('[data-report-ai-status]').textContent).toContain('changed');
  });
});
