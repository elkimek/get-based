// wearables-whoop-storage.js — device-only protection for WHOOP profile data
//
// Raw WHOOP rows already live in the wearable L1 database. A smaller amount
// of WHOOP-specific information also exists in the normal imported profile
// blob (connection metadata, derived summary fields, source overrides, and
// wearable change events). Split those fields into an AES-GCM envelope whose
// non-extractable key stays in the same device-local wearable database. The
// normal runtime shape is restored transparently after reads, whether or not
// the remaining profile blob also has optional passphrase protection.

import type { DeviceLocalEnvelope, StoredWearableRow } from './wearable-storage-types.js';
interface WearableProfileSummary extends Record<string, unknown> {
  sources?: Record<string, unknown>;
  metrics?: Record<string, { primarySource?: unknown } | null>;
}
interface WearableProfileEvent extends Record<string, unknown> { type?: unknown; source?: unknown; ts?: unknown }
interface WearableProfileData extends Record<string, unknown> {
  wearableConnections?: Record<string, unknown>;
  wearableSummary?: WearableProfileSummary;
  wearablePrimaryOverride?: Record<string, unknown>;
  changeHistory?: WearableProfileEvent[];
}
interface ProtectedWhoopData extends Record<string, unknown> {
  version: number;
  connection?: unknown;
  summary?: { source?: unknown; metrics?: WearableProfileSummary['metrics'] };
  primaryOverride?: Record<string, unknown>;
  changeHistory?: WearableProfileEvent[];
}
interface WhoopStorageDeps {
  encryptWearableDeviceLocalValue: (profileId: string, value: unknown) => Promise<DeviceLocalEnvelope>;
  decryptWearableDeviceLocalValue: (profileId: string, envelope: DeviceLocalEnvelope | null) => Promise<Record<string, unknown> | null>;
  openWearablesDB: (profileId: string) => Promise<IDBDatabase>;
  getMeta: (profileId: string, key: string) => Promise<unknown>;
  setMeta: (profileId: string, key: string, value: unknown) => Promise<void>;
  deleteMeta: (profileId: string, key: string) => Promise<void>;
}

export const WHOOP_PROFILE_DATA_META = 'whoop-profile-data:v1';
const DEVICE_PROTECTED_WEARABLE_MARKER = '_deviceProtectedWearableProfile';
const DEVICE_PROTECTED_WEARABLE_VERSION = 'v1';
const WHOOP_SOURCE_TOKEN = '"whoop"';
const WHOOP_STORAGE_MARKER_TOKEN = `"${DEVICE_PROTECTED_WEARABLE_MARKER}"`;
const migratedSourcesByDatabase = new WeakMap<IDBDatabase, Set<string>>();

export const WHOOP_CONNECT_DISCLOSURE = `WHOOP will let getbased read your basic profile plus physiological cycle, recovery, sleep, and workout data. No write access is requested.

getbased uses this data to show daily Body metrics, personal baselines, trends, and comparisons. OAuth tokens, imported daily rows, and WHOOP-specific local profile data are AES-GCM encrypted on this device. WHOOP is self-host only: OAuth exchanges and WHOOP API requests use infrastructure controlled by this deployment.

By continuing, you authorize this deployment to access and store those WHOOP readings for this profile. If you enable cross-device sync, a compact derived summary is sent through the end-to-end-encrypted relay. If you use a cloud AI or agent while Wearables context is enabled, that summary may be sent to the provider you selected. You can disable Wearables context before using those features.

Disconnecting deletes this device's WHOOP credentials, imported rows, and derived source data. Revoke the app in WHOOP to stop access granted to this developer application.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseImportedValue(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed as WearableProfileData : null;
  } catch {
    return null;
  }
}

function profileIdForImportedStorageKey(key: string) {
  if (key === 'labcharts-imported') return 'default';
  return key.match(/^labcharts-(.+)-imported$/)?.[1] || null;
}

function splitWhoopProfileData(importedData: WearableProfileData) {
  const hadMarker = importedData?.[DEVICE_PROTECTED_WEARABLE_MARKER] === DEVICE_PROTECTED_WEARABLE_VERSION;
  const sanitized = { ...importedData };
  delete sanitized[DEVICE_PROTECTED_WEARABLE_MARKER];
  const protectedData: ProtectedWhoopData = { version: 1 };
  let found = false;

  if (isRecord(importedData.wearableConnections)
      && Object.prototype.hasOwnProperty.call(importedData.wearableConnections, 'whoop')) {
    protectedData.connection = importedData.wearableConnections.whoop;
    sanitized.wearableConnections = { ...importedData.wearableConnections };
    delete sanitized.wearableConnections.whoop;
    found = true;
  }

  if (isRecord(importedData.wearableSummary)) {
    const source = importedData.wearableSummary.sources?.whoop;
    const metrics = Object.fromEntries(Object.entries(importedData.wearableSummary.metrics || {})
      .filter(([, metric]) => metric?.primarySource === 'whoop'));
    if (source !== undefined || Object.keys(metrics).length > 0) {
      protectedData.summary = { source: source ?? null, metrics };
      const sources = { ...(importedData.wearableSummary.sources || {}) };
      delete sources.whoop;
      const publicMetrics = { ...(importedData.wearableSummary.metrics || {}) };
      for (const metricId of Object.keys(metrics)) delete publicMetrics[metricId];
      sanitized.wearableSummary = {
        ...importedData.wearableSummary,
        sources,
        metrics: publicMetrics,
      };
      found = true;
    }
  }

  if (isRecord(importedData.wearablePrimaryOverride)) {
    const overrides = Object.fromEntries(Object.entries(importedData.wearablePrimaryOverride)
      .filter(([, source]) => source === 'whoop'));
    if (Object.keys(overrides).length > 0) {
      protectedData.primaryOverride = overrides;
      sanitized.wearablePrimaryOverride = { ...importedData.wearablePrimaryOverride };
      for (const metricId of Object.keys(overrides)) delete sanitized.wearablePrimaryOverride[metricId];
      found = true;
    }
  }

  if (Array.isArray(importedData.changeHistory)) {
    const events = importedData.changeHistory.filter(event => event?.type === 'wearable' && event?.source === 'whoop');
    if (events.length > 0) {
      protectedData.changeHistory = events;
      sanitized.changeHistory = importedData.changeHistory.filter(event => !(event?.type === 'wearable' && event?.source === 'whoop'));
      found = true;
    }
  }

  if (found || hadMarker) sanitized[DEVICE_PROTECTED_WEARABLE_MARKER] = DEVICE_PROTECTED_WEARABLE_VERSION;
  return { found, hadMarker, protectedData, sanitized };
}

function mergeWhoopProfileData(importedData: WearableProfileData, protectedData: ProtectedWhoopData | null) {
  const hydrated = { ...importedData };
  delete hydrated[DEVICE_PROTECTED_WEARABLE_MARKER];
  if (!isRecord(protectedData) || protectedData.version !== 1) return hydrated;

  if (Object.prototype.hasOwnProperty.call(protectedData, 'connection')) {
    hydrated.wearableConnections = {
      ...(hydrated.wearableConnections || {}),
      whoop: protectedData.connection,
    };
  }

  if (isRecord(protectedData.summary)) {
    const currentSummary = hydrated.wearableSummary || {};
    const sources = { ...(currentSummary.sources || {}) };
    if (protectedData.summary.source !== null && protectedData.summary.source !== undefined) {
      sources.whoop = protectedData.summary.source;
    }
    hydrated.wearableSummary = {
      ...currentSummary,
      sources,
      metrics: {
        ...(currentSummary.metrics || {}),
        ...(protectedData.summary.metrics || {}),
      },
    };
  }

  if (isRecord(protectedData.primaryOverride)) {
    hydrated.wearablePrimaryOverride = {
      ...(hydrated.wearablePrimaryOverride || {}),
      ...protectedData.primaryOverride,
    };
  }

  if (Array.isArray(protectedData.changeHistory) && protectedData.changeHistory.length > 0) {
    hydrated.changeHistory = [
      ...(Array.isArray(hydrated.changeHistory) ? hydrated.changeHistory : []),
      ...protectedData.changeHistory,
    ].sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
  }
  return hydrated;
}

async function saveProtectedData(profileId: string, protectedData: ProtectedWhoopData, deps: Pick<WhoopStorageDeps, 'encryptWearableDeviceLocalValue' | 'setMeta'>) {
  const envelope = await deps.encryptWearableDeviceLocalValue(profileId, protectedData);
  await deps.setMeta(profileId, WHOOP_PROFILE_DATA_META, envelope);
}

export async function migrateRestrictedProviderRows(profileId: string, source: string, deps: Pick<WhoopStorageDeps, 'openWearablesDB' | 'encryptWearableDeviceLocalValue'>) {
  const db = await deps.openWearablesDB(profileId);
  let migratedSources = migratedSourcesByDatabase.get(db);
  if (!migratedSources) {
    migratedSources = new Set<string>();
    migratedSourcesByDatabase.set(db, migratedSources);
  }
  if (migratedSources.has(source)) return;

  const rows = await new Promise<StoredWearableRow[]>((resolve, reject) => {
    const tx = db.transaction('daily-metrics', 'readonly');
    const request: IDBRequest<StoredWearableRow[]> = tx.objectStore('daily-metrics').index('by_source').getAll(IDBKeyRange.only(source));
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  const candidates: { original: StoredWearableRow; wrapped: StoredWearableRow }[] = [];
  for (const row of rows || []) {
    if (!row || row._devicePayload || row._payload) continue;
    const { source, date, ...rest } = row;
    candidates.push({
      original: row,
      wrapped: {
        source,
        date,
        _devicePayload: await deps.encryptWearableDeviceLocalValue(profileId, rest),
      },
    });
  }
  if (candidates.length === 0) {
    migratedSources.add(source);
    return;
  }

  // Re-check every key in the write transaction so a legacy-row migration
  // cannot overwrite a newer sync that landed while its envelope was built.
  const tx = db.transaction('daily-metrics', 'readwrite');
  const store = tx.objectStore('daily-metrics');
  for (const candidate of candidates) {
    const request: IDBRequest<StoredWearableRow | undefined> = store.get([candidate.original.source, candidate.original.date]);
    request.onsuccess = () => {
      const current = request.result;
      if (!current || current._devicePayload || current._payload) return;
      if ((current.importedAt ?? null) !== (candidate.original.importedAt ?? null)) return;
      store.put(candidate.wrapped);
    };
  }
  await new Promise<Event>((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
  migratedSources.add(source);
}

/**
 * Split WHOOP-specific fields out of an imported profile value before the
 * remaining profile blob is persisted (with or without a passphrase).
 */
async function protectWhoopImportedValue(profileId: string, value: string, deps: WhoopStorageDeps) {
  const parsed = parseImportedValue(value);
  if (!parsed) return value;
  const split = splitWhoopProfileData(parsed);
  if (split.found) await saveProtectedData(profileId, split.protectedData, deps);
  else if (!split.hadMarker) await deps.deleteMeta(profileId, WHOOP_PROFILE_DATA_META);
  return JSON.stringify(split.sanitized);
}

async function protectWhoopStorageValue(key: string, value: string, deps: WhoopStorageDeps) {
  const profileId = profileIdForImportedStorageKey(key);
  return profileId ? protectWhoopImportedValue(profileId, value, deps) : value;
}

/**
 * Restore the runtime profile shape. Legacy plaintext WHOOP fields are moved
 * into the device-only envelope on first read and a sanitized replacement is
 * returned so the caller can rewrite the imported blob immediately.
 */
async function hydrateWhoopImportedValue(profileId: string, value: string, deps: WhoopStorageDeps) {
  const parsed = parseImportedValue(value);
  if (!parsed) return { value, storedValue: value, migrated: false };
  const split = splitWhoopProfileData(parsed);
  if (split.found) {
    await saveProtectedData(profileId, split.protectedData, deps);
    const hydrated = { ...parsed };
    delete hydrated[DEVICE_PROTECTED_WEARABLE_MARKER];
    return {
      value: JSON.stringify(hydrated),
      storedValue: JSON.stringify(split.sanitized),
      migrated: true,
    };
  }
  if (!split.hadMarker) return { value, storedValue: value, migrated: false };

  const envelope = await deps.getMeta(profileId, WHOOP_PROFILE_DATA_META);
  const protectedData = await deps.decryptWearableDeviceLocalValue(profileId, envelope as DeviceLocalEnvelope | null) as ProtectedWhoopData | null;
  return {
    value: JSON.stringify(mergeWhoopProfileData(split.sanitized, protectedData)),
    storedValue: value,
    migrated: false,
  };
}

async function hydrateWhoopStorageValue(key: string, value: string, deps: WhoopStorageDeps) {
  const profileId = profileIdForImportedStorageKey(key);
  return profileId
    ? hydrateWhoopImportedValue(profileId, value, deps)
    : { value, storedValue: value, migrated: false };
}

export async function transformWhoopStorageValue<T>(key: string, value: T, mode: string, encrypted = false, deps: Partial<WhoopStorageDeps> = {}): Promise<{ value: T | string; storedValue: T | string; migrated: boolean }> {
  const unchanged = { value, storedValue: value, migrated: false };
  if (typeof value !== 'string'
      || (!value.includes(WHOOP_SOURCE_TOKEN) && !value.includes(WHOOP_STORAGE_MARKER_TOKEN))) return unchanged;
  if (mode === 'hydrate') {
    if (encrypted && !value.includes(WHOOP_STORAGE_MARKER_TOKEN)) return unchanged;
    return hydrateWhoopStorageValue(key, value, deps as WhoopStorageDeps);
  }
  return { ...unchanged, value: await protectWhoopStorageValue(key, value, deps as WhoopStorageDeps) };
}
