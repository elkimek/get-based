import type { StoredCustomPersonality } from './chat-storage-safety.js';

// chat-personality-storage.ts - encrypted persistence and in-memory access for custom personas.

import {
  normalizeCustomPersonalities,
  normalizeCustomPersonalityTombstones,
} from './chat-storage-safety.js';
import {
  encryptedGetItem,
  encryptedRemoveItem,
  encryptedSetItem,
  isEncryptedValue,
} from './crypto.js';
import { state } from './state.js';

interface PersonalityCacheEntry {
  personalities: StoredCustomPersonality[];
  rawStored: string | null;
  pending: boolean;
}
const customPersonalityCache = new Map<string, PersonalityCacheEntry>();
const personalityWrites = new Map<string, Promise<StoredCustomPersonality[]>>();
const committedPersonalityCache = new Map<string, PersonalityCacheEntry>();


export function customPersonalityStorageKey(profileId: string) {
  return `labcharts-${profileId}-chatPersonalityCustom`;
}

export function customPersonalityTombstoneStorageKey(profileId: string) {
  return `labcharts-${profileId}-chatPersonalityDeleted`;
}

export async function loadCustomPersonalityTombstones(profileId = state.currentProfile): Promise<Record<string, number>> {
  if (!profileId) return {};
  try {
    const raw = await encryptedGetItem(customPersonalityTombstoneStorageKey(profileId));
    return normalizeCustomPersonalityTombstones(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

export async function saveCustomPersonalityTombstones(tombstones: unknown, profileId = state.currentProfile) {
  if (!profileId) throw new Error('A profile is required to save custom personality deletions.');
  const key = customPersonalityTombstoneStorageKey(profileId);
  const normalized = normalizeCustomPersonalityTombstones(tombstones);
  if (Object.keys(normalized).length > 0) await encryptedSetItem(key, JSON.stringify(normalized));
  else await encryptedRemoveItem(key);
  return normalized;
}

export async function recordCustomPersonalityDeletion(id: string, profileId = state.currentProfile, deletedAt = Date.now()) {
  const tombstones = await loadCustomPersonalityTombstones(profileId);
  tombstones[id] = Math.max(Number(tombstones[id]) || 0, deletedAt);
  return saveCustomPersonalityTombstones(tombstones, profileId);
}

function clonePersonalities(personalities: readonly StoredCustomPersonality[]) {
  return personalities.map(personality => ({
    ...personality,
    ...(personality.personaAgreement
      ? { personaAgreement: { ...personality.personaAgreement } }
      : {}),
  }));
}

function parseCustomPersonalities(raw: string | null | undefined) {
  if (!raw || isEncryptedValue(raw)) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeCustomPersonalities(parsed);
    if (parsed && typeof parsed === 'object' && 'promptText' in parsed) {
      return normalizeCustomPersonalities([{
        ...parsed,
        id: parsed.id || 'custom_migrated',
      }]);
    }
  } catch { }
  return normalizeCustomPersonalities([{
    id: 'custom_migrated',
    name: 'Custom Personality',
    icon: '✏️',
    promptText: raw,
    evidenceBased: false,
  }]);
}

export function getCachedCustomPersonalities(profileId = state.currentProfile) {
  if (!profileId) return [];
  const key = customPersonalityStorageKey(profileId);
  const rawStored = localStorage.getItem(key);
  const cached = customPersonalityCache.get(profileId);
  if (cached?.pending || (cached && cached.rawStored === rawStored)) {
    return clonePersonalities(cached.personalities);
  }
  if (rawStored === null) {
    customPersonalityCache.delete(profileId);
    return [];
  }
  if (isEncryptedValue(rawStored)) {
    return cached ? clonePersonalities(cached.personalities) : [];
  }
  const personalities = parseCustomPersonalities(rawStored);
  customPersonalityCache.set(profileId, { personalities, rawStored, pending: false });
  return clonePersonalities(personalities);
}

export async function loadCustomPersonalitiesFromStorage(profileId = state.currentProfile) {
  if (!profileId) return [];
  const key = customPersonalityStorageKey(profileId);
  const rawStored = localStorage.getItem(key);
  const plaintext = await encryptedGetItem(key);
  if (customPersonalityCache.get(profileId)?.pending) return getCachedCustomPersonalities(profileId);
  if (rawStored && isEncryptedValue(rawStored) && (!plaintext || isEncryptedValue(plaintext))) {
    return getCachedCustomPersonalities(profileId);
  }
  const personalities = parseCustomPersonalities(plaintext);
  customPersonalityCache.set(profileId, { personalities, rawStored, pending: false });
  return clonePersonalities(personalities);
}

export async function saveCustomPersonalitiesToStorage(personalities: unknown, profileId = state.currentProfile) {
  if (!profileId) throw new Error('A profile is required to save custom personalities.');
  const key = customPersonalityStorageKey(profileId);
  const normalized = normalizeCustomPersonalities(personalities);
  const previousWrite = personalityWrites.get(profileId);
  if (!previousWrite) {
    const previous = customPersonalityCache.get(profileId);
    if (previous) committedPersonalityCache.set(profileId, previous);
    else committedPersonalityCache.delete(profileId);
  }
  const pending: PersonalityCacheEntry = { personalities: normalized, rawStored: localStorage.getItem(key), pending: true };
  customPersonalityCache.set(profileId, pending);
  // Preserve invocation order even when encryption/IndexedDB resolves later.
  // A pending snapshot remains visible to the next editor, but an older reply
  // may never replace that newer snapshot or roll its cache back.
  const write = (previousWrite || Promise.resolve()).catch(() => { }).then(async () => {
    try {
      await encryptedSetItem(key, JSON.stringify(normalized));
      const committed = { personalities: normalized, rawStored: localStorage.getItem(key), pending: false };
      committedPersonalityCache.set(profileId, committed);
      if (customPersonalityCache.get(profileId) === pending) customPersonalityCache.set(profileId, committed);
    } catch (error) {
      if (customPersonalityCache.get(profileId) === pending) {
        const committed = committedPersonalityCache.get(profileId);
        if (committed) customPersonalityCache.set(profileId, committed);
        else customPersonalityCache.delete(profileId);
      }
      throw error;
    }
    return clonePersonalities(normalized);
  });
  personalityWrites.set(profileId, write);
  try { return await write; }
  finally {
    if (personalityWrites.get(profileId) === write) {
      personalityWrites.delete(profileId);
      committedPersonalityCache.delete(profileId);
    }
  }
}
