// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, getProfiles, saveProfiles, profileStorageKey } from '../js/profile.js';
import { saveImportedData, invalidateActiveDataCache } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { configureDataRuntimeDeps } from '../js/data-view-controls.js';
import { showCompare, setCompareDate1, setCompareDate2, swapCompareDates } from '../js/compare-correlations.js';
import { readLabComparison, openLabComparison } from '../js/comparison-view-controls.js';
import { createAppControlSession } from '../js/app-control-session.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { setContextSourceEnabled } from '../js/context-source-registry.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
const original = { profile: state.currentProfile, data: state.importedData, thread: state.currentThreadId, history: state.chatHistory, view: state.currentView, first: state.compareDate1, second: state.compareDate2 }, active = localStorage.getItem('labcharts-active-profile');
let profile: string, key: string, restore: ReturnType<typeof configureDataRuntimeDeps>;
const dates = ['2026-01-01', '2026-05-01', '2026-10-20'] as const;
beforeEach(async () => {
  profile = await createProfile('Synthetic comparison view', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.currentThreadId = 'compare-thread'; state.chatHistory = []; state.currentView = 'dashboard'; state.compareDate1 = state.compareDate2 = null; localStorage.setItem('labcharts-active-profile', profile);
  state.importedData.entries = dates.map((date, i) => ({ date, markers: { 'biochemistry.glucose': 4 + i }, sourceFile: 'PRIVATE_REPORT.pdf' }));
  state.importedData.entries.push({ date: '2026-10-27', markers: { 'privateOnly.fixture': 42 }, sourceFile: 'PRIVATE_REPORT.pdf' });
  state.importedData.customMarkers = { 'privateOnly.fixture': { markerId: 'custom:comparison-private', name: 'PRIVATE_MARKER', unit: '', categoryLabel: 'PRIVATE_GROUP', contextGroup: 'PRIVATE_GROUP', group: 'PRIVATE_GROUP' } };
  state.importedData.contextNotes = 'PRIVATE_NOTE'; setContextSourceEnabled('lab-markers', true); setGroupInAIContext('Biochemistry', true); setGroupInAIContext('PRIVATE_GROUP', false); expect(await saveImportedData()).toBe(true);
  document.body.innerHTML = '<main id="main-content"><p>Retained view</p></main><div id="detail-modal"></div>';
  restore = configureDataRuntimeDeps({ navigate: async view => { state.currentView = view || 'dashboard'; showCompare(); return true; } });
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); configureDataRuntimeDeps(restore); document.body.innerHTML = '';
  for (const name of Object.keys(localStorage).filter(name => name.startsWith(`labcharts-${profile}-`))) await crypto.encryptedRemoveItem(name); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = original.profile; state.importedData = original.data; state.currentThreadId = original.thread; state.chatHistory = original.history; state.currentView = original.view; state.compareDate1 = original.first; state.compareDate2 = original.second; invalidateActiveDataCache();
  if (active === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', active);
});
function read() { const result = readLabComparison(profile); expect(result.snapshotId).toBeTypeOf('string'); return result; }
async function open(patch: Partial<AppNavigationRequest>, snapshot = read()) { return openLabComparison({ view: 'compare', marker: '', snapshotId: snapshot.snapshotId!, ...patch }, () => true); }
it('reads only permitted collection dates and defaults without changing selections or profile data', async () => {
  const before = await crypto.encryptedGetItem(key), result = read(); expect(result.dates).toEqual(dates); expect(result.latestPair).toEqual({ firstDate: dates[1], secondDate: dates[2] }); expect(result.selected).toEqual({ firstDate: dates[0], secondDate: dates[2] });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|2026-10-27|glucose|sourceFile|markers/); expect(state.compareDate1).toBeNull(); expect(state.compareDate2).toBeNull(); expect(await crypto.encryptedGetItem(key)).toBe(before);
});
it('does not issue command authority when fewer than two permitted dates remain', () => {
  state.importedData.entries = [{ date: dates[0], markers: { 'biochemistry.glucose': 5 } }]; invalidateActiveDataCache();
  expect(readLabComparison(profile)).toMatchObject({ dates: [dates[0]], snapshotId: null, canCompare: false, latestPair: null });
  state.importedData.entries = []; invalidateActiveDataCache(); expect(readLabComparison(profile)).toMatchObject({ dates: [], snapshotId: null, canCompare: false, selected: { firstDate: null, secondDate: null } });
});
it('paginates and searches only permitted date metadata while retaining the chronological latest pair', () => {
  state.importedData.entries = Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, markers: { 'biochemistry.glucose': 5 } })); invalidateActiveDataCache();
  const first = readLabComparison(profile); expect(first.dates).toHaveLength(25); expect(first.nextOffset).toBe(25); expect(first.totalDates).toBe(30); expect(first.latestPair).toEqual({ firstDate: '2026-01-29', secondDate: '2026-01-30' });
  expect(readLabComparison(profile, { offset: 25 })).toMatchObject({ dates: ['2026-01-26', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30'], nextOffset: null }); expect(readLabComparison(profile, { query: '2026-01-30' }).dates).toEqual(['2026-01-30']);
});
it('opens the actual native table at the requested pair without saving records or settings', async () => {
  const before = await crypto.encryptedGetItem(key), receipt = await open({ firstDate: dates[1], secondDate: dates[2] }); expect(receipt).toMatchObject({ changed: true, opened: 'compare', firstDate: dates[1], secondDate: dates[2], dataSaved: false, settingsSaved: false });
  expect(document.querySelector<HTMLSelectElement>('#compare-select-1')!.value).toBe(dates[1]); expect(document.querySelector<HTMLSelectElement>('#compare-select-2')!.value).toBe(dates[2]); expect(document.querySelector('#compare-results table')).not.toBeNull(); expect(await crypto.encryptedGetItem(key)).toBe(before);
});
it('sets either side independently and swaps through the same native selector owner', async () => {
  await open({ firstDate: dates[0], secondDate: dates[2] }); await open({ firstDate: dates[1] }); expect(state.compareDate2).toBe(dates[2]); await open({ secondDate: dates[0] }); expect(state.compareDate1).toBe(dates[1]);
  await open({ swapDates: true }); expect([state.compareDate1, state.compareDate2]).toEqual([dates[0], dates[1]]);
  setCompareDate1(dates[2]); expect(state.compareDate1).toBe(dates[2]); setCompareDate2(dates[0]); swapCompareDates(); expect([state.compareDate1, state.compareDate2]).toEqual([dates[0], dates[2]]); expect(document.querySelector<HTMLSelectElement>('#compare-select-2')!.value).toBe(dates[2]);
});
it('does not replay a consumed snapshot and accidentally swap back', async () => {
  await open({ firstDate: dates[0], secondDate: dates[2] }); const snapshot = read(); await open({ swapDates: true }, snapshot); expect(await open({ swapDates: true }, snapshot)).toMatchObject({ changed: false, opened: null }); expect([state.compareDate1, state.compareDate2]).toEqual([dates[2], dates[0]]);
});
it.each(['profile', 'thread', 'root', 'selection', 'inventory', 'source', 'group', 'authority'] as const)('rejects a stale %s snapshot before selection changes', async cause => {
  const snapshot = read(); if (cause === 'profile') state.currentProfile = 'other'; if (cause === 'thread') state.currentThreadId = 'other'; if (cause === 'root') state.importedData = structuredClone(state.importedData); if (cause === 'selection') state.compareDate1 = dates[1]!;
  if (cause === 'inventory') { state.importedData.entries.push({ date: '2026-10-25', markers: { 'biochemistry.glucose': 7 } }); invalidateActiveDataCache(); }
  if (cause === 'source') setContextSourceEnabled('lab-markers', false); if (cause === 'group') setGroupInAIContext('Biochemistry', false);
  const before = [state.compareDate1, state.compareDate2]; expect(await openLabComparison({ view: 'compare', marker: '', snapshotId: snapshot.snapshotId!, firstDate: dates[1], secondDate: dates[2] }, () => cause !== 'authority')).toMatchObject({ changed: false, opened: null }); expect([state.compareDate1, state.compareDate2]).toEqual(before);
});
it('omits hidden current dates and requires an explicit permitted pair instead of silently replacing a hidden side', async () => {
  state.compareDate1 = '2026-10-27'; state.compareDate2 = dates[2]!; const snapshot = read(); expect(snapshot.selected.firstDate).toBeNull(); expect(JSON.stringify(snapshot)).not.toContain('2026-10-27'); expect(snapshot.swapAvailable).toBe(false);
  expect(await open({ secondDate: dates[1] }, snapshot)).toMatchObject({ changed: false }); expect(state.compareDate1).toBe('2026-10-27'); expect(await open({ firstDate: dates[0], secondDate: dates[1] })).toMatchObject({ opened: 'compare' });
});
it('rejects unrecorded dates and leaves the current workspace intact', async () => {
  const snapshot = read(); expect(await open({ firstDate: '2026-02-01', secondDate: dates[2] }, snapshot)).toMatchObject({ changed: false }); expect(state.compareDate1).toBeNull(); expect(document.querySelector('#main-content')!.textContent).toBe('Retained view');
});
it('preserves same-day separate specimen records and offers one date rather than inventing sample comparisons', async () => {
  state.importedData.entries.push({ date: dates[2]!, markers: { 'biochemistry.glucose': 8 }, sourceFile: 'PRIVATE_SECOND_DRAW.pdf' }); expect(await saveImportedData()).toBe(true); const before = await crypto.encryptedGetItem(key), snapshot = read(); expect(snapshot.dates).toEqual(dates); expect(snapshot.notice).toContain('date-level'); await open({ firstDate: dates[1], secondDate: dates[2] }, snapshot); expect(await crypto.encryptedGetItem(key)).toBe(before);
});
it('reports committed session selection truthfully when the optional renderer fails', async () => {
  configureDataRuntimeDeps({ navigate: () => Promise.reject(new Error('Render failed')) }); expect(await open({ firstDate: dates[1], secondDate: dates[2] })).toMatchObject({ changed: true, opened: null, firstDate: dates[1], secondDate: dates[2], dataSaved: false, settingsSaved: false });
});
it('withholds dates if disclosure changes while the native view is rendering', async () => {
  configureDataRuntimeDeps({ navigate: async () => { setContextSourceEnabled('lab-markers', false); return false; } }); const result = await open({ firstDate: dates[1], secondDate: dates[2] }); expect(result).toMatchObject({ changed: true, opened: null, dataSaved: false }); expect(result).not.toHaveProperty('firstDate'); expect(result).not.toHaveProperty('secondDate');
});
it('uses the shared tool runtime for discovery and direct selection without creating a review or health proposal', async () => {
  const message = 'Compare my latest labs with the previous collection date.', session = createAppControlSession(message, () => true, new AbortController().signal), tools = createAgentToolRuntime({ readContext: () => '', userMessage: message, ...session.tools, navigate: request => openLabComparison(request, () => true) });
  const result = await tools.execute({ tool: 'getbased_read_app', arguments: { action: 'labs.comparison' } }); expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
  const selected = await tools.execute({ tool: 'getbased_navigate', arguments: { view: 'compare', snapshotId: snapshot.snapshotId, ...snapshot.latestPair } }); expect(selected.success).toBe(true); expect(JSON.parse(selected.contentItems[0].text)).toMatchObject({ opened: 'compare', dataSaved: false }); expect(session.finish()).toEqual([]); expect(tools.getDrafts()).toEqual([]);
});
