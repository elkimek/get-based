export interface CustomPersonality extends Record<string, unknown> { id: string; updatedAt?: unknown; createdAt?: unknown }

// chat-personality-merge.ts — deterministic per-persona sync conflict handling.

import {
  normalizeCustomPersonalities,
  normalizeCustomPersonalityTombstones,
} from './chat-storage-safety.js';

export function customPersonalityUpdatedAtMs(personality: CustomPersonality | null | undefined) {
  const parsed = Date.parse(String(personality?.updatedAt || personality?.createdAt || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Validate identities and bounds without projecting away opaque native fields. */
function replicaCatalog(value: unknown): CustomPersonality[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) throw new Error('The persona collection needs native review.');
  const ids = new Set<string>();
  return value.map(record => {
    const normalized = normalizeCustomPersonalities([record])[0];
    if (!record || typeof record !== 'object' || Array.isArray(record) || !normalized || record.id !== normalized.id || ids.has(normalized.id)) throw new Error('The persona collection needs native review.');
    ids.add(normalized.id);
    return { ...record } as CustomPersonality;
  });
}
function replicaTombstones(value: unknown): Record<string, number> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('The persona deletion history needs native review.');
  const normalized = normalizeCustomPersonalityTombstones(value);
  if (Object.keys(value).length !== Object.keys(normalized).length || Object.entries(value).some(([id, timestamp]) => normalized[id] !== timestamp)) throw new Error('The persona deletion history needs native review.');
  return normalized;
}
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
const knownPersonaFields = new Set(['id', 'name', 'icon', 'promptText', 'evidenceBased', 'createdAt', 'updatedAt', 'personaAgreement']);
function pickNewerPersona(left: CustomPersonality, right: CustomPersonality) {
  const leftTs = customPersonalityUpdatedAtMs(left);
  const rightTs = customPersonalityUpdatedAtMs(right);
  const rightWins = rightTs !== leftTs ? rightTs > leftTs : stableJson(right) > stableJson(left);
  const winner = rightWins ? right : left, previous = rightWins ? left : right;
  // An older replica may not understand an extension field. Its omission is
  // not an instruction to delete that field from the native record.
  const retained = Object.entries(previous).filter(([key]) => !knownPersonaFields.has(key) && !Object.hasOwn(winner, key));
  return retained.length ? { ...Object.fromEntries(retained), ...winner } : winner;
}

export function mergeCustomPersonalityState(
  localPersonalities: unknown,
  incomingPersonalities: unknown,
  localTombstones: unknown,
  incomingTombstones: unknown,
  options: { normalizeIncoming?: boolean } = {},
) {
  const local = replicaCatalog(localPersonalities);
  const incoming = replicaCatalog(incomingPersonalities).map(record => options.normalizeIncoming
    ? { ...record, ...normalizeCustomPersonalities([record])[0]! } : record);
  const deleted = replicaTombstones(localTombstones);
  for (const [id, deletedAt] of Object.entries(replicaTombstones(incomingTombstones))) {
    deleted[id] = Math.max(Number(deleted[id]) || 0, deletedAt);
  }

  const byId = new Map(local.map(personality => [personality.id, personality]));
  for (const personality of incoming) {
    const previous = byId.get(personality.id);
    byId.set(personality.id, previous ? pickNewerPersona(previous, personality) : personality);
  }

  const personalities: CustomPersonality[] = [];
  for (const personality of byId.values()) {
    const deletedAt = Number(deleted[personality.id]) || 0;
    if (deletedAt > 0 && deletedAt >= customPersonalityUpdatedAtMs(personality)) continue;
    if (deletedAt) delete deleted[personality.id];
    personalities.push(personality);
  }
  return {
    personalities: replicaCatalog(personalities),
    tombstones: replicaTombstones(deleted),
  };
}
