import { expect, it, vi } from 'vitest';
import { configureStartupSync } from '../js/sync-startup.js';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { isSyncConfigured, isSyncPaused, setSyncEnabled, setSyncPaused } from '../js/sync-settings-state.js';
import { configureSyncSaveHooks, clearSyncSaveTimers, onDataSaved, onChatSaved } from '../js/sync-save-hooks.js';
import { getSyncDirtyToken, discardSyncProfileDirty } from '../js/sync-dirty-state.js';

const transport = vi.hoisted(() => ({ loads: 0 }));
vi.mock('../js/sync.js', () => { transport.loads++; return {}; });

it.each(['unconfigured', 'enabled', 'paused'] as const)('retains local save and chat freshness ordering before %s sync transport loads', mode => {
  const profile = 'startup-save-ordering', beforeProfile = state.currentProfile, beforeData = state.importedData;
  const configured = isSyncConfigured(), paused = isSyncPaused(), previousHooks = configureSyncSaveHooks();
  const keys = ['labcharts-sync-enabled','labcharts-sync-paused','labcharts-chat-local-lock-until'];
  const saved = keys.map(key => [key,localStorage.getItem(key)] as const);
  const previousLock = sessionStorage.getItem('labcharts-chat-local-lock-until');
  const fetcher = vi.fn(); vi.stubGlobal('fetch',fetcher);
  try {
    state.currentProfile = profile; state.importedData = createDefaultProfileData();
    setSyncEnabled(mode !== 'unconfigured'); if (mode === 'paused') setSyncPaused(true);
    configureStartupSync();
    onDataSaved({immediate:true}); onChatSaved();
    expect(!!getSyncDirtyToken(profile)).toBe(mode !== 'unconfigured');
    expect(Number(sessionStorage.getItem('labcharts-chat-local-lock-until'))).toBeGreaterThan(Date.now());
    expect(transport.loads).toBe(0); expect(fetcher).not.toHaveBeenCalled();
  } finally {
    clearSyncSaveTimers(); discardSyncProfileDirty(profile); configureSyncSaveHooks(previousHooks);
    state.currentProfile = beforeProfile; state.importedData = beforeData;
    setSyncEnabled(configured,{persist:false}); if (paused) setSyncPaused(true);
    for (const [key,value] of saved) value === null ? localStorage.removeItem(key) : localStorage.setItem(key,value);
    previousLock === null ? sessionStorage.removeItem('labcharts-chat-local-lock-until') : sessionStorage.setItem('labcharts-chat-local-lock-until',previousLock);
    vi.unstubAllGlobals();
  }
});
