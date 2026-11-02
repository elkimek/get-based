import {afterEach, expect, it, vi} from 'vitest';
import {createSyncSaveHooks} from '../js/sync-save-hooks-core.js';
import {state} from '../js/state.js';
import {getSyncDirtyToken} from '../js/sync-dirty-state.js';

afterEach(() => {vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear();});
for (const {transientFirst, markerUnavailable} of [{transientFirst: false, markerUnavailable: false}, {transientFirst: true, markerUnavailable: false}, {transientFirst: false, markerUnavailable: true}]) {
  it(markerUnavailable ? 'retains an AI-setting request when its dirty marker cannot be saved' : `stops AI-setting retries after an unchanged receipt${transientFirst ? ' following an in-flight attempt' : ''}`, async () => {
    vi.useFakeTimers(); localStorage.clear();
    const events = new EventTarget(); vi.stubGlobal('window', events);
    const previousProfile = state.currentProfile, previousData = state.importedData;
    state.currentProfile = 'ai-settings-retry'; (state as {importedData: unknown}).importedData = {entries: []};
    const push = vi.fn(async () => ({ok: true, skipped: true, reason: 'unchanged'}));
    if (transientFirst) push.mockResolvedValueOnce({ok: false, skipped: true, reason: 'in-flight'});
    const hooks = createSyncSaveHooks({encryptedGetItem: async () => null,
      markChatDataLocal: () => {}, markCustomPersonalityDataLocal: () => {}, pushContextToGateway: () => {}});
    hooks.configureSyncSaveHooks({pushProfile: push, isSyncConfigured: () => true, isSyncEnabled: () => true,
      isEvoluReady: () => true, isSyncing: () => false, getProfiles: () => [{id: 'ai-settings-retry'}]});
    try {
      if (markerUnavailable) {
        const write = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {if (key.endsWith('-sync-dirty')) throw new Error('Synthetic storage fault'); write(key, value);});
      }
      hooks.bindSyncSaveHookEvents(); events.dispatchEvent(new Event('labcharts-ai-settings-local-changed'));
      await vi.advanceTimersByTimeAsync(6250);
      expect(push).toHaveBeenCalledTimes(transientFirst ? 2 : 1);
      if (markerUnavailable) expect(getSyncDirtyToken('ai-settings-retry')).toBeNull();
    } finally {hooks.clearSyncSaveTimers(); state.currentProfile = previousProfile; state.importedData = previousData;}
  });
}
