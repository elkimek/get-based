// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ enabled: true, disclosure: 'wearables:on', focus: vi.fn(() => true), open: vi.fn() }));
vi.mock('../js/profile.js', () => ({ isActiveProfileDataOwner: () => true }));
vi.mock('../js/context-source-registry.js', () => ({ isContextSourceEnabled: () => native.enabled }));
vi.mock('../js/lab-context-settings.js', () => ({ getContextDisclosureFingerprint: () => native.disclosure }));
vi.mock('../js/wearables-runtime.js', () => ({ loadWearablesModule: async () => {} }));
vi.mock('../js/settings-runtime-bridge.js', () => ({ getSettingsModuleFunction: () => native.open }));
vi.mock('../js/wearables-settings-component.js', () => ({ focusWearableRefreshControl: native.focus }));
import { state } from '../js/state.js';
import { readConfiguredWearableSources, openConfiguredWearableRefresh } from '../js/wearable-source-controls.js';
import { createAgentToolRuntime, summarizeAgentToolReceipts } from '../js/agent-tool-runtime.js';
const original = { currentProfile: state.currentProfile, currentThreadId: state.currentThreadId, importedData: state.importedData, chatHistory: state.chatHistory };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); native.enabled = true; native.disclosure = 'wearables:on'; native.focus.mockReturnValue(true);
  state.currentProfile = 'source-controls'; state.currentThreadId = 'origin'; state.chatHistory = [];
  state.importedData = { ...structuredClone(original.importedData), wearableConnections: {
    oura: { connectedAt: 1793220000000, lastSyncAt: 1793300000000, accessToken: 'PRIVATE_ACCESS', refreshToken: 'PRIVATE_REFRESH', account: { email: 'PRIVATE_ACCOUNT' }, unknownPrivate: 'PRIVATE_OPAQUE' },
    apple_health: { connectedAt: 1793220000000, lastSyncAt: 0, fileName: 'PRIVATE_FILE' },
    withings: { connectedAt: 1793220000000, accessToken: 'PRIVATE_WITHINGS', needsReauth: true },
    unknown: { connectedAt: 1793220000000, accessToken: 'PRIVATE_UNKNOWN' },
  } };
  native.open.mockImplementation(async (_tab: string, current: () => boolean) => { if (current()) document.body.innerHTML = '<div id="settings-modal-overlay" class="show"><div id="settings-tab-wearables" class="active"></div></div>'; });
});
afterEach(() => { Object.assign(state, original); document.body.replaceChildren(); vi.restoreAllMocks(); });
const read = () => { const value = readConfiguredWearableSources('source-controls'); if (!value.snapshotId) throw new Error('Expected enabled source snapshot'); return { ...value, snapshotId: value.snapshotId }; };
it('keeps wearables.sources in native UI without exposing saved data or invoking its owner', async () => {
  const before = structuredClone(state.importedData), settings = Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]);
  const native = vi.fn(() => ({ secret: 'PRIVATE_NATIVE_DATA' }));
  const tools = createAgentToolRuntime({ readContext: () => '', listAppActions: native, readAppState: native, prepareAppControl: native, navigate: native });
  for (const tool of ['getbased_app_actions','getbased_read_app','getbased_request_app']) {
    const result = await tools.execute({ tool, arguments: { action: 'wearables.sources', snapshotId: 'previous', parameters: '{}', evidence: 'Requested', reason: 'Requested' } });
    expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  }
  expect(native).not.toHaveBeenCalled(); expect(tools.getDrafts()).toEqual([]); expect(tools.getOutcome().reviews).toEqual([]);
  expect(state.importedData).toEqual(before); expect(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])).toEqual(settings);
});
it('does not initialize missing connections or reveal availability when wearable context is disabled', () => {
  delete state.importedData.wearableConnections; const before = structuredClone(state.importedData); expect(read()).toMatchObject({ sources: [] }); expect(state.importedData).toEqual(before);
  native.enabled = false; const value = readConfiguredWearableSources('source-controls'); expect(value).toMatchObject({ status: 'unavailable' }); expect(value).not.toHaveProperty('sources'); expect(value).not.toHaveProperty('snapshotId');
});
it('pages source metadata without returning unselected private versions', () => {
  const value = readConfiguredWearableSources('source-controls', { query: 'oura', limit: 1 }); expect(value).toMatchObject({ sources: [{ id: 'oura' }], nextOffset: null }); expect(JSON.stringify(value)).not.toContain('PRIVATE_');
});
it.each(['profile', 'thread', 'root', 'history', 'disclosure', 'connection', 'disabled', 'missing-target', 'wrong-source'] as const)('refuses a stale %s before any Settings mutation', async boundary => {
  const snapshot = read();
  if (boundary === 'profile') state.currentProfile = 'other';
  if (boundary === 'thread') state.currentThreadId = 'other';
  if (boundary === 'root') state.importedData = structuredClone(state.importedData);
  if (boundary === 'history') state.chatHistory = [];
  if (boundary === 'disclosure') native.disclosure = 'changed';
  if (boundary === 'connection') state.importedData.wearableConnections = { ...state.importedData.wearableConnections, oura: { connectedAt: 1793220000000, accessToken: 'NEWER' } };
  if (boundary === 'disabled') native.enabled = false;
  const result = await openConfiguredWearableRefresh({ view: 'wearablesSettings', marker: '', ...(boundary === 'missing-target' ? {} : { recordId: boundary === 'wrong-source' ? 'apple_health' : 'oura' }), snapshotId: snapshot.snapshotId }, () => true);
  expect(result).toMatchObject({ changed: false, dataSaved: false }); expect(native.open).not.toHaveBeenCalled(); expect(native.focus).not.toHaveBeenCalled();
});
it('reveals the native control once and reports pending human action without claiming sync', async () => {
  const snapshot = read(), request = { view: 'wearablesSettings', marker: '', recordId: 'oura', snapshotId: snapshot.snapshotId };
  const before = structuredClone(state.importedData); const result = await openConfiguredWearableRefresh(request, () => true);
  expect(result).toMatchObject({ changed: true, opened: 'wearablesSettings', dataSaved: false, settingsSaved: false, requiresUserAction: true, status: 'pending_user_confirmation' });
  expect(native.focus).toHaveBeenCalledExactlyOnceWith('oura'); expect(state.importedData).toEqual(before);
  expect(await openConfiguredWearableRefresh(request, () => true)).toMatchObject({ changed: false }); expect(native.open).toHaveBeenCalledTimes(1);
});
it('refuses after native loading changes the source and never focuses another source', async () => {
  const snapshot = read(); native.open.mockImplementation(async () => { state.importedData.wearableConnections = {}; });
  expect(await openConfiguredWearableRefresh({ view: 'wearablesSettings', marker: '', recordId: 'oura', snapshotId: snapshot.snapshotId }, () => true)).toMatchObject({ changed: false, dataSaved: false }); expect(native.focus).not.toHaveBeenCalled();
});

it('recognizes native ISO connection timestamps without inventing refresh support for manual data', () => {
  state.importedData.wearableConnections = { manual: { connectedAt: '2026-10-28T12:00:00.000Z', lastSyncAt: '2026-10-29T12:00:00.000Z' } };
  expect(read()).toMatchObject({ sources: [{ id: 'manual', lastSuccessfulSyncAt: '2026-10-29T12:00:00.000Z', refreshAvailable: false }] });
});

it('records a bounded source-disclosure receipt without source identities or credentials', () => {
  expect(summarizeAgentToolReceipts([{ tool: 'getbased_read_app', arguments: { action: 'wearables.sources', query: 'PRIVATE_SOURCE_NAME' }, success: true }])).toEqual([{ label: 'Configured health sources', detail: 'Source freshness metadata' }]);
  expect(summarizeAgentToolReceipts([{ tool: 'getbased_read_app', arguments: { action: 'wearables.sources' }, success: false }])).toEqual([]);
});

it('keeps wearables.sources in native UI without exposing saved data or invoking its owner after an interactive turn', async () => {
  const before = structuredClone(state.importedData), settings = Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]);
  const native = vi.fn(() => ({ secret: 'PRIVATE_NATIVE_DATA' }));
  const tools = createAgentToolRuntime({ readContext: () => '', listAppActions: native, readAppState: native, prepareAppControl: native, navigate: native });
  for (const tool of ['getbased_app_actions','getbased_read_app','getbased_request_app']) {
    const result = await tools.execute({ tool, arguments: { action: 'wearables.sources', snapshotId: 'previous', parameters: '{}', evidence: 'Requested', reason: 'Requested' } });
    expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  }
  expect(native).not.toHaveBeenCalled(); expect(tools.getDrafts()).toEqual([]); expect(tools.getOutcome().reviews).toEqual([]);
  expect(state.importedData).toEqual(before); expect(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])).toEqual(settings);
});
