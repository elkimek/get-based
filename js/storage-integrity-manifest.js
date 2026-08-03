// @ts-check
// Privacy-safe, read-only storage integrity manifests for migration checks.
// Raw keys and values are never included. A manifest session keeps its HMAC
// key in memory so before/after captures can be compared without making
// health data, credentials, wallet state, or storage identifiers recoverable
// from exported diagnostics.

export const STORAGE_INTEGRITY_MANIFEST_VERSION = 1;

export const STORAGE_CATEGORIES = Object.freeze({
  PROFILE_DATA: 'profile-data',
  PROFILE_METADATA: 'profile-metadata',
  PROFILE_PREFERENCES: 'profile-preferences',
  RAW_HEALTH: 'raw-health',
  DERIVED: 'derived',
  CREDENTIALS: 'credentials',
  WALLET: 'wallet',
  SYNC: 'sync',
  BACKUP: 'backup',
  APP_CACHE: 'app-cache',
  MIGRATION: 'migration',
  SETTINGS: 'settings',
  UNKNOWN: 'unknown',
});

const PROFILE_DATA_KEY_RE = /^labcharts-[A-Za-z0-9_-]+-(?:imported|chat|chat-threads|chat-t_.+)$/;
const PROFILE_PREFERENCE_KEY_RE = /^labcharts-[A-Za-z0-9_-]+-(?:units|rangeMode|showAltUnits|suppOverlay|noteOverlay|phaseOverlay|chatPersonality|chatPersonalityCustom|chatRailOpen)$/;
const WALLET_KEY_RE = /(?:cashu|routstr|wallet|ppq-credit)/i;
const SYNC_KEY_RE = /(?:sync|relay|evolu|agent-access)/i;
const CREDENTIAL_KEY_RE = /(?:encryption|credential|oauth|api[-_]?key|(?:^|-)key$|token)/i;
const BACKUP_KEY_RE = /(?:backup|imported-corrupt|recovery)/i;
const DERIVED_KEY_RE = /(?:cache|fingerprint|biology-score|correlation|benchmark)/i;

function normalizeCategory(category) {
  return Object.values(STORAGE_CATEGORIES).includes(category)
    ? category
    : STORAGE_CATEGORIES.UNKNOWN;
}

export function classifyLocalStorageKey(key) {
  const value = String(key || '');
  if (/^labcharts-migration-/.test(value)) return STORAGE_CATEGORIES.MIGRATION;
  if (BACKUP_KEY_RE.test(value)) return STORAGE_CATEGORIES.BACKUP;
  if (WALLET_KEY_RE.test(value)) return STORAGE_CATEGORIES.WALLET;
  if (SYNC_KEY_RE.test(value)) return STORAGE_CATEGORIES.SYNC;
  if (CREDENTIAL_KEY_RE.test(value)) return STORAGE_CATEGORIES.CREDENTIALS;
  if (value === 'labcharts-profiles' || value === 'labcharts-active-profile') {
    return STORAGE_CATEGORIES.PROFILE_METADATA;
  }
  if (PROFILE_DATA_KEY_RE.test(value)) return STORAGE_CATEGORIES.PROFILE_DATA;
  if (PROFILE_PREFERENCE_KEY_RE.test(value)) return STORAGE_CATEGORIES.PROFILE_PREFERENCES;
  if (DERIVED_KEY_RE.test(value)) return STORAGE_CATEGORIES.DERIVED;
  if (value.startsWith('labcharts-')) return STORAGE_CATEGORIES.SETTINGS;
  return STORAGE_CATEGORIES.UNKNOWN;
}

export function classifyDatabaseName(name) {
  const value = String(name || '');
  if (value === 'labcharts-blobs') return STORAGE_CATEGORIES.PROFILE_DATA;
  if (value === 'getbased-cashu') return STORAGE_CATEGORIES.WALLET;
  if (value === 'labcharts-backups') return STORAGE_CATEGORIES.BACKUP;
  if (value.startsWith('labcharts-wearables-') || value.startsWith('labcharts-cycle-')) {
    return STORAGE_CATEGORIES.RAW_HEALTH;
  }
  if (/evolu|sync/i.test(value)) return STORAGE_CATEGORIES.SYNC;
  if (/migration/i.test(value)) return STORAGE_CATEGORIES.MIGRATION;
  return STORAGE_CATEGORIES.UNKNOWN;
}

export function classifyCacheName(name) {
  const value = String(name || '');
  if (value.startsWith('labcharts-v')) return STORAGE_CATEGORIES.APP_CACHE;
  if (/transformers|model|lens/i.test(value)) return STORAGE_CATEGORIES.DERIVED;
  return STORAGE_CATEGORIES.UNKNOWN;
}

function canonicalValue(value, seen = new WeakSet()) {
  if (value === undefined) return { $type: 'undefined' };
  if (typeof value === 'bigint') return { $type: 'bigint', value: String(value) };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $type: 'number', value: String(value) };
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return { $type: 'date', value: value.toISOString() };
  if (value instanceof ArrayBuffer) {
    return { $type: 'array-buffer', value: Array.from(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      $type: value.constructor?.name || 'typed-array',
      value: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
    };
  }
  if (seen.has(value)) throw new TypeError('Storage integrity values must not contain cycles.');
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map(item => canonicalValue(item, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalValue(value[key], seen);
  }
  seen.delete(value);
  return result;
}

function canonicalString(value) {
  return JSON.stringify(canonicalValue(value));
}

async function createEphemeralFingerprinter() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto is required for privacy-safe storage integrity manifests.');
  }
  const key = await globalThis.crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const encoder = new TextEncoder();
  return async value => {
    const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(value));
    return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
  };
}

async function fingerprintEntry(fingerprint, namespace, value) {
  return fingerprint(`${namespace}\u0000${canonicalString(value)}`);
}

function categoryCounts(entries) {
  const counts = {};
  for (const entry of entries) counts[entry.category] = (counts[entry.category] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function buildLocalStorageManifest(entries, fingerprint) {
  const manifestEntries = [];
  for (const entry of entries || []) {
    const category = normalizeCategory(entry.category || classifyLocalStorageKey(entry.key));
    manifestEntries.push({
      category,
      keyFingerprint: await fingerprintEntry(fingerprint, 'local-key', String(entry.key || '')),
      valueFingerprint: await fingerprintEntry(fingerprint, 'local-value', entry.value),
    });
  }
  manifestEntries.sort((a, b) => a.keyFingerprint.localeCompare(b.keyFingerprint));
  return {
    entryCount: manifestEntries.length,
    categories: categoryCounts(manifestEntries),
    entries: manifestEntries,
  };
}

async function buildDatabaseManifest(databases, fingerprint) {
  const output = [];
  for (const database of databases || []) {
    const category = normalizeCategory(database.category || classifyDatabaseName(database.name));
    const stores = [];
    for (const store of database.stores || []) {
      const records = [];
      for (const record of store.records || []) {
        records.push({
          keyFingerprint: await fingerprintEntry(fingerprint, 'idb-record-key', record.key),
          valueFingerprint: await fingerprintEntry(fingerprint, 'idb-record-value', record.value),
        });
      }
      records.sort((a, b) => a.keyFingerprint.localeCompare(b.keyFingerprint));
      stores.push({
        nameFingerprint: await fingerprintEntry(fingerprint, 'idb-store-name', String(store.name || '')),
        count: Number.isSafeInteger(store.count) && store.count >= 0 ? store.count : records.length,
        records,
      });
    }
    stores.sort((a, b) => a.nameFingerprint.localeCompare(b.nameFingerprint));
    output.push({
      category,
      nameFingerprint: await fingerprintEntry(fingerprint, 'idb-name', String(database.name || '')),
      stores,
    });
  }
  output.sort((a, b) => a.nameFingerprint.localeCompare(b.nameFingerprint));
  return {
    databaseCount: output.length,
    categories: categoryCounts(output),
    databases: output,
  };
}

async function buildCacheManifest(caches, fingerprint) {
  const output = [];
  for (const cache of caches || []) {
    const category = normalizeCategory(cache.category || classifyCacheName(cache.name));
    const requestFingerprints = [];
    for (const request of cache.requests || []) {
      requestFingerprints.push(await fingerprintEntry(fingerprint, 'cache-request', request));
    }
    requestFingerprints.sort();
    output.push({
      category,
      nameFingerprint: await fingerprintEntry(fingerprint, 'cache-name', String(cache.name || '')),
      requestCount: Number.isSafeInteger(cache.requestCount) && cache.requestCount >= 0
        ? cache.requestCount
        : requestFingerprints.length,
      requestFingerprints,
    });
  }
  output.sort((a, b) => a.nameFingerprint.localeCompare(b.nameFingerprint));
  return {
    cacheCount: output.length,
    categories: categoryCounts(output),
    caches: output,
  };
}

async function buildManifest(snapshot, fingerprint) {
  return {
    version: STORAGE_INTEGRITY_MANIFEST_VERSION,
    localStorage: await buildLocalStorageManifest(snapshot?.localStorage, fingerprint),
    indexedDB: await buildDatabaseManifest(snapshot?.indexedDB, fingerprint),
    caches: await buildCacheManifest(snapshot?.caches, fingerprint),
  };
}

export async function createStorageIntegritySession(options = {}) {
  const fingerprint = options.fingerprint || await createEphemeralFingerprinter();
  if (typeof fingerprint !== 'function') throw new TypeError('A fingerprint function is required.');
  return Object.freeze({
    capture: snapshot => buildManifest(snapshot, fingerprint),
  });
}

function flattenManifest(manifest, allowedCategories) {
  const entries = new Map();
  for (const entry of manifest?.localStorage?.entries || []) {
    if (allowedCategories.has(entry.category)) continue;
    entries.set(`local:${entry.keyFingerprint}`, canonicalString(entry));
  }
  for (const database of manifest?.indexedDB?.databases || []) {
    if (allowedCategories.has(database.category)) continue;
    for (const store of database.stores || []) {
      entries.set(
        `idb:${database.nameFingerprint}:${store.nameFingerprint}`,
        canonicalString({ category: database.category, ...store }),
      );
    }
  }
  for (const cache of manifest?.caches?.caches || []) {
    if (allowedCategories.has(cache.category)) continue;
    entries.set(`cache:${cache.nameFingerprint}`, canonicalString(cache));
  }
  return entries;
}

export function compareStorageIntegrityManifests(before, after, options = {}) {
  if (before?.version !== STORAGE_INTEGRITY_MANIFEST_VERSION
      || after?.version !== STORAGE_INTEGRITY_MANIFEST_VERSION) {
    throw new Error('Unsupported storage integrity manifest version.');
  }
  const allowedCategories = new Set(options.allowedCategories || []);
  const previous = flattenManifest(before, allowedCategories);
  const next = flattenManifest(after, allowedCategories);
  const changes = [];
  for (const id of Array.from(new Set([...previous.keys(), ...next.keys()])).sort()) {
    const previousValue = previous.get(id) || null;
    const nextValue = next.get(id) || null;
    if (previousValue === nextValue) continue;
    changes.push({
      id,
      change: previousValue === null ? 'added' : nextValue === null ? 'removed' : 'changed',
    });
  }
  return { unchanged: changes.length === 0, changes };
}
