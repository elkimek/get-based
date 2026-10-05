import type { ProfileData } from '../types/app-state.js';
import { configureRuntimeDependencies } from './runtime-callbacks.js';
import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';
import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { profileStorageKey } from './profile-storage-key.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { discardSyncProfileDirty, getSyncDirtyToken, markSyncProfileDirty } from './sync-dirty-state.js';
import { getProfileSyncBlockReason, hasPendingProfileTombstone } from './profile-sync-policy.js';

export interface SyncSaveHooksDeps {
  pushProfile: (profileId: string, data: unknown) => Promise<unknown>;
  isSyncEnabled: () => unknown;
  isSyncConfigured: () => unknown;
  isEvoluReady: () => unknown;
  isSyncing: () => unknown;
  createDefaultProfileData: () => unknown;
  migrateProfileData: (data: ProfileData) => unknown;
  getProfiles: () => readonly unknown[];
}

export interface SyncSaveServices {
  encryptedGetItem: (key: string) => Promise<string | null>;
  markChatDataLocal: () => unknown;
  markCustomPersonalityDataLocal: () => unknown;
  pushContextToGateway: () => unknown;
}

/** Profile-scoped scheduling and durable retry ordering, with explicit service ports. */
export function createSyncSaveHooks({
  encryptedGetItem, markChatDataLocal, markCustomPersonalityDataLocal, pushContextToGateway,
}: SyncSaveServices) {
  // sync-save-hooks.js - Save/chat/profile sync debounce hooks.

  // Per-profile debounce timers. Switching profiles mid-debounce previously
  // dropped the pending push for the prior profile because the single shared
  // timer was overwritten. Keyed by profileId so each profile's pending push
  // survives until it fires.
  const _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const _chatSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const _profileSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let _aiSettingsPushTimer: ReturnType<typeof setTimeout> | null = null;
  let _eventsBound = false;

  function isProfileSyncBlocked(profileId: string) {
    const blocked = !!getProfileSyncBlockReason(profileId, (0, syncSaveHooksDeps.getProfiles)());
    // A quarantined remote delete is still awaiting the user's Apply delete or
    // Restore choice. Preserve its dirty generation so later pulls cannot treat
    // the unresolved conflict as safe to erase. Other blocked profiles can never
    // be pushed, so their stale markers remain disposable.
    if (blocked && !hasPendingProfileTombstone(profileId)) discardSyncProfileDirty(profileId);
    return blocked;
  }

  const syncSaveHooksDeps: SyncSaveHooksDeps = {
    pushProfile: async () => {},
    isSyncEnabled: () => false,
    isSyncConfigured: () => (0, syncSaveHooksDeps.isSyncEnabled)(),
    isEvoluReady: () => false,
    isSyncing: () => false,
    createDefaultProfileData: () => ({ entries: [] }),
    migrateProfileData: (data) => data,
    getProfiles: () => [],
  };

  function configureSyncSaveHooks({
    pushProfile,
    isSyncEnabled,
    isSyncConfigured,
    isEvoluReady,
    isSyncing,
    createDefaultProfileData,
    migrateProfileData,
    getProfiles,
  }: RuntimeDependencyUpdates<SyncSaveHooksDeps> = {}) {
    return configureRuntimeDependencies(syncSaveHooksDeps, { pushProfile, isSyncEnabled, isSyncConfigured, isEvoluReady, isSyncing, createDefaultProfileData, migrateProfileData, getProfiles });
  }

  function bindSyncSaveHookEvents() {
    if (_eventsBound) return;
    const bound = addUtilsRuntimeListener('labcharts-ai-settings-local-changed', () => {
      if (!(0, syncSaveHooksDeps.isSyncConfigured)() || !state.currentProfile || !state.importedData) return;
      if (isProfileSyncBlocked(state.currentProfile)) return;
      markSyncProfileDirty(state.currentProfile);
      if (!(0, syncSaveHooksDeps.isSyncEnabled)()) return;
      scheduleAISettingsPush(state.currentProfile, state.importedData);
    });
    if (bound) _eventsBound = true;
  }

  function scheduleAISettingsPush(profileId: string, importedData: unknown, attempt = 0) {
    if (isProfileSyncBlocked(profileId)) return;
    if (_aiSettingsPushTimer) clearTimeout(_aiSettingsPushTimer);
    _aiSettingsPushTimer = setTimeout(async () => {
      _aiSettingsPushTimer = null;
      if (!(0, syncSaveHooksDeps.isSyncEnabled)()) return;
      if (!(0, syncSaveHooksDeps.isEvoluReady)() || (0, syncSaveHooksDeps.isSyncing)()) {
        if (attempt < 60) scheduleAISettingsPush(profileId, importedData, attempt + 1);
        return;
      }
      try {
        const result = await (0, syncSaveHooksDeps.pushProfile)(profileId, importedData);
        if ((result as { skipped?: unknown } | null | undefined)?.skipped && attempt < 60) scheduleAISettingsPush(profileId, importedData, attempt + 1);
      } catch {}
    }, attempt === 0 ? 250 : 1000);
  }

  function clearSyncSaveTimers() {
    for (const t of _debounceTimers.values()) clearTimeout(t);
    _debounceTimers.clear();
    for (const t of _chatSyncTimers.values()) clearTimeout(t);
    _chatSyncTimers.clear();
    for (const t of _profileSyncTimers.values()) clearTimeout(t);
    _profileSyncTimers.clear();
    if (_aiSettingsPushTimer) {
      clearTimeout(_aiSettingsPushTimer);
      _aiSettingsPushTimer = null;
    }
  }

  async function readProfileImportedData(profileId: string | null | undefined, fallback: unknown = null) {
    const normalize = (data: unknown) => {
      if (data && typeof data === 'object') (0, syncSaveHooksDeps.migrateProfileData)(data as ProfileData);
      return data;
    };
    if (fallback && typeof fallback === 'object') return normalize(fallback);
    if (profileId === state.currentProfile && state.importedData) return normalize(state.importedData);
    if (!profileId) return (0, syncSaveHooksDeps.createDefaultProfileData)();
    try {
      const storageKey = profileStorageKey(profileId, 'imported');
      // Imported profile blobs live in IndexedDB regardless of whether their
      // contents are encrypted. encryptedGetItem owns that routing (and the
      // legacy localStorage migration), so bypassing it when encryption is off
      // makes every inactive profile look empty.
      const raw = await encryptedGetItem(storageKey);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('[sync] Could not read profile importedData for profile sync:', getErrorMessage(e, e));
    }
    // A named profile whose persisted blob is absent or unreadable must not be
    // replaced on the relay with a freshly-created empty profile. New profiles
    // pass their default data explicitly through the fallback argument.
    return null;
  }

  function scheduleProfilePush(profileId: string, data: unknown, attempt = 0): undefined {
    // Manual sync or a dirty-profile flush may already have committed this save.
    const dirtyToken = getSyncDirtyToken(profileId);
    if (!dirtyToken) return;
    if (isProfileSyncBlocked(profileId)) {
      _profileSyncTimers.delete(profileId);
      return;
    }
    // Fail closed when profile storage could not be read. Publishing null here
    // can turn a transient local read problem into permanent cross-device loss.
    if (!data || typeof data !== 'object') {
      _profileSyncTimers.delete(profileId);
      return;
    }
    if (!(0, syncSaveHooksDeps.isSyncEnabled)()) {
      _profileSyncTimers.delete(profileId);
      return;
    }
    if (!(0, syncSaveHooksDeps.isEvoluReady)() || (0, syncSaveHooksDeps.isSyncing)()) {
      if (attempt < 60) {
        const retry = setTimeout(() => {
          if (_profileSyncTimers.get(profileId) === retry) _profileSyncTimers.delete(profileId);
          scheduleProfilePush(profileId, data, attempt + 1);
        }, 1000);
        _profileSyncTimers.set(profileId, retry);
        return;
      }
    }
    if (!(0, syncSaveHooksDeps.isEvoluReady)()) {
      _profileSyncTimers.delete(profileId);
      return;
    }
    _profileSyncTimers.delete(profileId);
    // Use current state for the active profile without deferring an immediate
    // push. A pull may have replaced the object captured by this timer.
    if (profileId === state.currentProfile && state.importedData) {
      (0, syncSaveHooksDeps.pushProfile)(profileId, state.importedData).catch(() => {});
      return;
    }
    // A switched-away profile must be read from durable storage at send time.
    readProfileImportedData(profileId).then(latest => {
      if (!latest || !getSyncDirtyToken(profileId) || !(0, syncSaveHooksDeps.isSyncEnabled)() || isProfileSyncBlocked(profileId)) return undefined;
      // Do not let an older read acknowledge a save that arrived during it.
      if (getSyncDirtyToken(profileId) !== dirtyToken) return scheduleProfilePush(profileId, latest);
      return (0, syncSaveHooksDeps.pushProfile)(profileId, latest);
    }).catch(() => {});
  }

  function onProfileSaved(profileId: string | null | undefined, importedData: unknown = null) {
    if (!profileId) return;
    if (!(0, syncSaveHooksDeps.isSyncConfigured)()) return;
    if (isProfileSyncBlocked(profileId)) return;
    markSyncProfileDirty(profileId);
    if (!(0, syncSaveHooksDeps.isSyncEnabled)()) return;
    const prev = _profileSyncTimers.get(profileId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(async () => {
      if (_profileSyncTimers.get(profileId) === timer) _profileSyncTimers.delete(profileId);
      if (!(0, syncSaveHooksDeps.isSyncEnabled)()) return;
      const data = await readProfileImportedData(profileId, importedData);
      scheduleProfilePush(profileId, data);
    }, 250);
    _profileSyncTimers.set(profileId, timer);
  }

  function onDataSaved(options: { immediate?: unknown; skipSync?: unknown } | null = {}) {
    if (state.currentProfile && isProfileSyncBlocked(state.currentProfile)) return;
    if (!options?.skipSync && (0, syncSaveHooksDeps.isSyncConfigured)()) {
      const profileId = state.currentProfile;
      const data = state.importedData;
      if (profileId) {
        markSyncProfileDirty(profileId);
        if (!(0, syncSaveHooksDeps.isSyncEnabled)()) {
          pushContextToGateway();
          return;
        }
        if (!(0, syncSaveHooksDeps.isEvoluReady)()) {
          pushContextToGateway();
          return;
        }
        const prev = _debounceTimers.get(profileId);
        if (prev) clearTimeout(prev);
        if (options?.immediate) {
          _debounceTimers.delete(profileId);
          scheduleProfilePush(profileId, data);
        } else {
          const timer = setTimeout(() => {
            _debounceTimers.delete(profileId);
            scheduleProfilePush(profileId, data);
          }, 10_000);
          _debounceTimers.set(profileId, timer);
        }
      }
    }
    pushContextToGateway();
  }

  function onChatSaved(options: { customPersonality?: unknown } = {}) {
    if (options.customPersonality) markCustomPersonalityDataLocal();
    else markChatDataLocal();
    if (!(0, syncSaveHooksDeps.isSyncConfigured)()) return;
    const profileId = state.currentProfile;
    const data = state.importedData;
    if (!profileId) return;
    if (isProfileSyncBlocked(profileId)) return;
    markSyncProfileDirty(profileId);
    if (!(0, syncSaveHooksDeps.isSyncEnabled)()) return;
    if (!(0, syncSaveHooksDeps.isEvoluReady)()) return;
    const prev = _chatSyncTimers.get(profileId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      _chatSyncTimers.delete(profileId);
      scheduleProfilePush(profileId, data);
    }, 10000);
    _chatSyncTimers.set(profileId, timer);
  }

  return { configureSyncSaveHooks, bindSyncSaveHookEvents, clearSyncSaveTimers, readProfileImportedData, onProfileSaved, onDataSaved, onChatSaved };
}
