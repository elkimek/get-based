// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { disposeSettingsRecords, mountSettingsRecords } from '../js/settings-records-component.js';
import { getDataEntriesSnapshot, getAIUsageSnapshot } from '../js/settings-records-view.js';
import { renderDataEntriesSection, renderAIUsageSection, refreshDataEntriesSection, resetCurrentProfileUsage } from '../js/settings-data.js';

const originalData = state.importedData;
const originalProfiles = state.profiles;
const originalProfile = state.currentProfile;
function mountPanels() {
  document.body.innerHTML = `<section id="data-entries-section">${renderDataEntriesSection()}</section><section id="ai-usage-section">${renderAIUsageSection()}</section>`;
  mountSettingsRecords();
}
beforeEach(() => {
  localStorage.clear(); state.currentProfile = 'records-test';
  state.profiles = [{ id: 'records-test', name: 'Synthetic <profile>' }];
  state.importedData = { ...originalData, entries: [], importSnapshots: [], manualValues: {} };
});
afterEach(() => {
  disposeSettingsRecords(); document.body.replaceChildren();
  state.importedData = originalData; state.profiles = originalProfiles; state.currentProfile = originalProfile;
});

describe('Settings imported records and usage', () => {
  it('keeps empty and tombstone-only states free of destructive/export controls', () => {
    mountPanels();
    expect(document.getElementById('data-entries-section')!.textContent).toContain('No data yet');
    expect(document.querySelector('[data-settings-action="clear-all-data"]')).toBeNull();
    state.importedData.entries = [{ date: '2026-01-01', markers: {}, deletedMarkers: { 'biochemistry.glucose': 1 } }];
    refreshDataEntriesSection();
    expect(document.getElementById('data-entries-section')!.textContent).toContain('No data yet');
    expect(document.querySelector('.imported-entry')).toBeNull();
  });

  it('sorts report imports by import time and escapes filenames, IDs and model labels', () => {
    state.importedData.importSnapshots = [
      { id: 'old"report', date: '2026-01-01', fileName: '<img src=x onerror=alert(1)>.pdf', markerCount: 1, importedAt: 10, costInfo: { modelId: '<script>model</script>' } },
      { id: 'new', date: '2026-02-01', fileName: 'Latest.pdf', markers: [1, 2], importedAt: 20 },
    ];
    mountPanels();
    const rows = [...document.querySelectorAll('.imported-entry-snapshot')];
    expect(rows.map(row => row.querySelector('.ie-file')!.textContent)).toEqual(['Latest.pdf', '<img src=x onerror=alert(1)>.pdf']);
    expect(rows[1]!.querySelector('[data-settings-action="review-import"]')!.getAttribute('data-snap-id')).toBe('old"report');
    expect(rows[1]!.querySelector('.ie-model')!.textContent).toBe('<script>model</script>');
    expect(document.querySelector('#data-entries-section img, #data-entries-section script')).toBeNull();
    expect(rows.map(row => row.querySelector('.ie-count')!.textContent)).toEqual(['2 markers', '1 marker']);
    expect(document.querySelectorAll('[data-settings-action="share-profile"], [data-settings-action="export-client"], [data-settings-action="export-all-clients"], [data-settings-action="clear-all-data"]')).toHaveLength(4);
  });

  it('keeps imported edits and snapshot-derived HOMA-IR under their report', () => {
    state.importedData.importSnapshots = [{ id: 'report', date: '2026-01-01', fileName: 'Report.pdf', markerCount: 2 }];
    state.importedData.entries = [{ date: '2026-01-01', markers: { 'biochemistry.glucose': 5, 'diabetes.insulin': 3, 'diabetes.homaIR': 0.7 }, markerSources: {
      'biochemistry.glucose': { snapshotId: 'report', manuallyEdited: true }, 'diabetes.insulin': { snapshotId: 'report' },
    } }];
    state.importedData.manualValues = { 'biochemistry.glucose:2026-01-01': 5 };
    mountPanels();
    expect(getDataEntriesSnapshot().manual).toEqual([]);
    expect(document.querySelectorAll('.imported-entry')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Manual / legacy markers');
    expect(document.body.textContent).not.toContain('Date locked');
  });

  it('locks dates with imported markers, distinguishes standalone manual values and sorts legacy dates', () => {
    state.importedData.entries = [
      { date: '2026-02-01', markers: { 'biochemistry.glucose': 5, 'biochemistry.alt': 0.5 }, markerSources: { 'biochemistry.glucose': { snapshotId: 'report' } } },
      { date: '2026-01-01', markers: { 'biochemistry.alp': 1 }, sourceFile: 'legacy <file>.json' },
    ];
    state.importedData.manualValues = { 'biochemistry.alt:2026-02-01': 0.5 };
    mountPanels();
    const snapshot = getDataEntriesSnapshot();
    expect(snapshot.manual.map(row => [row.date, row.manual, row.dateLocked])).toEqual([
      ['2026-01-01', false, false], ['2026-02-01', true, true],
    ]);
    expect(document.querySelector('[data-settings-action="rename-imported-entry"]')!.getAttribute('data-entry-date')).toBe('2026-01-01');
    expect(document.querySelectorAll('[data-settings-action="rename-imported-entry"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Date locked');
    expect(document.body.textContent).toContain('manual markers not tied to an import file');
    expect(document.body.textContent).toContain('legacy markers not tied to an import file · legacy <file>.json');
  });

  it('refreshes and remounts without writing into a disconnected view', () => {
    state.importedData.entries = [{ date: '2026-01-01', markers: { 'biochemistry.glucose': 5 } }];
    mountPanels();
    const button = document.querySelector<HTMLButtonElement>('[data-settings-action="remove-imported-entry"]')!;
    button.focus(); state.importedData.entries[0]!.markers['biochemistry.alt'] = 0.5;
    refreshDataEntriesSection(); expect(document.activeElement).toBe(button);
    expect(document.querySelector('.ie-count')!.textContent).toBe('2 markers');
    const old = document.getElementById('data-entries-content')!; document.body.replaceChildren();
    state.importedData.entries = []; refreshDataEntriesSection();
    expect(old.textContent).toContain('2 markers');
    mountPanels(); expect(document.getElementById('data-entries-content')!.textContent).toContain('No data yet');
  });

  it('refreshes records and usage on a profile change without carrying old rows or labels', () => {
    state.importedData.entries = [{ date: '2026-01-01', markers: { 'biochemistry.glucose': 5 } }];
    mountPanels();
    state.currentProfile = 'other-profile'; state.profiles = [{ id: 'other-profile', name: 'Other profile' }];
    state.importedData = { ...originalData, entries: [], importSnapshots: [], manualValues: {} };
    window.dispatchEvent(new Event('labcharts-profile-switched'));
    expect(document.querySelector('.imported-entry')).toBeNull();
    expect(document.getElementById('data-entries-section')!.textContent).toContain('No data yet');
    expect(document.getElementById('ai-usage-section')!.textContent).toContain('Other profile');
    expect(document.getElementById('ai-usage-section')!.textContent).not.toContain('Synthetic <profile>');
  });

  it('shows the canonical active profile name and resets only its usage totals', () => {
    localStorage.setItem('labcharts-records-test-usage', JSON.stringify({ totalCost: 1.25, requestCount: 1, totalInputTokens: 1200, totalOutputTokens: 300 }));
    const global = JSON.stringify({ totalCost: 2.5, requestCount: 5, totalInputTokens: 2000000, totalOutputTokens: 300 });
    localStorage.setItem('labcharts-global-usage', global);
    mountPanels();
    expect(getAIUsageSnapshot()).toMatchObject({ profile: { label: 'Synthetic <profile>', cost: '$1.250', requests: '1 request', tokens: '1.5k' }, global: { requests: '5 requests', tokens: '2.0M' }, canReset: true });
    expect(document.getElementById('ai-usage-section')!.textContent).toContain('Synthetic <profile>');
    expect(document.querySelector('[data-settings-action="reset-profile-usage"]')).not.toBeNull();
    resetCurrentProfileUsage();
    expect(localStorage.getItem('labcharts-records-test-usage')).toBeNull();
    expect(localStorage.getItem('labcharts-global-usage')).toBe(global);
    expect(document.querySelector('[data-settings-action="reset-profile-usage"]')).toBeNull();
  });
});
