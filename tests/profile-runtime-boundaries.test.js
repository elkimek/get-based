// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ loaded: vi.fn(), load: vi.fn(), recover: vi.fn(), sources: vi.fn(), stale: vi.fn() }));
vi.mock('../js/chat-loader.js', () => ({ isChatModuleLoaded: mocks.loaded, loadChatModule: mocks.load }));
vi.mock('../js/wearables-connect.js', () => ({ recoverPendingWearableDisconnect: mocks.recover, listConnectedSources: mocks.sources, syncStaleWearablesNow: mocks.stale }));
import { state } from '../js/state.js';
import { configureProfileRefreshDeps, reloadProfileRuntimeShell, refreshProfileWearables } from '../js/profile-runtime.js';
let chat, deps;
beforeEach(() => {
  vi.resetAllMocks();
  state.currentProfile = 'a';
  state.importedData = { entries: [] };
  state.chatThreads = [{ id: 'a-thread' }];
  state.nutritionSummary = { profile: 'a' };
  chat = Object.fromEntries(['loadCustomPersonalities', 'loadChatPersonality', 'loadChatThreads', 'ensureActiveThread', 'loadChatHistory', 'renderThreadList', 'updateChatHeaderTitle', 'updatePersonalityBar', 'updateDiscussButton'].map(key => [key, vi.fn()]));
  mocks.loaded.mockReturnValue(true);
  mocks.load.mockResolvedValue(chat);
  mocks.stale.mockResolvedValue(undefined);
  deps = Object.fromEntries(['hydrateNutritionSummary', 'destroyAllCharts', 'buildSidebar', 'navigate', 'getInitialView', 'updateHeaderDates', 'updateHeaderRangeToggle', 'renderProfileButton', 'migrateBiometricsToManual', 'syncWearableSummary'].map(key => [key, vi.fn()]));
  configureProfileRefreshDeps(deps);
});
function switchProfile() { state.currentProfile = 'b'; state.importedData = { entries: [] }; state.nutritionSummary = { profile: 'b' }; }
it('does not clear a new profile summary when stale hydration rejects', async () => {
  deps.hydrateNutritionSummary.mockImplementation(async () => { switchProfile(); throw new Error('old read failed'); });
  await reloadProfileRuntimeShell('a');
  expect(state.nutritionSummary).toEqual({ profile: 'b' });
  expect(mocks.load).not.toHaveBeenCalled();
});
it.each(['module', 'personalities', 'threads', 'history'])('stops a stale shell refresh after awaiting %s', async stage => {
  if (stage === 'module') mocks.load.mockImplementation(async () => { switchProfile(); return chat; });
  if (stage === 'personalities') chat.loadCustomPersonalities.mockImplementation(async () => switchProfile());
  if (stage === 'threads') chat.loadChatThreads.mockImplementation(async () => { switchProfile(); return true; });
  if (stage === 'history') chat.loadChatHistory.mockImplementation(async () => switchProfile());
  await reloadProfileRuntimeShell('a');
  expect(deps.navigate).not.toHaveBeenCalled();
  expect(chat.renderThreadList).not.toHaveBeenCalled();
  if (['module', 'personalities'].includes(stage)) expect(chat.loadChatPersonality).not.toHaveBeenCalled();
  if (stage !== 'history') expect(chat.loadChatHistory).not.toHaveBeenCalled();
});
it('renders the current shell without loading failed thread history', async () => {
  chat.loadChatThreads.mockResolvedValue(false);
  await reloadProfileRuntimeShell('a');
  expect(chat.loadChatHistory).not.toHaveBeenCalled();
  expect(chat.ensureActiveThread).not.toHaveBeenCalled();
  expect(deps.navigate).toHaveBeenCalledWith('dashboard');
});
it('keeps chat lazy while refreshing an unopened shell', async () => {
  mocks.loaded.mockReturnValue(false);
  await reloadProfileRuntimeShell('a');
  expect(mocks.load).not.toHaveBeenCalled();
  expect(deps.buildSidebar).toHaveBeenCalledOnce();
});
it('does not start wearable recovery for an already stale profile', async () => {
  switchProfile();
  await refreshProfileWearables('a', {});
  expect(mocks.recover).not.toHaveBeenCalled();
});
it.each(['recovery', 'migration', 'summary'])('stops wearable work after a profile switch during %s', async stage => {
  if (stage === 'recovery') mocks.recover.mockImplementation(async () => switchProfile());
  if (stage === 'migration') deps.migrateBiometricsToManual.mockImplementation(async () => switchProfile());
  if (stage === 'summary') deps.syncWearableSummary.mockImplementation(async () => switchProfile());
  await refreshProfileWearables('a', {});
  expect(mocks.stale).not.toHaveBeenCalled();
  if (stage !== 'summary') expect(deps.syncWearableSummary).not.toHaveBeenCalled();
});

it('rejects an old shell refresh even after returning to the same profile id', async () => {
  chat.loadCustomPersonalities.mockImplementation(async () => { switchProfile(); state.currentProfile = 'a'; });
  await reloadProfileRuntimeShell('a');
  expect(chat.loadChatPersonality).not.toHaveBeenCalled();
  expect(deps.navigate).not.toHaveBeenCalled();
});

it('clears only the current failed nutrition summary and completes the shell refresh', async () => {
  deps.hydrateNutritionSummary.mockRejectedValue(new Error('Hydration failed'));
  deps.getInitialView.mockReturnValue('labs');
  await reloadProfileRuntimeShell('a');
  expect(state.nutritionSummary).toBeNull();
  expect(chat.ensureActiveThread).toHaveBeenCalledOnce();
  expect(chat.loadChatHistory).toHaveBeenCalledOnce();
  expect(deps.navigate).toHaveBeenCalledExactlyOnceWith('labs');
  expect(deps.renderProfileButton).toHaveBeenCalledOnce();
});
it('does not start shell work for a stale profile', async () => {
  switchProfile();
  await reloadProfileRuntimeShell('a');
  expect(deps.hydrateNutritionSummary).not.toHaveBeenCalled();
  expect(mocks.load).not.toHaveBeenCalled();
});
it('leaves a new profile untouched when an old chat module load rejects', async () => {
  mocks.load.mockImplementation(async () => { switchProfile(); throw new Error('Module unavailable'); });
  await expect(reloadProfileRuntimeShell('a')).rejects.toThrow('Module unavailable');
  expect(deps.navigate).not.toHaveBeenCalled();
  expect(state.nutritionSummary).toEqual({ profile: 'b' });
});
it.each(['recovery', 'migration', 'summary'])('continues current-profile best-effort refresh after %s fails', async stage => {
  const failing = { recovery: mocks.recover, migration: deps.migrateBiometricsToManual, summary: deps.syncWearableSummary }[stage];
  failing.mockRejectedValue(new Error('Unavailable'));
  mocks.sources.mockReturnValue({ manual: {} });
  await refreshProfileWearables('a', { weight: 80 });
  expect(deps.syncWearableSummary).toHaveBeenCalledExactlyOnceWith('a', { manual: {} });
  expect(mocks.stale).toHaveBeenCalledOnce();
});
it.each(['recovery', 'migration', 'summary'])('stops refresh when the same profile gets a replacement snapshot during %s', async stage => {
  const pending = { recovery: mocks.recover, migration: deps.migrateBiometricsToManual, summary: deps.syncWearableSummary }[stage];
  pending.mockImplementation(async () => { state.importedData = { entries: [], contextNotes: 'Replacement' }; });
  await refreshProfileWearables('a', {});
  expect(mocks.stale).not.toHaveBeenCalled();
  if (stage !== 'summary') expect(deps.syncWearableSummary).not.toHaveBeenCalled();
});
