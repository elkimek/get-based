import { LENS_CONFIG_STORAGE_KEY } from './lens-config-store.js';
import { VOICE_BACKUP_KEYS } from './voice-settings-schema.js';
import { profileStorageKey } from './profile-storage-key.js';
import { canonicalRoutstrUrl } from './url-safety.js';

type BackupRestoreView = Record<string, unknown>;
export const isEncryptedValue = (v: unknown) => typeof v === 'string' && v.startsWith('v1:');

export const GLOBAL_SETTINGS_KEYS = [
  'labcharts-api-key', 'labcharts-lens-key', LENS_CONFIG_STORAGE_KEY,
  'labcharts-venice-key', 'labcharts-openrouter-key', 'labcharts-routstr-key', 'labcharts-routstr-sessions', 'labcharts-ppq-key',
  'labcharts-custom-key', 'labcharts-custom-url', 'labcharts-custom-model', 'labcharts-custom-models',
  'labcharts-ai-provider',
  'labcharts-ppq-credit-id',
  'labcharts-venice-model', 'labcharts-venice-e2ee', 'labcharts-openrouter-model', 'labcharts-routstr-model', 'labcharts-ppq-model', 'labcharts-ppq-private-mode',
  'labcharts-ollama', 'labcharts-ollama-model',
  'labcharts-ollama-pii-url', 'labcharts-ollama-pii-key', 'labcharts-ollama-pii-model',
  'labcharts-nutrition-ai-route',
  ...VOICE_BACKUP_KEYS,
  'labcharts-routstr-node',
  'labcharts-time-format', 'labcharts-theme', 'labcharts-sunset-mode', 'labcharts-crt-effects', 'labcharts-debug',
  'labcharts-pii-review', 'labcharts-ollama-pii-enabled', 'labcharts-chat-sources',
  'labcharts-active-profile'
];

export const PER_PROFILE_PREF_SUFFIXES = [
  'units', 'rangeMode', 'suppOverlay', 'noteOverlay', 'phaseOverlay',
  'correlation-workspace', 'chatPersonality', 'chatPersonalityCustom', 'chatPersonalityDeleted', 'chatRailOpen'
];

const DESTINATION_SETTINGS = [
  ['labcharts-custom-url', 'labcharts-custom-key'], ['labcharts-ollama-pii-url', 'labcharts-ollama-pii-key'],
  ['labcharts-voice-local-server-url', 'labcharts-voice-local-server-key'], [LENS_CONFIG_STORAGE_KEY, 'labcharts-lens-key'],
] as const;

function portableSettings(backup: BackupRestoreView, isCredentialKey: (key: string) => boolean): Record<string, string> {
  const source = backup.settings || {};
  if (typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid backup settings.');
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!GLOBAL_SETTINGS_KEYS.includes(key)) continue;
    if (typeof value !== 'string') throw new Error('Invalid backup setting value.');
    // Legacy cleartext credentials cannot establish ownership of a destination.
    if (isCredentialKey(key) && (!backup.encrypted || !value.startsWith('v1:'))) continue;
    if (key === 'labcharts-routstr-node') {
      const canonical = canonicalRoutstrUrl(value);
      if (!canonical) continue;
      values[key] = canonical;
      continue;
    }
    values[key] = value;
  }
  for (const [url, credential] of DESTINATION_SETTINGS) {
    const previous = localStorage.getItem(url);
    const next = values[url];
    if (url === 'labcharts-custom-url' && next && values[credential]
      && (next === previous || !localStorage.getItem(credential))) {
      // Only the decrypted credential can attest its intended endpoint. This
      // local guard cannot be supplied or removed by a file's settings object.
      values['labcharts-custom-key-requires-binding'] = 'true';
      continue;
    }
    if (!next || next !== previous) {
      delete values[credential];
      // A destination from a file cannot inherit this device's existing key.
      if (localStorage.getItem(credential) || typeof (source as Record<string, unknown>)[credential] === 'string') delete values[url];
    }
  }
  // Routstr sessions are node-bound in labcharts-routstr-sessions; keep canonical node selection
  // on fresh restores while preventing a backup from redirecting an unmigrated legacy routstr-key.
  const prevRoutstrNode = localStorage.getItem('labcharts-routstr-node');
  const nextRoutstrNode = values['labcharts-routstr-node'];
  if (!nextRoutstrNode || nextRoutstrNode !== prevRoutstrNode) {
    delete values['labcharts-routstr-key'];
    const hasNodeBoundSessions = Boolean(values['labcharts-routstr-sessions'] || localStorage.getItem('labcharts-routstr-sessions'));
    if (!hasNodeBoundSessions && localStorage.getItem('labcharts-routstr-key')) delete values['labcharts-routstr-node'];
  }
  return values;
}

export const BACKUP_WEARABLE_SOURCES = ['oura', 'fitbit', 'withings', 'ultrahuman', 'polar', 'apple_health', 'manual'];

const plainRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validProfileId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);

function validEncryptionManifest(value: unknown) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  const sizes = parts[0] === 'v2' ? [16, 12, 48] : [16];
  if (parts[0] === 'v2') parts.shift();
  if (parts.length !== sizes.length) return false;
  try { return parts.every((part, index) => atob(part).length === sizes[index]); }
  catch { return false; }
}

export function prepareBackupRestore(backup: BackupRestoreView, isCredentialKey: (key: string) => boolean) {
  if (backup.encrypted != null && typeof backup.encrypted !== 'boolean') throw new Error('Invalid backup encryption flag.');
  if (typeof backup.profileList !== 'string' || !Array.isArray(backup.profiles)) throw new Error('Invalid backup profile index.');
  const ids = new Set<string>();
  const values: Record<string, string | null> = portableSettings(backup, isCredentialKey);
  for (const profile of backup.profiles) {
    if (!plainRecord(profile) || !validProfileId(profile.profileId) || ids.has(profile.profileId) || !plainRecord(profile.keys)) throw new Error('Invalid backup profile.');
    ids.add(profile.profileId);
    const saved = profile.keys;
    const known = ['imported','chat','chat-threads',...PER_PROFILE_PREF_SUFFIXES];
    const messagePrefix = profileStorageKey(profile.profileId, 'chat-t_');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(messagePrefix) && !Object.hasOwn(saved, key.slice(profileStorageKey(profile.profileId, '').length))) values[key] = null;
    }
    for (const suffix of known) if (!Object.hasOwn(saved, suffix)) values[profileStorageKey(profile.profileId, suffix)] = null;
    for (const [suffix, value] of Object.entries(profile.keys)) {
      if (!known.includes(suffix) && !/^chat-t_[A-Za-z0-9_-]{1,160}$/.test(suffix)) throw new Error('Unexpected profile storage field.');
      if (typeof value !== 'string') throw new Error('Invalid profile storage value.');
      values[profileStorageKey(profile.profileId, suffix)] = value;
    }
  }
  if (backup.encrypted === true) {
    if (!validEncryptionManifest(backup.encryptionSalt) || !isEncryptedValue(backup.profileList)) throw new Error('Incomplete encrypted backup.');
  } else {
    const list: unknown = JSON.parse(backup.profileList);
    if (!Array.isArray(list) || list.length !== ids.size
      || list.some(profile => !plainRecord(profile) || !validProfileId(profile.id) || !ids.has(profile.id))
      || new Set(list.map(profile => profile.id)).size !== ids.size) throw new Error('Invalid backup profile list.');
  }
  for (const field of ['wearableIDB', 'cycleIDB', 'cycleImportMeta']) {
    const table = backup[field];
    if (table == null) continue;
    if (!plainRecord(table)) throw new Error('Invalid backup side store.');
    for (const [id, sources] of Object.entries(table)) {
      if (!ids.has(id)) throw new Error('Backup side store references an unknown profile.');
      if (field === 'cycleImportMeta') {
        if (!Array.isArray(sources) || sources.some(row => !plainRecord(row) || typeof row.importId !== 'string' || !row.importId || typeof row.source !== 'string' || !row.source)) throw new Error('Invalid cycle import record.');
        continue;
      }
      if (!plainRecord(sources)) throw new Error('Invalid backup source.');
      for (const [source, rows] of Object.entries(sources)) {
        if (!source || field === 'wearableIDB' && !BACKUP_WEARABLE_SOURCES.includes(source) || !Array.isArray(rows)
          || rows.some(row => !plainRecord(row) || row.source !== source || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date))) throw new Error('Invalid daily backup record.');
      }
    }
  }
  return { values, profileIds: [...ids] };
}
