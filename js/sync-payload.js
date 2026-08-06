// @ts-check
// sync-payload.js - outbound/inbound wire payload helpers for Evolu sync

import {
  collectAISettings, collectChatData, collectDisplayPrefs,
} from './sync-payload-collectors.js';
import {
  _bytesToBase64, _gzipString,
} from './sync-payload-codec.js';
import { selectSyncedProfile } from './sync-profile-fields.js';

export {
  AI_SETTINGS_KEYS, DISPLAY_PREF_SUFFIXES, chatDeletedThreadsKey,
  collectAISettings, collectChatData, collectDisplayPrefs,
} from './sync-payload-collectors.js';
export {
  _base64ToBytes, _bytesToBase64, _gzipString, _gunzipToStringCapped,
  _PER_ROW_DECOMPRESSED_CAP_BYTES, MAX_SYNC_PAYLOAD_BYTES, parseSyncPayload,
} from './sync-payload-codec.js';

/** @type {{ getProfiles: () => any[] }} */
const syncPayloadDeps = {
  getProfiles: () => {
    try {
      const profiles = JSON.parse(localStorage.getItem('labcharts-profiles') || '[]');
      return Array.isArray(profiles) ? profiles : [];
    } catch {
      return [];
    }
  },
};

/** @param {{ getProfiles?: () => any[] }} [deps] */
export function configureSyncPayload(deps = {}) {
  const previous = { ...syncPayloadDeps };
  if (typeof deps.getProfiles === 'function') syncPayloadDeps.getProfiles = deps.getProfiles;
  return previous;
}

// Phase 2 cutover flag — when set, buildSyncPayload omits importedData
// from the blob entirely. Per-row CRDT deltas carry every field instead.
/** @param {string} profileId */
function _cutoverFlagKey(profileId) {
  return `labcharts-${profileId}-sync-cutover-v2`;
}

/** @param {string | null | undefined} profileId */
export function isPhase2CutoverEnabled(profileId) {
  if (!profileId) return false;
  try { return localStorage.getItem(_cutoverFlagKey(profileId)) === '1'; } catch { return false; }
}

/** @param {string | null | undefined} profileId */
export function enablePhase2CutoverFlag(profileId) {
  if (!profileId) return false;
  try { localStorage.setItem(_cutoverFlagKey(profileId), '1'); return true; } catch { return false; }
}

/** @param {string | null | undefined} profileId */
export function disablePhase2CutoverFlag(profileId) {
  if (!profileId) return false;
  try { localStorage.removeItem(_cutoverFlagKey(profileId)); return true; } catch { return false; }
}

/** @param {string} profileId
 * @param {any} importedData
 */
export async function buildSyncPayload(profileId, importedData) {
  const profiles = syncPayloadDeps.getProfiles();
  const profile = selectSyncedProfile(profiles.find(p => p.id === profileId));
  const aiSettings = await collectAISettings();
  const chatData = await collectChatData(profileId);
  const displayPrefs = collectDisplayPrefs(profileId);
  // Strip wearable OAuth credentials before sync. Per-row LWW would let a stale
  // device resurrect a disconnected vendor or overwrite a freshly-rotated
  // refresh token. Wearable summary (the L2 dashboard data) still syncs; the
  // tokens stay local. Users connect each wearable per-device.
  const safeImported = stripLocalOnlyProfileData(stripGeneticsSnpsFromBlob(stripWearableCredentials(importedData)));
  // Phase 2: when cutover is enabled (readiness-gated), drop importedData
  // from the blob. Per-row deltas carry every field.
  const cutover = isPhase2CutoverEnabled(profileId);
  const inner = JSON.stringify({
    _v: cutover ? 4 : 3,
    importedData: cutover ? undefined : safeImported,
    profile: profile || null,
    aiSettings: Object.keys(aiSettings).length > 0 ? aiSettings : undefined,
    chatData: chatData || undefined,
    displayPrefs: displayPrefs || undefined,
  });
  // Gzip + base64 envelope. v3 plain-JSON pushes were averaging ~500 KB,
  // hitting the relay's 50 MB per-owner cap in ~95 pushes. Gzip drops typical
  // payloads ~70%, base64 reinflates ~33%, net ~3x more pushes per quota.
  if (typeof CompressionStream !== 'undefined' && inner.length > 1024) {
    try {
      const gz = await _gzipString(inner);
      return `GZ|v1|${_bytesToBase64(gz)}`;
    } catch {
      // Fall through to plain JSON. Never block a push on compression.
    }
  }
  return inner;
}

/** @param {any} importedData */
export function stripWearableCredentials(importedData) {
  if (!importedData?.wearableConnections) return importedData;
  const { wearableConnections, ...rest } = importedData;
  return rest;
}

// Strip `genetics.snps` from the legacy blob payload so the only carrier
// for SNP membership is the per-key `genetics.snps` delta map path.
/** @param {any} importedData */
export function stripGeneticsSnpsFromBlob(importedData) {
  if (!importedData?.genetics || typeof importedData.genetics !== 'object') return importedData;
  const { snps, ...geneticsMetadata } = importedData.genetics;
  return { ...importedData, genetics: geneticsMetadata };
}

// Runtime benchmarks are meaningful only on the device that executed them:
// hardware, loaded model state, and timing do not transfer across devices.
// Keep their records out of both legacy blob sync and v4 delta sync.
/** @param {any} importedData */
export function stripLocalOnlyProfileData(importedData) {
  if (!importedData || typeof importedData !== 'object') return importedData;
  if (!('importBenchmarks' in importedData) && !('deletedImportBenchmarkIds' in importedData)) return importedData;
  const {
    importBenchmarks: _importBenchmarks,
    deletedImportBenchmarkIds: _deletedImportBenchmarkIds,
    ...rest
  } = importedData;
  return rest;
}
