// @ts-check
// chat-personality-merge.js — deterministic per-persona sync conflict handling.

import {
  normalizeCustomPersonalities,
  normalizeCustomPersonalityTombstones,
} from './chat-storage-safety.js';

/** @param {any} personality */
export function customPersonalityUpdatedAtMs(personality) {
  const parsed = Date.parse(personality?.updatedAt || personality?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/** @param {any} left @param {any} right */
function pickNewerPersona(left, right) {
  const leftTs = customPersonalityUpdatedAtMs(left);
  const rightTs = customPersonalityUpdatedAtMs(right);
  if (rightTs !== leftTs) return rightTs > leftTs ? right : left;
  return JSON.stringify(right).localeCompare(JSON.stringify(left)) > 0 ? right : left;
}

/**
 * @param {any[]} localPersonalities
 * @param {any[]} incomingPersonalities
 * @param {any} localTombstones
 * @param {any} incomingTombstones
 */
export function mergeCustomPersonalityState(
  localPersonalities,
  incomingPersonalities,
  localTombstones,
  incomingTombstones,
) {
  const local = normalizeCustomPersonalities(localPersonalities);
  const incoming = normalizeCustomPersonalities(incomingPersonalities);
  const deleted = normalizeCustomPersonalityTombstones(localTombstones);
  for (const [id, deletedAt] of Object.entries(normalizeCustomPersonalityTombstones(incomingTombstones))) {
    deleted[id] = Math.max(Number(deleted[id]) || 0, deletedAt);
  }

  const byId = new Map(local.map(personality => [personality.id, personality]));
  for (const personality of incoming) {
    const previous = byId.get(personality.id);
    byId.set(personality.id, previous ? pickNewerPersona(previous, personality) : personality);
  }

  const personalities = [];
  for (const personality of byId.values()) {
    const deletedAt = Number(deleted[personality.id]) || 0;
    if (deletedAt > 0 && deletedAt >= customPersonalityUpdatedAtMs(personality)) continue;
    if (deletedAt) delete deleted[personality.id];
    personalities.push(personality);
  }
  return {
    personalities: normalizeCustomPersonalities(personalities),
    tombstones: normalizeCustomPersonalityTombstones(deleted),
  };
}
