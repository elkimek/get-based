// @ts-check
// chat-personality-storage.js - encrypted persistence and in-memory access for custom personas.

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

/** @type {Map<string, { personalities: any[], rawStored: string | null, pending: boolean }>} */
const customPersonalityCache = new Map();

/** @param {string} profileId */
export function customPersonalityStorageKey(profileId) {
  return `labcharts-${profileId}-chatPersonalityCustom`;
}

/** @param {string} profileId */
export function customPersonalityTombstoneStorageKey(profileId) {
  return `labcharts-${profileId}-chatPersonalityDeleted`;
}

/** @param {string} [profileId] */
export async function loadCustomPersonalityTombstones(profileId = state.currentProfile) {
  if (!profileId) return {};
  try {
    const raw = await encryptedGetItem(customPersonalityTombstoneStorageKey(profileId));
    return normalizeCustomPersonalityTombstones(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

/** @param {any} tombstones @param {string} [profileId] */
export async function saveCustomPersonalityTombstones(tombstones, profileId = state.currentProfile) {
  if (!profileId) throw new Error('A profile is required to save custom personality deletions.');
  const key = customPersonalityTombstoneStorageKey(profileId);
  const normalized = normalizeCustomPersonalityTombstones(tombstones);
  if (Object.keys(normalized).length > 0) await encryptedSetItem(key, JSON.stringify(normalized));
  else await encryptedRemoveItem(key);
  return normalized;
}

/** @param {string} id @param {string} [profileId] @param {number} [deletedAt] */
export async function recordCustomPersonalityDeletion(id, profileId = state.currentProfile, deletedAt = Date.now()) {
  const tombstones = await loadCustomPersonalityTombstones(profileId);
  tombstones[id] = Math.max(Number(tombstones[id]) || 0, deletedAt);
  return saveCustomPersonalityTombstones(tombstones, profileId);
}

/** @param {any[]} personalities */
function clonePersonalities(personalities) {
  return personalities.map(personality => ({
    ...personality,
    ...(personality.personaAgreement
      ? { personaAgreement: { ...personality.personaAgreement } }
      : {}),
  }));
}

/** @param {string | null | undefined} raw */
function parseCustomPersonalities(raw) {
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
  } catch {}
  return normalizeCustomPersonalities([{
    id: 'custom_migrated',
    name: 'Custom Personality',
    icon: '✏️',
    promptText: raw,
    evidenceBased: false,
  }]);
}

/**
 * Synchronous reads use the decrypted in-memory cache. Plaintext legacy
 * records can still be parsed directly before data protection is enabled.
 * @param {string} [profileId]
 */
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

/** @param {string} [profileId] */
export async function loadCustomPersonalitiesFromStorage(profileId = state.currentProfile) {
  if (!profileId) return [];
  const key = customPersonalityStorageKey(profileId);
  const rawStored = localStorage.getItem(key);
  const plaintext = await encryptedGetItem(key);
  if (rawStored && isEncryptedValue(rawStored) && (!plaintext || isEncryptedValue(plaintext))) {
    return getCachedCustomPersonalities(profileId);
  }
  const personalities = parseCustomPersonalities(plaintext);
  customPersonalityCache.set(profileId, { personalities, rawStored, pending: false });
  return clonePersonalities(personalities);
}

/**
 * @param {any[]} personalities
 * @param {string} [profileId]
 */
export async function saveCustomPersonalitiesToStorage(personalities, profileId = state.currentProfile) {
  if (!profileId) throw new Error('A profile is required to save custom personalities.');
  const key = customPersonalityStorageKey(profileId);
  const normalized = normalizeCustomPersonalities(personalities);
  const previous = customPersonalityCache.get(profileId);
  customPersonalityCache.set(profileId, {
    personalities: normalized,
    rawStored: localStorage.getItem(key),
    pending: true,
  });
  try {
    await encryptedSetItem(key, JSON.stringify(normalized));
    customPersonalityCache.set(profileId, {
      personalities: normalized,
      rawStored: localStorage.getItem(key),
      pending: false,
    });
  } catch (error) {
    if (previous) customPersonalityCache.set(profileId, previous);
    else customPersonalityCache.delete(profileId);
    throw error;
  }
  return clonePersonalities(normalized);
}
