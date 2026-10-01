import { getRoutstrSessionKey } from '../js/routstr-session.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _setTestSessionKey,
  encryptedGetItem,
  getCachedKey,
  updateKeyCache,
} from '../js/crypto.js';
import { configureAppExtension } from '../js/app-extension-runtime.js';
import { _djb2 } from '../js/sync-delta-registry.js';
import { applyAISettings, applyDisplayPrefs } from '../js/sync-apply.js';
import {
  combinePulledAISettings,
  createPulledAISettingsSelection,
  selectPulledAISettings,
} from '../js/sync-pull.js';
import {
  configureSyncDelta,
} from '../js/sync-delta.js';
import {
  configureSyncDiagnosticsContext,
  currentDiagnosticAppOwner,
  currentDiagnosticEvolu,
  currentDiagnosticProfileQuery,
  currentDiagnosticPulling,
  currentDiagnosticSubscriptionFireCount,
  currentDiagnosticSyncEnabled,
  currentDiagnosticSyncing,
  currentDiagnosticTombstoneQuery,
} from '../js/sync-diagnostics-context.js';
import {
  clearSyncDisableStorage,
  isSyncDisableCleanupKey,
} from '../js/sync-disable-cleanup.js';
import { clearStaleSyncHashKeysOnce } from '../js/sync-pull-maintenance.js';
import { buildSyncPayload, configureSyncPayload, parseSyncPayload } from '../js/sync-payload.js';
import { collectAISettings } from '../js/sync-payload-collectors.js';
import {
  beginSyncRebroadcastSettling,
  finishSyncRebroadcastSettling,
  isSyncRebroadcastSettling,
  maybeScheduleRebroadcast,
} from '../js/sync-pull-rebroadcast.js';
import { waitForInitialReplicaQuiet } from '../js/sync-init.js';
import { planProfileDeltas } from '../js/sync-push-deltas.js';
import { configureSyncPush, isSyncPushInFlight, pushProfile } from '../js/sync-push.js';
import {
  configureSyncRuntimeCallbacks,
  dispatchSyncOwnerChangedRuntime,
  getSyncReloadUrlRuntime,
  refreshSyncedAIProviderUiRuntime,
  scheduleSyncRuntimeReload,
  setSyncAppOwner,
} from '../js/sync-runtime.js';
import {
  getRecentSyncEvents, getSyncDisplayState, resetSyncStatus, updateSyncStatus,
} from '../js/sync-state.js';
import { cleanStorage, configureSyncStorageCleanup } from '../js/sync-storage-cleanup.js';
import { state } from '../js/state.js';
import {
  _resetAgentAccessMigrationStateForTesting,
  clearAgentAccessMigrationDirty,
  clearLegacyAgentAccessSecrets,
  configureSyncMessenger,
  disableMessengerTokenLocal,
  generateMessengerToken,
  getAgentAccessState,
  getMessengerContextKey,
  getMessengerToken,
  isAgentAccessMigrationDirty,
  isMessengerEnabled,
  migrateLocalAgentAccessToProfile,
  pushContextToGateway,
  refreshAgentAccessFromSyncedProfile,
  revokeMessengerToken,
  setAgentAccessWearableSeriesDays,
} from '../js/sync-messenger.js';
import {
  getAgentWearableSeriesDays,
  setAgentWearableSeriesDays,
} from '../js/lab-context.js';
import { setSyncRelay } from '../js/sync-environment.js';
import { buildAgentAccessSetupCommand } from '../js/settings-agent-access-panel.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { deriveLegacyCustomMarkerId } from '../js/custom-marker-identity.js';

import { PROFILE_ID, PROFILE_QUERY, ITEM_ROW_QUERY, deltaKey, writeSnapshot, makeEvolu } from './helpers/sync-runtime-fixture.js';
let previousSyncRuntimeCallbacks;
let previousChatRuntimeCallbacks;
let refreshRoutstrBalance;
let updateChatHeaderModel;
let refreshWebSearchToggle;


function configureRuntimeDeps(fake) {
  configureSyncDelta({
    getEvolu: () => fake.evolu,
    getItemRowQuery: () => ITEM_ROW_QUERY,
  });
  configureSyncPush({
    getEvolu: () => fake.evolu,
    getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true,
    isPhase2CutoverEnabled: () => false,
    disablePhase2Cutover: vi.fn(),
    debug: vi.fn(),
  });
}

beforeEach(() => {
  configureAppExtension(null);
  _resetAgentAccessMigrationStateForTesting();
  localStorage.clear();
  sessionStorage.clear();
  updateKeyCache('labcharts-openrouter-key', '');
  updateKeyCache('labcharts-venice-key', '');
  updateKeyCache('labcharts-routstr-key', '');
  updateKeyCache('labcharts-routstr-sessions', '');
  updateKeyCache('labcharts-ppq-key', '');
  updateKeyCache('labcharts-custom-key', '');
  updateKeyCache('labcharts-cashu-wallet-mnemonic', '');
  updateChatHeaderModel = vi.fn();
  refreshWebSearchToggle = vi.fn();
  previousChatRuntimeCallbacks = configureChatRuntimeCallbacks({
    updateChatHeaderModel,
    refreshWebSearchToggle,
  });
  refreshRoutstrBalance = vi.fn();
  previousSyncRuntimeCallbacks = configureSyncRuntimeCallbacks({ refreshRoutstrBalance });
  state.currentProfile = PROFILE_ID;
  state.importedData = { entries: [], agentAccess: null };
  localStorage.setItem('labcharts-active-profile', PROFILE_ID);
  configureSyncMessenger({
    getSyncRelay: () => 'wss://sync.getbased.health',
    getAppOwner: () => null,
    debug: vi.fn(),
    buildLabContext: () => '',
    buildWearableSeriesSection: async () => '',
    getAgentWearableSeriesDays: () => 0,
  });
  configureRuntimeDeps(makeEvolu());
  configureSyncDiagnosticsContext();
});

afterEach(() => {
  configureAppExtension(null);
  configureSyncRuntimeCallbacks(previousSyncRuntimeCallbacks);
  configureChatRuntimeCallbacks(previousChatRuntimeCallbacks);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sync payload composition', () => {
  it('uses the configured profile provider for outbound metadata', async () => {
    const profile = {
      id: PROFILE_ID,
      name: 'Configured profile',
      lastUpdated: 123456,
      notes: 'local-only profile notes',
      height: 181,
    };
    const previous = configureSyncPayload({ getProfiles: () => [profile] });

    try {
      const payload = JSON.parse(await buildSyncPayload(PROFILE_ID, { entries: [] }));
      expect(payload.profile).toEqual({ id: PROFILE_ID, name: 'Configured profile' });
    } finally {
      configureSyncPayload(previous);
    }
  });
});

describe('sync apply runtime behavior', () => {
  it('selects a Routstr session by its own clock across newer unrelated profile rows', () => {
    let selection = createPulledAISettingsSelection();
    selection = selectPulledAISettings(selection, {
      'labcharts-venice-model': 'newest-general-setting',
      'labcharts-routstr-key': 'sk-zero-balance-stale-key',
      'labcharts-routstr-node': 'https://stale-node.example',
      'labcharts-routstr-session-updated-at': '100',
    }, 300);
    selection = selectPulledAISettings(selection, {
      'labcharts-venice-model': 'older-general-setting',
      'labcharts-routstr-key': 'sk-funded-key',
      'labcharts-routstr-node': 'https://funded-node.example',
      'labcharts-routstr-session-updated-at': '500',
    }, 200);

    expect(combinePulledAISettings(selection)).toEqual({
      'labcharts-venice-model': 'newest-general-setting',
      'labcharts-routstr-key': null,
      'labcharts-routstr-sessions': JSON.stringify({ version: 1, sessions: {
        'https://stale-node.example': { key: 'sk-zero-balance-stale-key', updatedAt: 100 },
        'https://funded-node.example': { key: 'sk-funded-key', updatedAt: 500 },
      } }),
      'labcharts-routstr-node': 'https://funded-node.example',
      'labcharts-routstr-session-updated-at': '500',
    });
  });

  it('makes an encrypted Routstr key usable immediately after an inbound sync', async () => {
    window.__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await _setTestSessionKey('SyncRoutstrPass1!');
    try {
      await applyAISettings({ 'labcharts-routstr-key': 'sk-routstr-remote', 'labcharts-routstr-node': 'https://sync-node.test' });
      expect(localStorage.getItem('labcharts-routstr-key')).toMatch(/^v1:/);
      expect(getRoutstrSessionKey()).toBe('sk-routstr-remote');

      sessionStorage.setItem('labcharts-ai-settings-local-lock-until', String(Date.now() + 60_000));
      await applyAISettings({ 'labcharts-routstr-key': 'sk-routstr-blocked', 'labcharts-routstr-node': 'https://sync-node.test' });
      expect(getRoutstrSessionKey()).toBe('sk-routstr-remote');
      await applyAISettings(
        { 'labcharts-routstr-key': 'sk-routstr-restored-owner', 'labcharts-routstr-node': 'https://sync-node.test' },
        { preferRemote: true },
      );
      expect(getRoutstrSessionKey()).toBe('sk-routstr-restored-owner');

      await applyAISettings({ 'labcharts-routstr-key': null, 'labcharts-routstr-node': 'https://sync-node.test' }, { preferRemote: true });
      expect(localStorage.getItem('labcharts-routstr-key')).toMatch(/^v1:/);
      expect(getRoutstrSessionKey()).toBe('');
    } finally {
      await _setTestSessionKey(null);
      delete window.__WEARABLES_TEST;
      localStorage.removeItem('labcharts-encryption-enabled');
    }
  });

  it('collects cleared AI settings as tombstones so provider removal syncs', async () => {
    localStorage.setItem('labcharts-routstr-key', 'sk-routstr-active');
    let settings = await collectAISettings();
    expect(settings['labcharts-routstr-key']).toBe('sk-routstr-active');
    expect(settings).not.toHaveProperty('labcharts-venice-key');

    localStorage.setItem('labcharts-routstr-key', '');
    settings = await collectAISettings();
    expect(settings['labcharts-routstr-key']).toBeNull();
  });

  it('collects and restores extension-owned settings with declared encryption', async () => {
    window.__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await _setTestSessionKey('SyncExtensionPass1!');
    configureAppExtension({
      id: 'sync-test-edition',
      isAvailable: () => true,
      sync: {
        storageKeys: ['edition-key'],
        storagePrefixes: ['edition-profile-'],
        encryptedStoragePrefixes: ['edition-secret-'],
      },
    });

    try {
      localStorage.setItem('edition-key', 'plain-value');
      localStorage.setItem('edition-profile-a', 'profile-value');
      localStorage.setItem('edition-secret-a', 'secret-value');
      localStorage.setItem('edition-ignored', 'ignored-value');
      const settings = await collectAISettings();

      expect(settings).toMatchObject({
        'edition-key': 'plain-value',
        'edition-profile-a': 'profile-value',
        'edition-secret-a': 'secret-value',
      });
      expect(settings).not.toHaveProperty('edition-ignored');

      localStorage.removeItem('edition-key');
      localStorage.removeItem('edition-profile-a');
      localStorage.removeItem('edition-secret-a');
      updateKeyCache('edition-secret-a', '');
      await applyAISettings(settings);

      expect(localStorage.getItem('edition-key')).toBe('plain-value');
      expect(localStorage.getItem('edition-profile-a')).toBe('profile-value');
      expect(localStorage.getItem('edition-secret-a')).toMatch(/^v1:/);
      await expect(encryptedGetItem('edition-secret-a')).resolves.toBe('secret-value');
    } finally {
      updateKeyCache('edition-secret-a', '');
      await _setTestSessionKey(null);
      delete window.__WEARABLES_TEST;
      localStorage.removeItem('labcharts-encryption-enabled');
    }
  });

  it('keeps extension settings atomic under the local AI lock and lets coherent remote transitions override it', async () => {
    const applied = vi.fn();
    configureAppExtension({
      id: 'sync-atomic-edition',
      isAvailable: () => true,
      sync: {
        storageKeys: ['edition-key-source'],
        encryptedStoragePrefixes: ['edition-profile-'],
        resolveConflicts: ({ settings }) => settings['edition-key-source'] === 'remote-transition'
          ? { preferRemoteKeys: ['edition-key-source', 'edition-profile-a'] }
          : { keepLocalKeys: ['edition-key-source', 'edition-profile-a'] },
        onApplied: applied,
      },
    });
    localStorage.setItem('edition-key-source', 'local-source');
    localStorage.setItem('edition-profile-a', 'local-meta');

    await applyAISettings({
      'edition-key-source': 'ordinary-remote',
      'edition-profile-a': 'ordinary-remote-meta',
    });
    expect(localStorage.getItem('edition-key-source')).toBe('local-source');
    expect(localStorage.getItem('edition-profile-a')).toBe('local-meta');
    expect(applied).not.toHaveBeenCalled();

    sessionStorage.setItem('labcharts-ai-settings-local-lock-until', String(Date.now() + 60_000));
    await applyAISettings({
      'edition-key-source': 'remote-transition',
      'edition-profile-a': 'transition-meta',
    });
    expect(localStorage.getItem('edition-key-source')).toBe('remote-transition');
    expect(localStorage.getItem('edition-profile-a')).toMatch(/^d1:/);
    await expect(encryptedGetItem('edition-profile-a')).resolves.toBe('transition-meta');
    await vi.waitFor(() => expect(applied).toHaveBeenCalledWith({
      settings: {
        'edition-key-source': 'remote-transition',
        'edition-profile-a': 'transition-meta',
      },
      changedKeys: ['edition-key-source', 'edition-profile-a'],
    }));
  });

  it('applies only newer Routstr sessions through a local settings lock and refreshes balance', async () => {
    localStorage.setItem('labcharts-routstr-key', 'sk-local-zero');
    localStorage.setItem('labcharts-routstr-node', 'https://node.local.test');
    localStorage.setItem('labcharts-routstr-session-updated-at', '100');
    updateKeyCache('labcharts-routstr-key', 'sk-local-zero');
    sessionStorage.setItem('labcharts-ai-settings-local-lock-until', String(Date.now() + 60_000));

    await applyAISettings({
      'labcharts-routstr-key': 'sk-remote-funded',
      'labcharts-routstr-node': 'https://node.remote.test',
      'labcharts-routstr-session-updated-at': '200',
    });
    expect(getRoutstrSessionKey()).toBe('sk-remote-funded');
    expect(localStorage.getItem('labcharts-routstr-node')).toBe('https://node.remote.test');
    expect(localStorage.getItem('labcharts-routstr-session-updated-at')).toBe('200');
    expect(refreshRoutstrBalance).toHaveBeenCalledTimes(1);

    await applyAISettings({
      'labcharts-routstr-key': 'sk-stale',
      'labcharts-routstr-node': 'https://node.stale.test',
      'labcharts-routstr-session-updated-at': '150',
    });
    expect(getRoutstrSessionKey()).toBe('sk-remote-funded');
    expect(refreshRoutstrBalance).toHaveBeenCalledTimes(1);

    await applyAISettings({
      'labcharts-routstr-key': 'sk-legacy-profile-row',
      'labcharts-routstr-node': 'https://node.legacy.test',
    });
    expect(getRoutstrSessionKey()).toBe('sk-remote-funded');
    expect(localStorage.getItem('labcharts-routstr-node')).toBe('https://node.remote.test');
    expect(refreshRoutstrBalance).toHaveBeenCalledTimes(1);

    await applyAISettings({
      'labcharts-routstr-key': 'sk-remote-funded',
      'labcharts-routstr-node': 'https://node.remote.test',
      'labcharts-routstr-session-updated-at': '300',
    });
    expect(refreshRoutstrBalance).toHaveBeenCalledTimes(2);
  });

  it('applies remote AI settings, respects local locks, and writes display prefs', async () => {
    await applyAISettings({
      'labcharts-ai-provider': 'openrouter',
      'labcharts-openrouter-key': 'sk-remote',
      'labcharts-custom-url': 'x'.repeat(10001),
      'ignored-key': 'ignored',
    });

    expect(localStorage.getItem('labcharts-ai-provider')).toBe('openrouter');
    expect(localStorage.getItem('labcharts-openrouter-key')).toMatch(/^d1:/);
    await expect(encryptedGetItem('labcharts-openrouter-key')).resolves.toBe('sk-remote');
    expect(localStorage.getItem('labcharts-custom-url')).toBeNull();
    expect(updateChatHeaderModel).toHaveBeenCalledTimes(1);
    expect(refreshWebSearchToggle).toHaveBeenCalledTimes(1);

    sessionStorage.setItem('or_oauth_local_settings_lock_until', String(Date.now() + 60_000));
    localStorage.setItem('labcharts-ai-provider', 'local-provider');
    localStorage.setItem('labcharts-openrouter-key', 'sk-local');
    await applyAISettings({
      'labcharts-ai-provider': 'remote-provider',
      'labcharts-openrouter-key': 'sk-remote-2',
      'labcharts-venice-model': 'venice-remote',
    });

    expect(localStorage.getItem('labcharts-ai-provider')).toBe('local-provider');
    expect(localStorage.getItem('labcharts-openrouter-key')).toBe('sk-local');
    expect(localStorage.getItem('labcharts-venice-model')).toBe('venice-remote');

    sessionStorage.setItem('labcharts-ai-settings-local-lock-until', String(Date.now() + 60_000));
    localStorage.setItem('labcharts-venice-model', 'venice-local');
    await applyAISettings({ 'labcharts-venice-model': 'venice-locked-remote' });
    expect(localStorage.getItem('labcharts-venice-model')).toBe('venice-local');

    applyDisplayPrefs(PROFILE_ID, {
      units: 'si',
      rangeMode: 'functional',
      phaseOverlay: '1',
      unknown: 'ignored',
    });
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-units`)).toBe('si');
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-rangeMode`)).toBe('functional');
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-phaseOverlay`)).toBe('1');
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-unknown`)).toBeNull();
  });

  it('routes synced AI and owner UI hooks through sync runtime helpers', () => {
    const events = [];
    const recordOwnerEvent = event => {
      events.push(event.detail);
    };
    updateChatHeaderModel = vi.fn();
    refreshWebSearchToggle = vi.fn();
    configureChatRuntimeCallbacks({ updateChatHeaderModel, refreshWebSearchToggle });
    window.addEventListener('labcharts-sync-owner-changed', recordOwnerEvent);

    try {
      expect(refreshSyncedAIProviderUiRuntime()).toBe(true);
      expect(updateChatHeaderModel).toHaveBeenCalledTimes(1);
      expect(refreshWebSearchToggle).toHaveBeenCalledTimes(1);

      expect(dispatchSyncOwnerChangedRuntime('owner-runtime')).toBe(true);
      expect(events.at(-1)).toEqual({ ownerId: 'owner-runtime', ready: true });

      setSyncAppOwner({ id: 'owner-state' });
      expect(events.at(-1)).toEqual({ ownerId: 'owner-state', ready: true });
    } finally {
      setSyncAppOwner(null);
      window.removeEventListener('labcharts-sync-owner-changed', recordOwnerEvent);
    }
  });

  it('routes sync reload path and delayed reload through runtime helpers', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/sync-runtime-test', search: '?evolu-client=v7', reload },
    });

    expect(getSyncReloadUrlRuntime()).toBe('/sync-runtime-test?evolu-client=v7');
    expect(scheduleSyncRuntimeReload(250)).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('sync diagnostics context runtime behavior', () => {
  it('returns configured diagnostic dependencies and falls back safely after getter failures', () => {
    const values = {
      evolu: { db: true },
      profileQuery: { profile: true },
      tombstoneQuery: { tombstone: true },
      owner: { id: 'owner-1' },
    };
    configureSyncDiagnosticsContext({
      getEvolu: () => values.evolu,
      getProfileQuery: () => values.profileQuery,
      getTombstoneQuery: () => values.tombstoneQuery,
      getAppOwner: () => values.owner,
      isSyncEnabled: () => 1,
      getSubscriptionFireCount: () => '7',
      isSyncing: () => 'yes',
      isPulling: () => 0,
    });

    expect(currentDiagnosticEvolu()).toBe(values.evolu);
    expect(currentDiagnosticProfileQuery()).toBe(values.profileQuery);
    expect(currentDiagnosticTombstoneQuery()).toBe(values.tombstoneQuery);
    expect(currentDiagnosticAppOwner()).toBe(values.owner);
    expect(currentDiagnosticSyncEnabled()).toBe(true);
    expect(currentDiagnosticSubscriptionFireCount()).toBe(7);
    expect(currentDiagnosticSyncing()).toBe(true);
    expect(currentDiagnosticPulling()).toBe(false);

    configureSyncDiagnosticsContext({
      getEvolu: () => { throw new Error('evolu failed'); },
      getProfileQuery: () => { throw new Error('profile failed'); },
      getTombstoneQuery: () => { throw new Error('tombstone failed'); },
      getAppOwner: () => { throw new Error('owner failed'); },
      isSyncEnabled: () => { throw new Error('enabled failed'); },
      getSubscriptionFireCount: () => { throw new Error('count failed'); },
      isSyncing: () => { throw new Error('syncing failed'); },
      isPulling: () => { throw new Error('pulling failed'); },
    });

    expect(currentDiagnosticEvolu()).toBeNull();
    expect(currentDiagnosticProfileQuery()).toBeNull();
    expect(currentDiagnosticTombstoneQuery()).toBeNull();
    expect(currentDiagnosticAppOwner()).toBeNull();
    expect(currentDiagnosticSyncEnabled()).toBe(false);
    expect(currentDiagnosticSubscriptionFireCount()).toBe(0);
    expect(currentDiagnosticSyncing()).toBe(false);
    expect(currentDiagnosticPulling()).toBe(false);
  });
});



describe('sync push runtime behavior', () => {
  it('shows a checking state until the relay probe has completed', () => {
    try {
      resetSyncStatus();
      expect(getSyncDisplayState(true)).toBe('syncing');
      updateSyncStatus({ relay: 'connected' });
      expect(getSyncDisplayState(true)).toBe('synced');
    } finally {
      resetSyncStatus();
    }
  });

  it('rejects unavailable profile data before writing any relay rows', async () => {
    const fake = makeEvolu();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    configureRuntimeDeps(fake);

    await expect(pushProfile(PROFILE_ID, null)).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'missing-profile-data',
    });

    expect(fake.calls.insert).toHaveLength(0);
    expect(fake.calls.update).toHaveLength(0);
    expect(isSyncPushInFlight()).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('imported profile data is unavailable'));
  });

  it('inserts and updates profile rows only after a committed push and records local commit state', async () => {
    const fake = makeEvolu();
    const debug = vi.fn();
    configureSyncDelta({
      getEvolu: () => fake.evolu,
      getItemRowQuery: () => ITEM_ROW_QUERY,
    });
    configureSyncPush({
      getEvolu: () => fake.evolu,
      getProfileQuery: () => PROFILE_QUERY,
      isSyncEnabled: () => true,
      isPhase2CutoverEnabled: () => false,
      disablePhase2Cutover: vi.fn(),
      debug,
    });

    await expect(pushProfile(PROFILE_ID, {
      sunSessions: [{ id: 'sun-1', date: '2026-06-01' }],
      lightDevices: [{ id: 'device-1', name: 'Panel' }],
    })).resolves.toEqual({ ok: true });

    expect(fake.calls.insert.find(call => call.table === 'profileData')?.args).toMatchObject({
      profileId: PROFILE_ID,
    });
    expect(fake.calls.insert.filter(call => call.table === 'itemRow').length).toBeGreaterThanOrEqual(2);
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-ts`)).toMatch(/^\d+$/);
    expect(isSyncPushInFlight()).toBe(false);

    await expect(pushProfile(PROFILE_ID, { sunSessions: [{ id: 'sun-1', date: '2026-06-02' }] })).resolves.toEqual({ ok: true });
    expect(fake.calls.update.find(call => call.table === 'profileData')?.args).toMatchObject({
      id: 'profile-row-1',
      profileId: PROFILE_ID,
    });
    expect(debug).toHaveBeenCalledWith(expect.stringContaining(`Queued ${PROFILE_ID.slice(0, 8)}`));
  });

  it('normalizes legacy importedData before writing sync payloads and deltas', async () => {
    const fake = makeEvolu();
    configureRuntimeDeps(fake);

    await expect(pushProfile(PROFILE_ID, {
      entries: [{
        date: '2026-01-01',
        markers: { 'hormones.cPeptide': 1, 'customPanel.acetoacetate': 2 },
      }],
      customMarkers: {
        'hormones.cPeptide': { name: 'C-peptide' },
        'customPanel.acetoacetate': { name: 'Acetoacetate' },
      },
      markerPlacements: {
        [deriveLegacyCustomMarkerId('customPanel.acetoacetate')]: {
          categoryKey: 'biochemistry',
        },
      },
    })).resolves.toEqual({ ok: true });

    const profileWrite = fake.calls.insert.find(call => call.table === 'profileData')?.args;
    const parsed = await parseSyncPayload(profileWrite?.dataJson || '{}');
    expect(parsed.importedData.entries[0].markers['diabetes.cPeptide']).toBe(1);
    expect(parsed.importedData.entries[0].markers['hormones.cPeptide']).toBeUndefined();
    expect(parsed.importedData.customMarkers['hormones.cPeptide']).toBeUndefined();
    expect(parsed.importedData.customMarkers['customPanel.acetoacetate'].markerId)
      .toBe(deriveLegacyCustomMarkerId('customPanel.acetoacetate'));
    expect(parsed.importedData.markerPlacements).toEqual({
      [deriveLegacyCustomMarkerId('customPanel.acetoacetate')]: {
        categoryKey: 'biochemistry',
      },
    });
    const placementRow = fake.calls.insert.find(call =>
      call.table === 'itemRow' && call.args.arrayName === 'markerPlacements');
    expect(placementRow?.args.itemId).toMatch(/^mpl_[a-f0-9]+$/);
    expect(JSON.parse(placementRow?.args.payload || '{}')).toEqual({
      k: deriveLegacyCustomMarkerId('customPanel.acetoacetate'),
      v: { categoryKey: 'biochemistry' },
    });
  });

  it('does not append another Evolu message when the complete outbound state is unchanged', async () => {
    const fake = makeEvolu();
    configureRuntimeDeps(fake);
    const data = {
      entries: [],
      sunSessions: [{ id: 'sun-stable', date: '2026-06-03' }],
    };

    await expect(pushProfile(PROFILE_ID, data)).resolves.toEqual({ ok: true });
    const writesAfterFirstPush = fake.calls.insert.length + fake.calls.update.length;

    await expect(pushProfile(PROFILE_ID, data)).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: 'unchanged',
    });
    expect(fake.calls.insert.length + fake.calls.update.length).toBe(writesAfterFirstPush);

    await expect(pushProfile(PROFILE_ID, data, { force: true })).resolves.toEqual({ ok: true });
    expect(fake.calls.insert.length + fake.calls.update.length).toBeGreaterThan(writesAfterFirstPush);
  });

  it('skips concurrent pushes and releases the in-flight flag through the watchdog', async () => {
    vi.useFakeTimers();
    const fake = makeEvolu({ completeProfileWrites: false });
    configureRuntimeDeps(fake);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const firstPush = pushProfile(PROFILE_ID, { sunSessions: [{ id: 'sun-hung' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(isSyncPushInFlight()).toBe(true);

    await expect(pushProfile(PROFILE_ID, { sunSessions: [{ id: 'sun-skipped' }] })).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'in-flight',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('another push is in-flight'));

    await vi.advanceTimersByTimeAsync(30_000);
    await expect(firstPush).resolves.toEqual({ ok: false, reason: 'timeout' });
    expect(isSyncPushInFlight()).toBe(false);
  });
});

describe('sync cleanup and rebroadcast runtime behavior', () => {
  it('persists trimmed change history through the configured data saver', async () => {
    const previousImportedData = state.importedData;
    const saveImportedData = vi.fn().mockResolvedValue(true);
    const previousDeps = configureSyncStorageCleanup({ saveImportedData });
    state.importedData = {
      changeHistory: Array.from({ length: 205 }, (_, index) => ({ index })),
    };

    try {
      const result = await cleanStorage();

      expect(result.historyTrimmed).toBe(5);
      expect(state.importedData.changeHistory).toHaveLength(200);
      expect(saveImportedData).toHaveBeenCalledOnce();
    } finally {
      state.importedData = previousImportedData;
      configureSyncStorageCleanup(previousDeps);
    }
  });

  it('recognizes and clears disable-time sync storage plus stale pull hash keys', () => {
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-delta-sunSessions`)).toBe(true);
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-sync-cutover-v2`)).toBe(true);
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-relay-bytes-total`)).toBe(true);
    expect(isSyncDisableCleanupKey(`labcharts-relay-cap-owner-runtime`)).toBe(true);
    expect(isSyncDisableCleanupKey('labcharts-sync-restore-join-pending')).toBe(true);
    expect(isSyncDisableCleanupKey('labcharts-relay-quota-warned')).toBe(true);
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-imported`)).toBe(false);

    localStorage.setItem(`labcharts-${PROFILE_ID}-sync-ts`, '123');
    localStorage.setItem(`labcharts-${PROFILE_ID}-delta-sunSessions`, '{}');
    localStorage.setItem(`labcharts-${PROFILE_ID}-delta-sunSessions-meta`, '{}');
    localStorage.setItem(`labcharts-${PROFILE_ID}-sync-cutover-v2`, '1');
    localStorage.setItem(`labcharts-${PROFILE_ID}-relay-bytes-total`, '99');
    localStorage.setItem('labcharts-relay-cap-owner-runtime', String(200 * 1024 * 1024));
    localStorage.setItem('labcharts-relay-quota-warned', '1');
    localStorage.setItem(`labcharts-${PROFILE_ID}-imported`, '{"keep":true}');

    clearSyncDisableStorage();

    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-ts`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-delta-sunSessions`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-delta-sunSessions-meta`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-cutover-v2`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-relay-bytes-total`)).toBeNull();
    expect(localStorage.getItem('labcharts-relay-cap-owner-runtime')).toBeNull();
    expect(localStorage.getItem('labcharts-relay-quota-warned')).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-imported`)).toBe('{"keep":true}');

    localStorage.setItem(`labcharts-${PROFILE_ID}-sync-dirty`, 'restore-token');
    localStorage.setItem('labcharts-other-profile-sync-dirty', 'stale-token');
    clearSyncDisableStorage({ preserveDirtyProfileIds: [PROFILE_ID] });
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-dirty`)).toBe('restore-token');
    expect(localStorage.getItem('labcharts-other-profile-sync-dirty')).toBeNull();
    localStorage.removeItem(`labcharts-${PROFILE_ID}-sync-dirty`);

    const debug = vi.fn();
    localStorage.setItem(`labcharts-${PROFILE_ID}-sync-hash`, 'old-hash');
    localStorage.setItem('labcharts-not-sync-hash-extra', 'keep');
    clearStaleSyncHashKeysOnce(debug);
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-hash`)).toBeNull();
    expect(localStorage.getItem('labcharts-not-sync-hash-extra')).toBe('keep');
    expect(localStorage.getItem('labcharts-sync-hash-v2-migrated')).toBe('1');
    expect(debug).toHaveBeenCalledWith('Cleared 1 stale -sync-hash keys (one-time migration)');

    clearStaleSyncHashKeysOnce(debug);
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it('schedules rebroadcasts only for active profiles with available budget and idle push state', async () => {
    vi.useFakeTimers();
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    state.currentProfile = PROFILE_ID;
    try {
      resetSyncStatus();

      const pushProfileSpy = vi.fn();
      const debug = vi.fn();
      const merged = { sunSessions: [{ id: 'sun-1' }] };
      state.importedData = merged;

      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(true);
      expect(pushProfileSpy).not.toHaveBeenCalled();

      const latest = { sunSessions: [{ id: 'sun-1' }], contextNotes: 'newer local value' };
      state.importedData = latest;
      await vi.advanceTimersByTimeAsync(100);
      expect(pushProfileSpy).toHaveBeenCalledWith(PROFILE_ID, latest);
      expect(getRecentSyncEvents().at(-1)).toMatchObject({
        kind: 'rebroadcast',
        text: `Rebroadcast ${PROFILE_ID.slice(0, 8)}`,
      });

      updateSyncStatus({ push: 'pending' });
      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(false);
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('rebroadcast deferred'));
      expect(getRecentSyncEvents().at(-1)).toMatchObject({ kind: 'skip' });

      resetSyncStatus();
      state.currentProfile = 'other-profile';
      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(false);

      state.currentProfile = PROFILE_ID;
      maybeScheduleRebroadcast({ profileId: PROFILE_ID, needsRebroadcast: true, pushProfile: pushProfileSpy });
      maybeScheduleRebroadcast({ profileId: PROFILE_ID, needsRebroadcast: true, pushProfile: pushProfileSpy });
      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(false);
      expect(getRecentSyncEvents().at(-1)).toMatchObject({
        kind: 'skip',
        text: 'Rebroadcast budget exhausted \u2014 possible clock skew',
      });
    } finally {
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
    }
  });

  it('holds automatic rebroadcast until the Evolu 8 startup replica is quiet', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const pushProfileSpy = vi.fn();
    const debug = vi.fn();
    state.currentProfile = PROFILE_ID;
    state.importedData = { notes: [{ text: 'durable-local' }] };
    try {
      beginSyncRebroadcastSettling();
      expect(isSyncRebroadcastSettling()).toBe(true);
      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(false);
      expect(pushProfileSpy).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('initial replica still settling'));

      finishSyncRebroadcastSettling();
      expect(isSyncRebroadcastSettling()).toBe(false);
    } finally {
      finishSyncRebroadcastSettling();
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
    }
  });

  it('waits for subscription activity and pulls to remain quiet', async () => {
    let now = 0;
    let fireCount = 0;
    let pulling = false;
    const quiet = await waitForInitialReplicaQuiet({
      getFireCount: () => fireCount,
      isPulling: () => pulling,
      now: () => now,
      wait: async ms => {
        now += ms;
        if (now === 500) fireCount++;
        if (now === 1000) pulling = true;
        if (now === 1250) pulling = false;
      },
    });
    expect(quiet).toBe(true);
    expect(now).toBe(1750);
  });
});

describe('synced Agent Access state', () => {
  it('treats synced profile Agent Access as enabled even when this origin has no local toggle', () => {
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'a'.repeat(64),
      contextKey: 'gbctx_v1_' + 'A'.repeat(43),
      wearableSeriesDays: 90,
      updatedAt: 123,
    };
    localStorage.removeItem('labcharts-messenger-enabled');
    localStorage.removeItem('labcharts-messenger-token');
    localStorage.removeItem('labcharts-agent-context-key');
    localStorage.removeItem(`labcharts-${PROFILE_ID}-agent-wearable-series`);

    expect(isMessengerEnabled()).toBe(true);
    expect(getMessengerToken()).toBe('a'.repeat(64));
    expect(getMessengerContextKey()).toBe('gbctx_v1_' + 'A'.repeat(43));
    expect(getAgentAccessState().wearableSeriesDays).toBe(90);
    expect(getAgentWearableSeriesDays()).toBe(90);

    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-agent-wearable-series`)).toBe('90');
  });

  it('builds one-paste setup commands carrying token, context key, gateway, and selected client', () => {
    const token = 't'.repeat(64);
    const contextKey = 'gbctx_v1_' + 'C'.repeat(43);
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token,
      contextKey,
      updatedAt: 123,
    };
    setSyncRelay('wss://sync.getbased.health/app');
    vi.stubGlobal('location', { hostname: 'localhost' });

    for (const client of ['hermes', 'openclaw', 'claude-code', 'codex']) {
      const command = buildAgentAccessSetupCommand(client);

      expect(command).toMatch(new RegExp(`^curl -fsSL https:\\/\\/getbased\\.health\\/install\\.sh \\| bash -s -- connect ${client} --setup 'gbsetup_v1_[A-Za-z0-9_-]+'$`));
      const setup = command.match(/--setup '([^']+)'/)?.[1];
      expect(setup).toBeTruthy();
      const raw = setup.slice('gbsetup_v1_'.length).replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')));
      expect(payload).toMatchObject({
        version: 1,
        token,
        contextKey,
        gateway: 'https://sync.getbased.health/app',
        client,
      });
      expect(typeof payload.createdAt).toBe('string');
    }
  });

  it('migrates legacy local Agent Access into synced profile state and delta rows', async () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'b'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'B'.repeat(43));
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, '30');

    const migrated = migrateLocalAgentAccessToProfile();
    expect(migrated.enabled).toBe(true);
    expect(migrated.token).toBe('b'.repeat(64));
    expect(migrated.contextKey).toBe('gbctx_v1_' + 'B'.repeat(43));
    expect(getAgentAccessState().wearableSeriesDays).toBe(30);
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'b'.repeat(64),
      contextKey: 'gbctx_v1_' + 'B'.repeat(43),
    });
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(30);
    expect(isAgentAccessMigrationDirty()).toBe(true);
    clearAgentAccessMigrationDirty();
    expect(isAgentAccessMigrationDirty()).toBe(false);
    const migratedUpdatedAt = state.importedData.agentAccess.updatedAt;
    getAgentAccessState();
    expect(state.importedData.agentAccess.updatedAt).toBe(migratedUpdatedAt);

    const fake = makeEvolu();
    configureRuntimeDeps(fake);
    const { deltaPlans } = await planProfileDeltas(PROFILE_ID, state.importedData);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccess')).toBe(true);
  });

  it('migrates an explicit legacy off wearable-series preference into the synced scalar', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'o'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'O'.repeat(43));
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, 'off');

    const migrated = migrateLocalAgentAccessToProfile();

    expect(migrated.enabled).toBe(true);
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(0);
    expect(getAgentWearableSeriesDays()).toBe(0);
  });

  it('pushContextToGateway explicitly migrates legacy credentials before checking enabled state', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'p'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'P'.repeat(43));
    state.importedData.agentAccess = null;

    pushContextToGateway();

    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'p'.repeat(64),
      contextKey: 'gbctx_v1_' + 'P'.repeat(43),
    });
    expect(isMessengerEnabled()).toBe(true);
    vi.clearAllTimers();
  });

  it('builds Agent Access payloads through configured context providers', async () => {
    vi.useFakeTimers();
    const buildLabContext = vi.fn(() => 'base context');
    const buildWearableSeriesSection = vi.fn(async () => 'wearable series');
    const getAgentWearableSeriesDays = vi.fn(() => 7);
    let markPushComplete = () => {};
    const pushComplete = new Promise(resolve => { markPushComplete = resolve; });
    const debug = vi.fn(message => {
      if (String(message).startsWith('Encrypted context pushed')) markPushComplete();
    });
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    configureSyncMessenger({
      getSyncRelay: () => 'wss://sync.getbased.health',
      getAppOwner: () => ({ id: 'abcdefghijklmnopqrstuv', writeKey: new Uint8Array(32).fill(7) }),
      debug,
      buildLabContext,
      buildWearableSeriesSection,
      getAgentWearableSeriesDays,
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'q'.repeat(64),
      contextKey: 'gbctx_v1_' + 'Q'.repeat(43),
      updatedAt: 123,
    };

    pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    await pushComplete;

    expect(buildLabContext).toHaveBeenCalledWith();
    expect(getAgentWearableSeriesDays).toHaveBeenCalledOnce();
    expect(buildWearableSeriesSection).toHaveBeenCalledWith(7);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('stops retrying an Agent Access token bound to another Sync identity until the token changes', async () => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let resolveFirstFetch = () => {};
    let resolveSecondFetch = () => {};
    const firstFetch = new Promise(resolve => { resolveFirstFetch = resolve; });
    const secondFetch = new Promise(resolve => { resolveSecondFetch = resolve; });
    const fetchSpy = vi.fn(async () => {
      if (fetchSpy.mock.calls.length === 1) resolveFirstFetch();
      if (fetchSpy.mock.calls.length === 2) resolveSecondFetch();
      return new Response('{"error":"token_owner_mismatch"}', {
        status: 409, headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    configureSyncMessenger({
      getSyncRelay: () => 'wss://sync.getbased.health',
      getAppOwner: () => ({ id: 'new-sync-owner', writeKey: new Uint8Array(32).fill(7) }),
      debug: vi.fn(),
      buildLabContext: () => 'base context',
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'q'.repeat(64),
      contextKey: 'gbctx_v1_' + 'Q'.repeat(43),
      updatedAt: 123,
    };

    pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    await firstFetch;
    await vi.waitFor(() => expect(warning).toHaveBeenCalledWith(expect.stringContaining('Regenerate it')));
    expect(fetchSpy).toHaveBeenCalledOnce();

    pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledOnce();

    generateMessengerToken();
    pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    await secondFetch;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending context push when switching to a profile without Agent Access', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    configureSyncMessenger({
      getSyncRelay: () => 'wss://sync.getbased.health',
      getAppOwner: () => ({ id: 'abcdefghijklmnopqrstuv', writeKey: new Uint8Array(32).fill(7) }),
      debug: vi.fn(),
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'q'.repeat(64),
      contextKey: 'gbctx_v1_' + 'Q'.repeat(43),
      updatedAt: 123,
    };

    pushContextToGateway();
    state.currentProfile = 'profile-without-agent-access';
    localStorage.setItem('labcharts-active-profile', 'profile-without-agent-access');
    state.importedData.agentAccess = null;
    refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });
    pushContextToGateway();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cancels a pending context push when Agent Access is revoked before the debounce fires', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    configureSyncMessenger({
      getSyncRelay: () => 'wss://sync.getbased.health',
      getAppOwner: () => null,
      debug: vi.fn(),
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'r'.repeat(64),
      contextKey: 'gbctx_v1_' + 'R'.repeat(43),
      updatedAt: 123,
    };

    pushContextToGateway();
    revokeMessengerToken();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('profile-switch refresh does not mirror the departed profile series preference under the new profile key', () => {
    state.currentProfile = 'new-profile';
    localStorage.setItem('labcharts-active-profile', 'new-profile');
    state.importedData.agentAccess = null;
    state.importedData.agentAccessWearableSeriesDays = 90;
    localStorage.removeItem('labcharts-new-profile-agent-wearable-series');

    const refreshed = refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });

    expect(refreshed).toMatchObject({ enabled: false, token: null, contextKey: null, wearableSeriesDays: 0 });
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(0);
    expect(getAgentWearableSeriesDays()).toBe(0);
    expect(localStorage.getItem('labcharts-new-profile-agent-wearable-series')).toBe('off');
  });

  it('does not let stale legacy localStorage resurrect Agent Access after a synced revoke', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'c'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'C'.repeat(43));
    state.importedData.agentAccess = {
      version: 1,
      enabled: false,
      token: null,
      contextKey: null,
      wearableSeriesDays: 0,
      revokedAt: 999,
      updatedAt: 999,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: false,
      token: null,
      contextKey: null,
      revokedAt: 999,
    });
    expect(isMessengerEnabled()).toBe(false);
    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('false');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('does not let stale legacy localStorage overwrite a regenerated synced token', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'd'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'D'.repeat(43));
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'e'.repeat(64),
      contextKey: 'gbctx_v1_' + 'E'.repeat(43),
      wearableSeriesDays: 30,
      migratedFromLocalStorageAt: 111,
      credentialCreatedAt: 222,
      revokedAt: null,
      updatedAt: 333,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: true,
      token: 'e'.repeat(64),
      contextKey: 'gbctx_v1_' + 'E'.repeat(43),
      wearableSeriesDays: 30,
      migratedFromLocalStorageAt: 111,
    });
    expect(getMessengerToken()).toBe('e'.repeat(64));
    expect(getMessengerContextKey()).toBe('gbctx_v1_' + 'E'.repeat(43));
    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('trusts synced regenerated credentials even when the local state was originally generated, not migrated', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'g'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'G'.repeat(43));
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'h'.repeat(64),
      contextKey: 'gbctx_v1_' + 'H'.repeat(43),
      wearableSeriesDays: 0,
      credentialCreatedAt: 222,
      revokedAt: null,
      updatedAt: 333,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: true,
      token: 'h'.repeat(64),
      contextKey: 'gbctx_v1_' + 'H'.repeat(43),
    });
    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('profile-switch refresh clears stale legacy credentials instead of importing them into an empty profile', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'i'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'I'.repeat(43));
    state.importedData.agentAccess = null;
    state.importedData.agentAccessWearableSeriesDays = 90;

    const refreshed = refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });

    expect(refreshed).toMatchObject({ enabled: false, token: null, contextKey: null, wearableSeriesDays: 0 });
    expect(state.importedData.agentAccess).toBeNull();
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('false');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-agent-wearable-series`)).toBe('off');
  });

  it('does not let matching legacy credentials rewrite an existing synced series preference', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'j'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'J'.repeat(43));
    localStorage.removeItem(`labcharts-${PROFILE_ID}-agent-wearable-series`);
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'j'.repeat(64),
      contextKey: 'gbctx_v1_' + 'J'.repeat(43),
      wearableSeriesDays: 90,
      migratedFromLocalStorageAt: 111,
      updatedAt: 333,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: true,
      token: 'j'.repeat(64),
      contextKey: 'gbctx_v1_' + 'J'.repeat(43),
      wearableSeriesDays: 90,
    });
    expect(state.importedData.agentAccess.wearableSeriesDays).toBe(90);
  });

  it('synced wearable-series preference beats legacy local on value', () => {
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, 'on');
    state.importedData.agentAccessWearableSeriesDays = 7;
    expect(getAgentWearableSeriesDays()).toBe(7);

    state.importedData.agentAccessWearableSeriesDays = 0;
    expect(getAgentWearableSeriesDays()).toBe(0);

    state.importedData.agentAccessWearableSeriesDays = 90;
    expect(getAgentWearableSeriesDays()).toBe(90);
  });

  it('does not create unsaved synced series state when only legacy preference exists', () => {
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, '30');

    const stateOnly = getAgentAccessState();

    expect(stateOnly.enabled).toBe(false);
    expect(stateOnly.wearableSeriesDays).toBe(0);
    expect(state.importedData.agentAccess).toBeNull();
    expect(state.importedData.agentAccessWearableSeriesDays).toBeUndefined();
    expect(getAgentWearableSeriesDays()).toBe(30);
  });

  it('sync refresh migrates legacy credentials before mirroring disabled fallback', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'm'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'M'.repeat(43));
    state.importedData.agentAccess = null;

    const refreshed = refreshAgentAccessFromSyncedProfile();

    expect(refreshed).toMatchObject({
      enabled: true,
      token: 'm'.repeat(64),
      contextKey: 'gbctx_v1_' + 'M'.repeat(43),
    });
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'm'.repeat(64),
      contextKey: 'gbctx_v1_' + 'M'.repeat(43),
    });
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('clears legacy credential mirrors when setting series migrates Agent Access into profile state', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'k'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'K'.repeat(43));
    state.importedData.agentAccess = null;

    expect(setAgentAccessWearableSeriesDays(30)).toBe(30);
    expect(setAgentAccessWearableSeriesDays(45)).toBeNull();

    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'k'.repeat(64),
      contextKey: 'gbctx_v1_' + 'K'.repeat(43),
    });
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(30);
  });

  it('uses the active profile id when remotely revoking Agent Access tokens', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    state.currentProfile = 'profile-runtime-alt';
    localStorage.setItem('labcharts-active-profile', 'profile-runtime-alt');
    configureSyncMessenger({
      getSyncRelay: () => 'wss://relay.example.test',
      getAppOwner: () => ({ id: 'MDEyMzQ1Njc4OWFiY2RlZg', writeKey: new Uint8Array(32).fill(7) }),
      debug: vi.fn(),
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'r'.repeat(64),
      contextKey: 'gbctx_v1_' + 'R'.repeat(43),
    };

    revokeMessengerToken();
    for (let i = 0; i < 20 && fetchSpy.mock.calls.length === 0; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://relay.example.test/api/context');
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body).profileId).toBe('profile-runtime-alt');
  });

  it('includes sanitized relay error details when context push fails', () => {
    const src = pushContextToGateway.toString();
    expect(src).toContain('await res.text()');
    expect(src).toContain('body.slice(0, 240)');
    expect(src).toContain('Gateway returned ${res.status}${detail}');
  });

  it('keeps preference-only writes from emitting stale credential scalar rows', async () => {
    const staleCredentialState = {
      version: 1,
      enabled: true,
      token: 'f'.repeat(64),
      contextKey: 'gbctx_v1_' + 'F'.repeat(43),
      migratedFromLocalStorageAt: 111,
      credentialCreatedAt: 222,
      revokedAt: null,
      updatedAt: 333,
    };
    state.importedData.agentAccess = { ...staleCredentialState };
    writeSnapshot(PROFILE_ID, 'agentAccess', {
      agentAccess: _djb2(JSON.stringify({ v: staleCredentialState })),
    });

    setAgentAccessWearableSeriesDays(30);
    const { deltaPlans } = await planProfileDeltas(PROFILE_ID, state.importedData);

    expect(state.importedData.agentAccess).toMatchObject(staleCredentialState);
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(30);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccess')).toBe(false);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccessWearableSeriesDays')).toBe(true);
  });

  it('keeps generated credentials separate from wearable-series preference sync', async () => {
    const generated = generateMessengerToken();
    expect(generated.token).toHaveLength(64);
    expect(generated.previousToken).toBeNull();
    const token = state.importedData.agentAccess.token;
    const contextKey = state.importedData.agentAccess.contextKey;
    expect(state.importedData.agentAccess.enabled).toBe(true);
    expect(token).toHaveLength(64);
    expect(contextKey).toMatch(/^gbctx_v1_/);
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();

    setAgentAccessWearableSeriesDays(7);
    expect(state.importedData.agentAccess.token).toBe(token);
    expect(state.importedData.agentAccess.contextKey).toBe(contextKey);
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(7);
    expect(getAgentWearableSeriesDays()).toBe(7);

    setAgentWearableSeriesDays(0);
    expect(state.importedData.agentAccess.token).toBe(token);
    expect(state.importedData.agentAccess.contextKey).toBe(contextKey);
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(7);
    expect(getAgentWearableSeriesDays()).toBe(7);

    setAgentAccessWearableSeriesDays(0);
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(0);

    const fake = makeEvolu();
    configureRuntimeDeps(fake);
    const { deltaPlans } = await planProfileDeltas(PROFILE_ID, state.importedData);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccess')).toBe(true);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccessWearableSeriesDays')).toBe(true);
  });

  it('local disable returns the previous token without calling the relay or keeping local secret mirrors', () => {
    const first = generateMessengerToken();
    localStorage.setItem('labcharts-messenger-token', 'stale-local-token');
    localStorage.setItem('labcharts-agent-context-key', 'stale-local-context');

    const previousToken = disableMessengerTokenLocal();

    expect(previousToken).toBe(first.token);
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: false,
      token: null,
      contextKey: null,
    });
    expect(state.importedData.agentAccess.revokedAt).toEqual(expect.any(Number));
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('false');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('clearLegacyAgentAccessSecrets removes only raw credential mirrors', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'legacy-token');
    localStorage.setItem('labcharts-agent-context-key', 'legacy-context');

    clearLegacyAgentAccessSecrets();

    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });
});
