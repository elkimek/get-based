import type { SyncChatData } from './sync-chat-merge.js';

/** Profile identity is stable; legacy and edition metadata stays opaque on the wire. */
export interface SyncProfileRecord extends Record<string, unknown> {
  id: string;
  name?: unknown;
  createdAt?: unknown;
  lastUpdated?: unknown;
  _syncFallback?: readonly unknown[] | undefined;
}
export interface SyncProfileRow {
  id?: unknown;
  profileId?: unknown;
  syncedAt?: unknown;
  dataJson?: unknown;
}
interface SyncPayloadDeps { getProfiles: () => SyncProfileRecord[] }

import { configureRuntimeFunctions } from './runtime-callbacks.js';
// sync-payload.ts - outbound/inbound wire payload helpers for Evolu sync

import {
  collectAISettings, collectChatData, collectDisplayPrefs,
} from './sync-payload-collectors.js';
import {
  _bytesToBase64, _gzipString,
  stripWearableCredentials, stripGeneticsSnpsFromBlob, stripNutritionMealsFromBlob, stripLocalOnlyProfileData,
} from './sync-payload-codec.js';
import { selectSyncedProfile } from './sync-profile-fields.js';
import { sanitizeNutritionProfileData } from './nutrition-sync-sanitize.js';

export {
  AI_SETTINGS_KEYS, DISPLAY_PREF_SUFFIXES, chatDeletedThreadsKey,
  collectAISettings, collectChatData, collectDisplayPrefs,
} from './sync-payload-collectors.js';
export {
  _base64ToBytes, _bytesToBase64, _gzipString, _gunzipToStringCapped,
  _PER_ROW_DECOMPRESSED_CAP_BYTES, MAX_SYNC_PAYLOAD_BYTES, parseSyncPayload,
  stripWearableCredentials, stripGeneticsSnpsFromBlob, stripNutritionMealsFromBlob, stripLocalOnlyProfileData,
} from './sync-payload-codec.js';

export function latestProfileRow<Row extends SyncProfileRow | null | undefined>(rows: readonly Row[] | null | undefined, profileId: string) {
  return (rows || []).filter(row => row?.profileId === profileId)
    .sort((a, b) => (Date.parse((b?.syncedAt || '') as string) || 0) - (Date.parse((a?.syncedAt || '') as string) || 0))[0];
}

const syncPayloadDeps: SyncPayloadDeps = {
  getProfiles: () => {
    try {
      const profiles = JSON.parse(localStorage.getItem('labcharts-profiles') || '[]');
      return Array.isArray(profiles) ? profiles as SyncProfileRecord[] : [];
    } catch {
      return [];
    }
  },
};

export function configureSyncPayload(deps: Partial<SyncPayloadDeps> = {}) {
  return configureRuntimeFunctions(syncPayloadDeps, deps, ["getProfiles"]);
}

import { isPhase2CutoverEnabled } from './sync-delta-snapshot.js';
export { isPhase2CutoverEnabled, enablePhase2CutoverFlag, disablePhase2CutoverFlag } from './sync-delta-snapshot.js';

export async function buildSyncPayload(profileId: string, importedData: unknown, remoteChatData?: unknown) {
  const profiles = syncPayloadDeps.getProfiles();
  const profile = selectSyncedProfile(profiles.find(p => p.id === profileId));
  const aiSettings = await collectAISettings();
  const localChatData = await collectChatData(profileId);
  const chatData = remoteChatData
    ? (await import('./sync-chat-merge.js')).mergeChatData(remoteChatData as SyncChatData, localChatData) : localChatData;
  const displayPrefs = collectDisplayPrefs(profileId);
  // Strip wearable OAuth credentials before sync. Per-row LWW would let a stale
  // device resurrect a disconnected vendor or overwrite a freshly-rotated
  // refresh token. Wearable summary (the L2 dashboard data) still syncs; the
  // tokens stay local. Users connect each wearable per-device.
  const safeImported = stripNutritionMealsFromBlob(sanitizeNutritionProfileData(
    stripLocalOnlyProfileData(stripGeneticsSnpsFromBlob(stripWearableCredentials(importedData)))
  ));
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
