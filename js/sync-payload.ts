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
import { selectSyncedProfile, syncedProfileMetadataClock } from './sync-profile-fields.js';
import {scalarPayloadClocks} from './sync-scalar-snapshot.js';
import {DELTA_SCALARS} from './sync-delta-surfaces.js';
import {getAt, setAt} from './data-merge.js';
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

export async function buildSyncPayload(profileId: string, importedData: unknown, remoteChatData?: unknown, options: { scalarClocks?: Record<string, number>; completeSnapshot?: boolean; profileSnapshot?: unknown } = {}) {
  const profiles = syncPayloadDeps.getProfiles();
  const profile = selectSyncedProfile(options.profileSnapshot === undefined ? profiles.find(p => p.id === profileId) : options.profileSnapshot);
  // Explicit recovery republishes the chosen metadata as a new edit too.
  // Ordinary forced reconnects preserve the original metadata edit clock.
  if (profile && options.completeSnapshot && options.profileSnapshot === undefined) profile._syncMetadataAt = Math.max(Date.now(), syncedProfileMetadataClock(profile) + 1);
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
  const scalarClocks = options.scalarClocks ?? (options.completeSnapshot ? scalarPayloadClocks(profileId, importedData, [], true) : undefined);
  if (scalarClocks && safeImported && typeof safeImported === 'object') {
    for (const field of DELTA_SCALARS) if ((options.completeSnapshot || (scalarClocks[field] || 0) > 0) && getAt(safeImported, field) === undefined) setAt(safeImported, field, null);
  }
  const cutover = isPhase2CutoverEnabled(profileId);
  const inner = JSON.stringify({
    _v: cutover ? 4 : 3,
    importedData: cutover ? undefined : safeImported,
    scalarClocks,
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
