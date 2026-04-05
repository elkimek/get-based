// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import { state } from './state.js';
import { showNotification, isDebugMode, escapeHTML } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem } from './crypto.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

let evolu = null;
let profileQuery = null;
let _syncEnabled = false;
let _syncing = false;
let _pulling = false;
let _appOwner = null;
let _readyPromise = null;
let _queryLoaded = null;
let _debounceTimer = null;
let _pollInterval = null;
let _lastPollRowCount = -1;
let _subscriptionFireCount = 0;
let _relayProbeInterval = null;

// ═══════════════════════════════════════════════
// SYNC STATUS — in-memory state + pub-sub
// ═══════════════════════════════════════════════

const _syncStatus = {
  relay: 'unknown',        // 'unknown' | 'connected' | 'unreachable'
  relayCheckedAt: null,
  push: 'idle',            // 'idle' | 'pending' | 'confirmed' | 'error'
  pushStartedAt: null,
  pushConfirmedAt: null,
  pull: 'idle',            // 'idle' | 'pulling' | 'received'
  pullReceivedAt: null,
  lastError: null,
};
const _syncStatusListeners = new Set();

function updateSyncStatus(partial) {
  Object.assign(_syncStatus, partial);
  for (const fn of _syncStatusListeners) fn(_syncStatus);
}

export function getSyncStatus() { return { ..._syncStatus }; }

export function subscribeSyncStatus(fn) {
  _syncStatusListeners.add(fn);
  return () => _syncStatusListeners.delete(fn);
}

function getSyncDisplayState() {
  if (!_syncEnabled) return 'disabled';
  if (_syncStatus.lastError && _syncStatus.push === 'error') return 'error';
  if (_syncStatus.push === 'pending' && _syncStatus.pushStartedAt && Date.now() - _syncStatus.pushStartedAt > 8000) return 'error';
  if (_syncStatus.relay === 'unreachable') return 'offline';
  if (_syncStatus.push === 'pending' || _syncStatus.pull === 'pulling') return 'syncing';
  return 'synced';
}

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════

const SYNC_STORAGE_KEY = 'labcharts-sync-enabled';
const SYNC_RELAY_KEY = 'labcharts-sync-relay';
const DEFAULT_RELAY = 'wss://sync.getbased.health';
const ONION_RELAY = 'ws://udou6gehyfpfccdjpibmuttaoauawmh5cgzszffnskbvczppvr2sfjad.onion';

export function isSyncEnabled() { return _syncEnabled; }

export function getSyncRelay() {
  const custom = localStorage.getItem(SYNC_RELAY_KEY);
  // On .onion, always use the onion relay (ignore stored clearnet relay)
  if (window.location.hostname.endsWith('.onion')) return ONION_RELAY;
  return custom || DEFAULT_RELAY;
}

export function setSyncRelay(url) {
  localStorage.setItem(SYNC_RELAY_KEY, url);
}

// Probe relay connectivity via a test WebSocket
export function checkRelayConnection(timeout = 4000) {
  return new Promise(resolve => {
    const relay = getSyncRelay();
    try {
      const ws = new WebSocket(relay + '/ping');
      const timer = setTimeout(() => { ws.close(); resolve(false); }, timeout);
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
      ws.onerror = () => { clearTimeout(timer); ws.close(); resolve(false); };
    } catch { resolve(false); }
  });
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════

export async function initSync() {
  _syncEnabled = localStorage.getItem(SYNC_STORAGE_KEY) === 'true';
  if (!_syncEnabled) return;

  // Re-entrancy guard — don't create duplicate Evolu instances
  if (evolu) return;

  // Defer to next microtask — SharedWorker + navigator.locks can race during DOMContentLoaded
  await new Promise(r => setTimeout(r, 0));

  try {
    const { createEvolu, id, nullOr, SimpleName, NonEmptyString1000, NonEmptyString, evoluWebDeps } =
      await import('../vendor/evolu/evolu-bundle.js');

    const ProfileDataId = id("ProfileData");
    const Schema = {
      profileData: {
        id: ProfileDataId,
        profileId: NonEmptyString,
        dataJson: NonEmptyString,
        syncedAt: nullOr(NonEmptyString),
      },
    };

    const relay = getSyncRelay();
    evolu = createEvolu(evoluWebDeps)(Schema, {
      name: SimpleName.orThrow("getbased4"),
      reloadUrl: window.location.pathname,
      enableLogging: isDebugMode(),
      transports: [{ type: "WebSocket", url: relay }],
    });

    // Query all profile data rows
    profileQuery = evolu.createQuery((db) =>
      db.selectFrom("profileData")
        .selectAll()
        .where("isDeleted", "is not", 1)
    );

    // Subscribe to sync updates
    evolu.subscribeQuery(profileQuery)(() => {
      _subscriptionFireCount++;
      dbg(`subscription fired (#${_subscriptionFireCount}), syncing: ${_syncing}, pulling: ${_pulling}`);
      if (!_syncing && !_pulling) onSyncReceived();
    });

    // Load initial data — store promise for enableSync to await
    _queryLoaded = evolu.loadQuery(profileQuery).then(() => {
      dbg('Initial query loaded');
    }).catch(e => {
      console.warn('[sync] Query load failed:', e);
    });

    // Wait for owner (mnemonic) — signals DB is ready
    _readyPromise = evolu.appOwner.then(owner => {
      _appOwner = owner;
      dbg('Owner resolved');
    }).catch(e => {
      console.warn('[sync] Owner resolution failed:', e);
    });

    // Always expose debug helper (sync needs visibility)
    window._syncDebug = {
      getRows: () => evolu.getQueryRows(profileQuery),
      getOwner: () => _appOwner,
      evolu,
    };

    // Poll every 30s as safety net — subscribeQuery may miss remote changes
    _pollInterval = setInterval(() => {
      if (!evolu || !profileQuery || _syncing || _pulling) return;
      const rows = evolu.getQueryRows(profileQuery);
      const count = rows?.length ?? 0;
      if (count !== _lastPollRowCount) {
        dbg(`poll: row count changed ${_lastPollRowCount} → ${count}, triggering onSyncReceived`);
        _lastPollRowCount = count;
        onSyncReceived();
      }
    }, 30000);

    // Subscribe to Evolu errors — catches relay connection failures
    evolu.subscribeError((error) => {
      if (!error) return;
      const type = error?.type || 'unknown';
      dbg('Evolu error:', type);
      if (type.startsWith('WebSocket')) {
        updateSyncStatus({ relay: 'unreachable', lastError: { type, message: type, at: Date.now() } });
      }
    });

    // Initial relay probe + periodic 60s health check
    checkRelayConnection().then(ok => {
      updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
    });
    _relayProbeInterval = setInterval(async () => {
      const ok = await checkRelayConnection();
      updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
    }, 60000);

    dbg('Initialized, relay:', relay);
  } catch (e) {
    console.error('[sync] Failed to initialize Evolu:', e);
    _syncEnabled = false;
  }
}

// ═══════════════════════════════════════════════
// ENABLE / DISABLE
// ═══════════════════════════════════════════════

export async function enableSync({ skipPush = false } = {}) {
  localStorage.setItem(SYNC_STORAGE_KEY, 'true');
  _syncEnabled = true;
  await initSync();
  if (evolu && _readyPromise) {
    await _readyPromise;
    if (_queryLoaded) await _queryLoaded;
    if (!skipPush) {
      await pushAllProfiles();
    }
    showNotification('Sync enabled', 'success');
    renderSyncIndicator();
  }
}

export async function disableSync() {
  // Wait for in-flight operations to finish
  if (_syncing || _pulling) {
    await new Promise(r => setTimeout(r, 500));
  }
  localStorage.setItem(SYNC_STORAGE_KEY, 'false');
  _syncEnabled = false;

  // Stop relay probe interval
  if (_relayProbeInterval) { clearInterval(_relayProbeInterval); _relayProbeInterval = null; }

  // Reset sync status and notify UI
  Object.assign(_syncStatus, { relay: 'unknown', relayCheckedAt: null, push: 'idle', pushStartedAt: null, pushConfirmedAt: null, pull: 'idle', pullReceivedAt: null, lastError: null });
  for (const fn of _syncStatusListeners) fn(_syncStatus);
  renderSyncIndicator();

  // Clear sync timestamps so fresh pull can happen after re-enable
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-sync-ts')) localStorage.removeItem(key);
  }

  // Reset Evolu DB and reload to kill the Worker + release OPFS locks.
  // resetAppOwner drops all tables (including identity). The page reload
  // terminates the SharedWorker. On next enableSync, createEvolu sees
  // dbIsInitialized=false and generates a fresh mnemonic.
  if (evolu) {
    try {
      await evolu.resetAppOwner({ reload: false });
    } catch (e) {
      console.warn('[sync] Evolu reset failed:', e);
    }
    evolu = null;
    profileQuery = null;
    _appOwner = null;
    _readyPromise = null;
    _queryLoaded = null;
    clearTimeout(_debounceTimer);
    clearInterval(_pollInterval);
    showNotification('Sync disabled — reloading…', 'success');
    setTimeout(() => window.location.reload(), 500);
    return;
  }

  evolu = null;
  profileQuery = null;
  _appOwner = null;
  _readyPromise = null;
  _queryLoaded = null;
  clearTimeout(_debounceTimer);
  clearInterval(_pollInterval);
  showNotification('Sync disabled', 'success');
}

// ═══════════════════════════════════════════════
// DIAGNOSTICS
// ═══════════════════════════════════════════════

function _syncDiag() {
  const info = {
    enabled: _syncEnabled,
    evoluReady: !!evolu,
    relay: getSyncRelay(),
    mnemonic: _appOwner?.mnemonic ? _appOwner.mnemonic.split(' ').slice(0, 4).join(' ') + ' …' : null,
    subscriptionFires: _subscriptionFireCount,
    syncing: _syncing,
    pulling: _pulling,
  };
  if (evolu && profileQuery) {
    const rows = evolu.getQueryRows(profileQuery);
    info.evoluRows = (rows || []).map(r => ({
      profileId: r.profileId,
      syncedAt: r.syncedAt,
      dataSize: r.dataJson?.length ?? 0,
    }));
  }
  // Show local sync timestamps
  const tsList = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.endsWith('-sync-ts')) {
      tsList.push({ key, ts: parseInt(localStorage.getItem(key), 10), date: new Date(parseInt(localStorage.getItem(key), 10)).toISOString() });
    }
  }
  info.localTimestamps = tsList;
  console.table?.(info.evoluRows);
  console.log('[sync] Diagnostics:', JSON.stringify(info, null, 2));
  return info;
}

function _forcePull() {
  if (!evolu || !profileQuery) {
    console.warn('[sync] Cannot force pull — Evolu not initialized');
    return;
  }
  _pulling = false;
  console.log('[sync] Force pull triggered');
  onSyncReceived();
  return 'triggered';
}

// ═══════════════════════════════════════════════
// MNEMONIC (identity)
// ═══════════════════════════════════════════════

export function getMnemonic() {
  if (!_appOwner) return null;
  return _appOwner.mnemonic || null;
}

export async function restoreFromMnemonic(mnemonic) {
  if (!evolu) return false;
  try {
    await evolu.restoreAppOwner(mnemonic);
    // Clear sync timestamps only after successful restore
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.endsWith('-sync-ts')) localStorage.removeItem(key);
    }
    showNotification('Restored from mnemonic — reloading...', 'success');
    return true;
  } catch (e) {
    console.error('[sync] Restore failed:', e);
    showNotification('Invalid mnemonic', 'error');
    return false;
  }
}

// ═══════════════════════════════════════════════
// SYNC PAYLOAD — wraps importedData + profile meta
// ═══════════════════════════════════════════════

// AI settings keys to sync (global, not per-profile)
const AI_SETTINGS_KEYS = [
  'labcharts-ai-provider',
  'labcharts-openrouter-key',    // OpenRouter key (encrypted)
  'labcharts-venice-key',        // Venice key (encrypted)
  'labcharts-routstr-key',       // Routstr key (encrypted)
  'labcharts-ppq-key',           // PPQ key (encrypted)
  'labcharts-ppq-credit-id',     // PPQ credit ID (for balance/topup)
  'labcharts-ollama',            // Local AI server config (encrypted)
  'labcharts-openrouter-model',
  'labcharts-venice-model',
  'labcharts-routstr-model',
  'labcharts-ppq-model',
  'labcharts-venice-e2ee',
  'labcharts-ollama-model',
  'labcharts-ollama-pii-url',
  'labcharts-ollama-pii-model',
  'labcharts-cashu-wallet-mnemonic',  // Wallet seed (encrypted)
  'labcharts-cashu-wallet-mint',       // Wallet mint URL
  'labcharts-routstr-node',           // Selected Routstr node
];

async function collectAISettings() {
  const settings = {};
  for (const key of AI_SETTINGS_KEYS) {
    const val = await encryptedGetItem(key);
    if (val) settings[key] = val;
  }
  return settings;
}

const ENCRYPTED_AI_KEYS = ['labcharts-openrouter-key', 'labcharts-venice-key', 'labcharts-routstr-key', 'labcharts-ppq-key', 'labcharts-ollama', 'labcharts-cashu-wallet-mnemonic'];

async function applyAISettings(settings) {
  if (!settings) return;
  for (const [key, val] of Object.entries(settings)) {
    if (!AI_SETTINGS_KEYS.includes(key)) continue;
    if (typeof val !== 'string' || val.length > 10000) continue; // sanity check
    if (ENCRYPTED_AI_KEYS.includes(key)) {
      await encryptedSetItem(key, val);
    } else {
      localStorage.setItem(key, val);
    }
  }
}

// Per-profile chat keys to sync
async function collectChatData(profileId) {
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  const threadsRaw = await encryptedGetItem(threadsKey) || localStorage.getItem(threadsKey);
  if (!threadsRaw) return null;
  try {
    const threads = JSON.parse(threadsRaw);
    if (!Array.isArray(threads) || threads.length === 0) return null;
    const messages = {};
    for (const t of threads) {
      const msgKey = `labcharts-${profileId}-chat-t_${t.id}`;
      const msgRaw = await encryptedGetItem(msgKey) || localStorage.getItem(msgKey);
      if (msgRaw) messages[t.id] = JSON.parse(msgRaw);
    }
    // Custom personalities
    const customRaw = localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`);
    const personality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`);
    return {
      threads,
      messages,
      customPersonalities: customRaw ? JSON.parse(customRaw) : undefined,
      activePersonality: personality || undefined,
    };
  } catch { return null; }
}

async function applyChatData(profileId, chatData) {
  if (!chatData || !chatData.threads) return;
  // Thread index: always plain localStorage (matches saveChatThreadIndex in chat.js).
  // encryptAllSensitiveKeys handles at-rest encryption when session ends.
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  localStorage.setItem(threadsKey, JSON.stringify(chatData.threads));
  if (chatData.messages) {
    for (const [threadId, msgs] of Object.entries(chatData.messages)) {
      const msgKey = `labcharts-${profileId}-chat-t_${threadId}`;
      const msgJson = JSON.stringify(msgs);
      if (getEncryptionEnabled()) {
        await encryptedSetItem(msgKey, msgJson);
      } else {
        localStorage.setItem(msgKey, msgJson);
      }
    }
  }
  if (chatData.customPersonalities) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonalityCustom`, JSON.stringify(chatData.customPersonalities));
  }
  if (chatData.activePersonality) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonality`, chatData.activePersonality);
  }
}

// Per-profile display preferences to sync
const DISPLAY_PREF_SUFFIXES = ['units', 'rangeMode', 'suppOverlay', 'noteOverlay', 'phaseOverlay'];

function collectDisplayPrefs(profileId) {
  const prefs = {};
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    const val = localStorage.getItem(`labcharts-${profileId}-${suffix}`);
    if (val != null) prefs[suffix] = val;
  }
  return Object.keys(prefs).length > 0 ? prefs : undefined;
}

function applyDisplayPrefs(profileId, prefs) {
  if (!prefs) return;
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    if (suffix in prefs) {
      localStorage.setItem(`labcharts-${profileId}-${suffix}`, prefs[suffix]);
    }
  }
}

async function buildSyncPayload(profileId, importedData) {
  const profiles = getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  const aiSettings = await collectAISettings();
  const chatData = await collectChatData(profileId);
  const displayPrefs = collectDisplayPrefs(profileId);
  return JSON.stringify({
    _v: 3,
    importedData,
    profile: profile || null,
    aiSettings: Object.keys(aiSettings).length > 0 ? aiSettings : undefined,
    chatData: chatData || undefined,
    displayPrefs: displayPrefs || undefined,
  });
}

function parseSyncPayload(dataJson) {
  if (typeof dataJson !== 'string' || dataJson.length > 50_000_000) {
    throw new Error('Invalid sync payload: bad type or too large');
  }
  const parsed = JSON.parse(dataJson);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid sync payload');
  }
  // v3: includes chat data + display prefs
  if (parsed._v === 3) {
    return { importedData: parsed.importedData, profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: parsed.chatData, displayPrefs: parsed.displayPrefs };
  }
  // v2 compat: no chat data
  if (parsed._v === 2) {
    return { importedData: parsed.importedData, profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: null, displayPrefs: null };
  }
  // v1 compat: raw importedData only
  return { importedData: parsed, profile: null, aiSettings: null, chatData: null, displayPrefs: null };
}

// Allowed fields when merging a synced profile into the local profiles list
const PROFILE_MERGE_FIELDS = ['name', 'sex', 'dob', 'location', 'tags', 'archived', 'pinned', 'flagged', 'avatar', 'color'];

// ═══════════════════════════════════════════════
// PUSH — localStorage → Evolu
// ═══════════════════════════════════════════════

async function pushProfile(profileId, importedData) {
  if (!evolu || !_syncEnabled || _syncing) return;
  if (!profileId || typeof profileId !== 'string') return;
  _syncing = true;
  updateSyncStatus({ push: 'pending', pushStartedAt: Date.now() });
  try {
    const dataJson = await buildSyncPayload(profileId, importedData);
    const syncedAt = new Date().toISOString();

    const onComplete = () => {
      updateSyncStatus({ push: 'confirmed', pushConfirmedAt: Date.now() });
    };

    // Check if row exists for this profile
    const rows = evolu.getQueryRows(profileQuery);
    const existing = rows?.find(r => r.profileId === profileId);

    if (existing) {
      evolu.update("profileData", {
        id: existing.id,
        dataJson,
        syncedAt,
      }, { onComplete });
    } else {
      evolu.insert("profileData", {
        profileId,
        dataJson,
        syncedAt,
      }, { onComplete });
    }
    // Only update sync-ts after successful push.
    // Use syncedAt (same value stored in Evolu) so the pull side sees exact equality
    // and doesn't skip the row due to a 1ms clock drift between the two Date.now() calls.
    localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(new Date(syncedAt).getTime()));
    dbg('Pushed:', profileId);
  } catch (e) {
    console.error('[sync] Push failed:', e);
    updateSyncStatus({ push: 'error', lastError: { type: 'PushError', message: e.message, at: Date.now() } });
  } finally {
    _syncing = false;
  }
}

export async function pushCurrentProfile() {
  await pushProfile(state.currentProfile, state.importedData);
  pushContextToGateway();
}

// Push all profiles on first enable
async function pushAllProfiles() {
  const profiles = getProfiles();
  for (const p of profiles) {
    try {
      const storageKey = profileStorageKey(p.id, 'imported');
      let dataJson;
      if (p.id === state.currentProfile) {
        dataJson = state.importedData;
      } else {
        const raw = getEncryptionEnabled()
          ? await encryptedGetItem(storageKey)
          : localStorage.getItem(storageKey);
        if (!raw) continue;
        dataJson = JSON.parse(raw);
      }
      if (dataJson) await pushProfile(p.id, dataJson);
    } catch (e) {
      console.error('[sync] Push failed for profile:', p.id, e);
    }
  }
}

// ═══════════════════════════════════════════════
// PULL — Evolu → localStorage
// ═══════════════════════════════════════════════

async function onSyncReceived() {
  if (!evolu || !profileQuery || _pulling) {
    dbg('onSyncReceived skipped:', !evolu ? 'no evolu' : !profileQuery ? 'no query' : 'already pulling');
    return;
  }
  _pulling = true;
  updateSyncStatus({ pull: 'pulling' });
  try {
    const rows = evolu.getQueryRows(profileQuery);
    dbg(`onSyncReceived: ${rows?.length ?? 0} rows`);
    if (!rows || rows.length === 0) return;

    let profilesChanged = false;
    let latestAiSettings = null;
    let latestAiTs = 0;

    for (const row of rows) {
      try {
        const profileId = row.profileId;
        if (!profileId || typeof profileId !== 'string') continue;
        const remoteUpdated = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;

        // Check local timestamp
        const localKey = profileStorageKey(profileId, 'imported');
        const localMeta = localStorage.getItem(`labcharts-${profileId}-sync-ts`);
        const localUpdated = localMeta ? parseInt(localMeta, 10) : 0;

        if (remoteUpdated <= localUpdated) {
          dbg(`Row ${profileId}: skip (remote ${remoteUpdated} <= local ${localUpdated})`);
          continue;
        }
        dbg(`Row ${profileId}: PULLING (remote ${remoteUpdated} > local ${localUpdated})`);

        // Remote is newer — parse payload
        const { importedData, profile, aiSettings, chatData, displayPrefs } = parseSyncPayload(row.dataJson);

        // Track latest AI settings (apply once, from most recent row)
        if (aiSettings && remoteUpdated > latestAiTs) {
          latestAiSettings = aiSettings;
          latestAiTs = remoteUpdated;
        }

        // Validate importedData shape
        if (!importedData || typeof importedData !== 'object') continue;

        // Update importedData in localStorage
        const importedJson = JSON.stringify(importedData);
        if (getEncryptionEnabled()) {
          await encryptedSetItem(localKey, importedJson);
        } else {
          localStorage.setItem(localKey, importedJson);
        }
        localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(remoteUpdated));

        // Merge profile into local profiles list (allowlisted fields only)
        if (profile && typeof profile === 'object') {
          const profiles = getProfiles();
          const idx = profiles.findIndex(p => p.id === profileId);
          if (idx >= 0) {
            const local = profiles[idx];
            for (const field of PROFILE_MERGE_FIELDS) {
              if (field in profile) local[field] = profile[field];
            }
            local.lastUpdated = Date.now();
          } else {
            // New profile — pick only allowed fields + id
            const newProfile = { id: profileId, lastUpdated: Date.now() };
            for (const field of PROFILE_MERGE_FIELDS) {
              if (field in profile) newProfile[field] = profile[field];
            }
            profiles.push(newProfile);
          }
          await saveProfiles(profiles);
          profilesChanged = true;
          dbg('Merged profile:', profileId, profile.name);
        }

        // Apply chat data and display preferences
        if (chatData) await applyChatData(profileId, chatData);
        if (displayPrefs) applyDisplayPrefs(profileId, displayPrefs);

        // If this is the active profile, update in-memory state
        if (profileId === state.currentProfile) {
          state.importedData = importedData;
          migrateProfileData(state.importedData);
          // Reload chat threads + active thread messages into memory and re-render
          if (chatData) {
            window.loadChatThreads?.();
            window.renderThreadList?.();
            window.loadChatHistory?.(); // reloads state.chatHistory from localStorage + renders
          }
          // Only auto-navigate if user is on the dashboard (don't interrupt other views)
          const activeNav = document.querySelector('.nav-item.active');
          if (!activeNav || activeNav.dataset.category === 'dashboard') {
            window.navigate?.('dashboard');
          } else {
            showNotification('Data updated from another device', 'success');
          }
          dbg('Pulled active profile:', profileId);
        } else {
          dbg('Pulled profile:', profileId);
        }
      } catch (e) {
        console.error('[sync] Pull failed for row:', e);
      }
    }

    // Apply AI settings once from the most recent row
    if (latestAiSettings) await applyAISettings(latestAiSettings);

    // Rebuild profile dropdown if profiles changed
    if (profilesChanged) {
      window.renderProfileDropdown?.();
    }
  } finally {
    _pulling = false;
    updateSyncStatus({ pull: 'received', pullReceivedAt: Date.now() });
  }
}

// ═══════════════════════════════════════════════
// HOOK — called from saveImportedData()
// ═══════════════════════════════════════════════

export function onDataSaved() {
  // Evolu sync
  if (_syncEnabled && evolu) {
    const profileId = state.currentProfile;
    const data = state.importedData;
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      if (_syncing) {
        setTimeout(() => pushProfile(profileId, data), 1000);
      } else {
        pushProfile(profileId, data);
      }
    }, 2000);
  }
  // Messenger context push
  pushContextToGateway();
}

// Called from chat.js when threads/messages change
let _chatSyncTimer = null;
export function onChatSaved() {
  if (!_syncEnabled || !evolu) return;
  clearTimeout(_chatSyncTimer);
  _chatSyncTimer = setTimeout(() => {
    const profileId = state.currentProfile;
    const data = state.importedData;
    if (_syncing) {
      setTimeout(() => pushProfile(profileId, data), 1000);
    } else {
      pushProfile(profileId, data);
    }
  }, 10000); // 10s debounce — chat saves are frequent during streaming
}

// ═══════════════════════════════════════════════
// MESSENGER ACCESS — push lab context to gateway
// ═══════════════════════════════════════════════

const MESSENGER_TOKEN_KEY = 'labcharts-messenger-token';
const MESSENGER_ENABLED_KEY = 'labcharts-messenger-enabled';

export function isMessengerEnabled() {
  return localStorage.getItem(MESSENGER_ENABLED_KEY) === 'true';
}

export function getMessengerToken() {
  return localStorage.getItem(MESSENGER_TOKEN_KEY) || null;
}

export function generateMessengerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(MESSENGER_TOKEN_KEY, token);
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'true');
  return token;
}

export function revokeMessengerToken() {
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'false');
}

let _contextPushTimer = null;
export function pushContextToGateway() {
  if (!isMessengerEnabled()) return;
  const token = getMessengerToken();
  if (!token) return;

  clearTimeout(_contextPushTimer);
  _contextPushTimer = setTimeout(async () => {
    try {
      const { buildLabContext } = await import('./chat.js');
      const context = buildLabContext();
      const profileId = state.currentProfile || 'default';
      const profiles = getProfiles().map(p => ({ id: p.id, name: p.name }));
      const relay = getSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

      await fetch(`${relay}/api/context`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context, profileId, profiles }),
      });
      dbg(`Context pushed to gateway (profile: ${profileId})`);
    } catch (e) {
      console.warn('[sync] Context push failed:', e);
    }
  }, 5000); // 5s debounce — less urgent than sync
}

// ═══════════════════════════════════════════════
// SYNC STATUS UI
// ═══════════════════════════════════════════════

function _timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function renderSyncIndicator() {
  const slot = document.getElementById('sync-indicator-slot');
  if (!slot) return;
  if (!_syncEnabled) { slot.innerHTML = ''; return; }
  const ds = getSyncDisplayState();
  const titles = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 changes saved locally', error: 'Sync error', disabled: '' };
  slot.innerHTML = `<button class="sync-indicator" id="sync-indicator-btn" onclick="toggleSyncDetail()" title="${titles[ds]}" aria-label="Sync status"><span class="sync-dot sync-dot-${ds}"></span></button>`;
}

export function updateSyncIndicator() {
  const dot = document.querySelector('#sync-indicator-btn .sync-dot');
  if (!dot) { renderSyncIndicator(); return; }
  const ds = getSyncDisplayState();
  dot.className = `sync-dot sync-dot-${ds}`;
  const titles = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 changes saved locally', error: 'Sync error' };
  dot.parentElement.title = titles[ds] || '';
}

export function toggleSyncDetail() {
  let pop = document.getElementById('sync-popover');
  if (pop) { pop.remove(); return; }
  const btn = document.getElementById('sync-indicator-btn');
  if (!btn) return;
  const ds = getSyncDisplayState();
  const s = _syncStatus;
  const relayDot = s.relay === 'connected' ? '#22c55e' : s.relay === 'unreachable' ? 'var(--red)' : 'var(--text-muted)';
  const relayLabel = s.relay === 'connected' ? 'Connected to relay' : s.relay === 'unreachable' ? 'Relay unreachable' : 'Checking\u2026';
  const pushLabel = s.push === 'confirmed' ? `Confirmed ${_timeAgo(s.pushConfirmedAt)}` : s.push === 'pending' ? 'Pending\u2026' : s.push === 'error' ? 'Failed' : '\u2014';
  const pullLabel = s.pullReceivedAt ? `Checked ${_timeAgo(s.pullReceivedAt)}` : '\u2014';
  const errorLine = s.lastError ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">${escapeHTML(s.lastError.type)} ${_timeAgo(s.lastError.at)}</div>` : '';

  pop = document.createElement('div');
  pop.id = 'sync-popover';
  pop.className = 'sync-popover';
  pop.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><span style="width:8px;height:8px;border-radius:50%;background:${relayDot};display:inline-block"></span><span style="font-size:13px">${relayLabel}</span></div>
    <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
      <div>Push: ${pushLabel}</div>
      <div>Pull: ${pullLabel}</div>
    </div>
    ${errorLine}
    <div style="margin-top:10px;display:flex;gap:8px">
      <button class="ctx-btn-option" style="font-size:12px" onclick="pushCurrentProfile();toggleSyncDetail()">Sync now</button>
      <button class="ctx-btn-option" style="font-size:12px" onclick="toggleSyncDetail();openSettingsModal('data')">Settings</button>
    </div>`;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(pop);
  // Close on outside click
  const close = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// Subscribe to status changes → repaint indicator
subscribeSyncStatus(() => updateSyncIndicator());

// ═══════════════════════════════════════════════
// EXPORTS for window binding
// ═══════════════════════════════════════════════

Object.assign(window, {
  enableSync,
  disableSync,
  getMnemonic,
  restoreFromMnemonic,
  isSyncEnabled,
  pushCurrentProfile,
  checkRelayConnection,
  isMessengerEnabled,
  getMessengerToken,
  generateMessengerToken,
  revokeMessengerToken,
  _syncDiag,
  _forcePull,
  getSyncStatus,
  renderSyncIndicator,
  updateSyncIndicator,
  toggleSyncDetail,
});
