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
  prepareEncryptedLocalStorageValue,
  isEncryptedValue,
} from './crypto.js';
import { state } from './state.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
import { commitPersonaStoragePair, recoverPersonaStorageUnlocked, personaJournalFence, PersonaTransactionError } from './persona-storage-transaction.js';
import { createUniqueId } from './unique-id.js';
import { isCustomPersonalityUsable, type PersonaEditorLocation } from './chat-personality-policy.js';
import { mergeCustomPersonalityState } from './chat-personality-merge.js';

interface PersonalityCacheEntry {
  personalities: StoredCustomPersonality[];
  rawStored: string | null;
  pending: boolean;
}
const customPersonalityCache = new Map<string, PersonalityCacheEntry>();
const personalityWrites = new Map<string, Promise<StoredCustomPersonality[]>>();
const committedPersonalityCache = new Map<string, PersonalityCacheEntry>();
const storageCommands = new Map<string, Promise<unknown>>();

function withPersonalityStorage<T>(profileId: string, command: () => Promise<T>, requireLocks = false): Promise<T> {
  const previous = storageCommands.get(profileId);
  const execute = async () => { await recoverPersonaStorageUnlocked(profileId); return command(); };
  const run = async () => {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (locks?.request) return runNativeCommandWithLocks(locks, [`getbased-personas-${profileId}`], execute);
    if (requireLocks) throw new Error('Safe persona changes need Web Locks. Open the native persona editor.');
    return execute();
  };
  const pending = (previous || Promise.resolve()).catch(() => {}).then(run);
  storageCommands.set(profileId, pending);
  return pending.finally(() => { if (storageCommands.get(profileId) === pending) storageCommands.delete(profileId); });
}


export function customPersonalityStorageKey(profileId: string) {
  return `labcharts-${profileId}-chatPersonalityCustom`;
}

export function customPersonalityTombstoneStorageKey(profileId: string) {
  return `labcharts-${profileId}-chatPersonalityDeleted`;
}

export async function loadCustomPersonalityTombstones(profileId = state.currentProfile): Promise<Record<string, number>> {
  if (!profileId) return {};
  return withPersonalityStorage(profileId, async () => strictTombstones(await encryptedGetItem(customPersonalityTombstoneStorageKey(profileId), { throwOnDecryptError: true })));
}

export async function saveCustomPersonalityTombstones(tombstones: unknown, profileId = state.currentProfile) {
  if (!profileId) throw new Error('A profile is required to save custom personality deletions.');
  const normalized = normalizeCustomPersonalityTombstones(tombstones);
  await withPersonalityStorage(profileId, async () => {
    const key = customPersonalityTombstoneStorageKey(profileId);
    if (Object.keys(normalized).length > 0) await encryptedSetItem(key, JSON.stringify(normalized));
    else await encryptedRemoveItem(key);
  });
  return normalized;
}

export async function recordCustomPersonalityDeletion(id: string, profileId = state.currentProfile, deletedAt = Date.now()) {
  if (!profileId || !Number.isFinite(deletedAt) || deletedAt <= 0 || !Object.hasOwn(normalizeCustomPersonalityTombstones({ [id]: deletedAt }), id)) throw new Error('Invalid custom personality deletion.');
  return withPersonalityStorage(profileId, async () => {
    const key = customPersonalityTombstoneStorageKey(profileId);
    const text = await encryptedGetItem(key, { throwOnDecryptError: true });
    const tombstones = strictTombstones(text);
    tombstones[id] = Math.max(tombstones[id] || 0, deletedAt);
    if (Object.keys(tombstones).length > 200) throw new Error('The persona deletion history needs native review.');
    await encryptedSetItem(key, JSON.stringify(tombstones));
    return tombstones;
  });
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
  if (localStorage.getItem(personaJournalFence(profileId)) !== null) return cached ? clonePersonalities(cached.personalities) : [];
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
  return withPersonalityStorage(profileId, async () => {
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
  });
}

export async function saveCustomPersonalitiesToStorage(personalities: unknown, profileId = state.currentProfile) {
  if (!profileId) throw new Error('A profile is required to save custom personalities.');
  const key = customPersonalityStorageKey(profileId);
  const normalized = normalizeCustomPersonalities(personalities);
  const acceptedTombstones = localStorage.getItem(customPersonalityTombstoneStorageKey(profileId));
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
  const write = withPersonalityStorage(profileId, async () => {
    try {
      if (localStorage.getItem(customPersonalityTombstoneStorageKey(profileId)) !== acceptedTombstones) throw new Error('Persona deletions changed before this save. Reopen the editor.');
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

function strictTombstones(text: string | null): Record<string, number> {
  if (text === null) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The persona deletion history could not be read.');
  const normalized = normalizeCustomPersonalityTombstones(parsed);
  if (Object.keys(parsed).length !== Object.keys(normalized).length || Object.entries(parsed).some(([id, value]) => normalized[id] !== value)) throw new Error('The persona deletion history needs native review.');
  return normalized;
}

interface PersonaDeletionLease {
  profileId: string; threadId: typeof state.currentThreadId; root: typeof state.importedData; history: typeof state.chatHistory;
  id: string; rawCatalog: string | null; rawDeleted: string | null; catalog: Record<string, unknown>[]; deleted: Record<string, number>;
  protectionCurrent: () => boolean;
}
const deletionLeases = new Map<string, PersonaDeletionLease>();
export class PersonaStorageConflict extends Error {
  readonly persistenceUncertain: boolean;
  constructor(message: string, persistenceUncertain = false) { super(message); this.persistenceUncertain = persistenceUncertain; }
}
function ownsDeletion(lease: PersonaDeletionLease) {
  return state.currentProfile === lease.profileId && state.currentThreadId === lease.threadId && state.importedData === lease.root && state.chatHistory === lease.history;
}
function deletionBytesCurrent(lease: PersonaDeletionLease) {
  return localStorage.getItem(customPersonalityStorageKey(lease.profileId)) === lease.rawCatalog
    && localStorage.getItem(customPersonalityTombstoneStorageKey(lease.profileId)) === lease.rawDeleted;
}

/** Private native lease: decrypted persona text never becomes tool discovery metadata. */
export async function captureCustomPersonalityDeletion(id: string, profileId = state.currentProfile) {
  if (!profileId || profileId !== state.currentProfile) throw new PersonaStorageConflict('The originating persona profile changed.');
  const origin = { profileId, threadId: state.currentThreadId, root: state.importedData, history: state.chatHistory };
  return withPersonalityStorage(profileId, async () => {
    const protection = await prepareEncryptedLocalStorageValue(customPersonalityStorageKey(profileId), '');
    const rawCatalog = localStorage.getItem(customPersonalityStorageKey(profileId)), rawDeleted = localStorage.getItem(customPersonalityTombstoneStorageKey(profileId));
    const [catalogText, deletedText] = await Promise.all([
      encryptedGetItem(customPersonalityStorageKey(profileId), { throwOnDecryptError: true }),
      encryptedGetItem(customPersonalityTombstoneStorageKey(profileId), { throwOnDecryptError: true }),
    ]);
    const catalog = parseEditableCatalog(catalogText);
    const normalized = normalizeCustomPersonalities(catalog);
    const selected = normalized.find(entry => entry.id === id);
    if (!selected) throw new PersonaStorageConflict('This personality is no longer available.');
    const lease: PersonaDeletionLease = { ...origin, id, rawCatalog, rawDeleted, catalog, deleted: strictTombstones(deletedText), protectionCurrent: protection.isCurrent };
    if (!protection.isCurrent() || !ownsDeletion(lease) || !deletionBytesCurrent(lease) || customPersonalityCache.get(profileId)?.pending) throw new PersonaStorageConflict('Personas changed while preparing the deletion. Read them again.');
    const leaseId = crypto.randomUUID();
    if (deletionLeases.size >= 50) deletionLeases.delete(deletionLeases.keys().next().value!);
    deletionLeases.set(leaseId, lease);
    return { leaseId, id, name: selected.name };
  });
}

export function releaseCustomPersonalityDeletion(leaseId: string) { deletionLeases.delete(leaseId); }
/** Call only after native confirmation; both encrypted keys share one serialized owner. */
export async function commitCustomPersonalityDeletion(leaseId: string, options: { canCommit: () => boolean; requireLocks?: boolean }) {
  const lease = deletionLeases.get(leaseId); deletionLeases.delete(leaseId);
  if (!lease) throw new PersonaStorageConflict('This persona deletion expired. Request a fresh review.');
  return withPersonalityStorage(lease.profileId, async () => {
    const allowed = () => { try { return lease.protectionCurrent() && ownsDeletion(lease) && options.canCommit(); } catch { return false; } };
    if (!allowed() || !deletionBytesCurrent(lease) || customPersonalityCache.get(lease.profileId)?.pending) throw new PersonaStorageConflict('Personas or their originating view changed. Nothing was deleted.');
    const nextCatalog = lease.catalog.filter(entry => entry.id !== lease.id);
    const selected = lease.catalog.find(entry => entry.id === lease.id)!;
    const updatedAt = Date.parse(String(selected.updatedAt || selected.createdAt || '')) || 0;
    const nextDeleted = { ...lease.deleted, [lease.id]: Math.max(lease.deleted[lease.id] || 0, Date.now(), updatedAt) };
    if (Object.keys(nextDeleted).length > 200) throw new PersonaStorageConflict('The persona deletion history needs native review.');
    const writes = [
      { key: customPersonalityStorageKey(lease.profileId), before: lease.rawCatalog, text: JSON.stringify(nextCatalog) },
      { key: customPersonalityTombstoneStorageKey(lease.profileId), before: lease.rawDeleted, text: JSON.stringify(nextDeleted) },
    ];
    let recoveryPending = false;
    try {
      const prepared = await Promise.all(writes.map(async write => ({ ...write, prepared: await prepareEncryptedLocalStorageValue(write.key, write.text) })));
      const result = await commitPersonaStoragePair(lease.profileId, prepared.map(write => ({ key: write.key, before: write.before, after: write.prepared.value })), {
        canCommit: () => allowed() && !customPersonalityCache.get(lease.profileId)?.pending,
        protectionCurrent: () => prepared.every(write => write.prepared.isCurrent()),
        verify: async () => { for (const write of writes) if (await encryptedGetItem(write.key, { throwOnDecryptError: true }) !== write.text) throw new Error('Persona storage could not be verified.'); },
      });
      recoveryPending = result.recoveryPending;
    } catch (error) {
      const restored = deletionBytesCurrent(lease);
      if (!customPersonalityCache.get(lease.profileId)?.pending) {
        if (restored) customPersonalityCache.set(lease.profileId, { personalities: normalizeCustomPersonalities(lease.catalog), rawStored: lease.rawCatalog, pending: false });
        else customPersonalityCache.delete(lease.profileId);
      }
      throw new PersonaStorageConflict(error instanceof PersonaTransactionError ? !error.persistenceUncertain && !restored ? 'Personas changed before the deletion was saved. Nothing was deleted by this request.' : error.message : restored ? 'Could not delete the personality. Its previous stored state was restored.' : 'The persona deletion outcome is unconfirmed. Check the native editor before retrying.', error instanceof PersonaTransactionError ? error.persistenceUncertain : !restored);
    }
    if (!customPersonalityCache.get(lease.profileId)?.pending) customPersonalityCache.set(lease.profileId, { personalities: normalizeCustomPersonalities(nextCatalog), rawStored: localStorage.getItem(writes[0]!.key), pending: false });
    return { deleted: true as const, profileId: lease.profileId, id: lease.id, recoveryPending };
  }, options.requireLocks ?? true);
}

interface PersonaEditOwner {
  profileId: string; threadId: typeof state.currentThreadId; root: typeof state.importedData; history: typeof state.chatHistory;
}
interface PersonaEditLease extends PersonaEditOwner { id: string; creating: boolean; fingerprint: string | null; deletedAt: number; protectionCurrent: () => boolean }
export interface NativePersonaEditFields {
  name: string; promptText: string; icon?: string; personaAgreement?: StoredCustomPersonality['personaAgreement'];
}
const editLeases = new Map<string, PersonaEditLease>();
export function releaseCustomPersonalityEdit(leaseId: string) { editLeases.delete(leaseId); }
const ownsEdit = (owner: PersonaEditOwner) => state.currentProfile === owner.profileId && state.currentThreadId === owner.threadId && state.importedData === owner.root && state.chatHistory === owner.history;
async function personaFingerprint(record: Record<string, unknown>) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(record)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function keepEditLease(value: PersonaEditLease): string {
  if (editLeases.size >= 100) editLeases.delete(editLeases.keys().next().value!);
  const leaseId = crypto.randomUUID(); editLeases.set(leaseId, value); return leaseId;
}
function parseEditableCatalog(text: string | null): Record<string, unknown>[] {
  if (text === null || text === '') return [];
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch {
    if (/^\s*[\[{]/.test(text)) throw new PersonaStorageConflict('The persona collection needs native review.');
    parsed = [{ id: 'custom_migrated', name: 'Custom Personality', icon: '✏️', promptText: text, evidenceBased: false }];
  }
  if (parsed === null || typeof parsed !== 'object') parsed = [{ id: 'custom_migrated', name: 'Custom Personality', icon: '✏️', promptText: text, evidenceBased: false }];
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'promptText' in parsed) parsed = [{ ...parsed, id: 'id' in parsed && parsed.id || 'custom_migrated' }];
  const normalized = normalizeCustomPersonalities(parsed);
  if (!Array.isArray(parsed) || parsed.length > 50 || normalized.length !== parsed.length || parsed.some((record, index) => !record || typeof record !== 'object' || record.id !== normalized[index]?.id)) throw new PersonaStorageConflict('The persona collection needs native review.');
  return parsed as Record<string, unknown>[];
}
async function readEditablePersonaState(profileId: string) {
  const key = customPersonalityStorageKey(profileId), deletedKey = customPersonalityTombstoneStorageKey(profileId);
  const raw = localStorage.getItem(key), rawDeleted = localStorage.getItem(deletedKey);
  const [text, deletedText] = await Promise.all([encryptedGetItem(key, { throwOnDecryptError: true }), encryptedGetItem(deletedKey, { throwOnDecryptError: true })]);
  if (localStorage.getItem(key) !== raw || localStorage.getItem(deletedKey) !== rawDeleted) throw new PersonaStorageConflict('Personas changed while being read. Reopen the editor.');
  return { key, deletedKey, raw, rawDeleted, catalog: parseEditableCatalog(text), deleted: strictTombstones(deletedText) };
}
/** Sync/import publish one recovered pair, merging against the latest locked native state. */
export async function mergeCustomPersonalitiesFromReplica(
  input: { customPersonalities?: unknown; customPersonalityDeleted?: unknown },
  profileId: string,
  mode: 'sync' | 'import' = 'sync',
) {
  if (!Object.hasOwn(input, 'customPersonalities') && !Object.hasOwn(input, 'customPersonalityDeleted')) return { changed: false, recoveryPending: false };
  const incoming = structuredClone(input);
  return withPersonalityStorage(profileId, async () => {
    const protection = await prepareEncryptedLocalStorageValue(customPersonalityStorageKey(profileId), '');
    for (let attempt = 0; ; attempt++) {
      const before = localStorage.getItem(customPersonalityStorageKey(profileId)), deletedBefore = localStorage.getItem(customPersonalityTombstoneStorageKey(profileId));
      try { return await publishReplicaPair(profileId, incoming, mode, protection.isCurrent); }
      catch (error) {
        // Cross-process localStorage delivery may follow the Web Lock handoff.
        // A portable import may re-evaluate only-if-unset once, only after a
        // proved no-own-write outcome and an observed newer pair. Quota errors,
        // uncertain recovery and protection changes never authorize a retry.
        if (mode === 'import' && attempt === 0 && (error instanceof PersonaTransactionError || error instanceof PersonaStorageConflict) && !error.persistenceUncertain
          && protection.isCurrent() && !customPersonalityCache.get(profileId)?.pending && localStorage.getItem(personaJournalFence(profileId)) === null
          && (localStorage.getItem(customPersonalityStorageKey(profileId)) !== before || localStorage.getItem(customPersonalityTombstoneStorageKey(profileId)) !== deletedBefore)) continue;
        throw error;
      }
    }
  }, true);
}
async function publishReplicaPair(profileId: string, incoming: { customPersonalities?: unknown; customPersonalityDeleted?: unknown }, mode: 'sync' | 'import', protectionCurrent: () => boolean) {
  const snapshot = await readEditablePersonaState(profileId);
  const current = () => protectionCurrent() && !customPersonalityCache.get(profileId)?.pending;
  if (!current()) throw new PersonaStorageConflict('Persona storage changed before merging. Retry after native storage is ready.');
  // Portable imports retain their only-if-unset policy. Test it here, under
  // the pair's lock, so an editor that saved during import always wins.
  const merged = mergeCustomPersonalityState(snapshot.catalog,
    mode === 'import' && snapshot.raw ? undefined : incoming.customPersonalities,
    snapshot.deleted, mode === 'import' && snapshot.rawDeleted ? undefined : incoming.customPersonalityDeleted, { normalizeIncoming: mode === 'import' });
  const catalogText = JSON.stringify(merged.personalities), deletedText = JSON.stringify(merged.tombstones);
  const catalogChanged = catalogText !== JSON.stringify(snapshot.catalog), deletedChanged = deletedText !== JSON.stringify(snapshot.deleted);
  if (!catalogChanged && !deletedChanged) return { changed: false, recoveryPending: false };
  const catalog = catalogChanged ? await prepareEncryptedLocalStorageValue(snapshot.key, catalogText) : null;
  const deleted = deletedChanged && Object.keys(merged.tombstones).length ? await prepareEncryptedLocalStorageValue(snapshot.deletedKey, deletedText) : null;
  let result: Awaited<ReturnType<typeof commitPersonaStoragePair>>;
  try {
    result = await commitPersonaStoragePair(profileId, [
      { key: snapshot.key, before: snapshot.raw, after: catalog ? catalog.value : snapshot.raw },
      { key: snapshot.deletedKey, before: snapshot.rawDeleted, after: deletedChanged ? deleted?.value ?? null : snapshot.rawDeleted },
    ], {
      canCommit: current,
      protectionCurrent: () => protectionCurrent() && (!catalog || catalog.isCurrent()) && (!deleted || deleted.isCurrent()),
      verify: async () => {
        if (catalogChanged && await encryptedGetItem(snapshot.key, { throwOnDecryptError: true }) !== catalogText
          || deletedChanged && await encryptedGetItem(snapshot.deletedKey, { throwOnDecryptError: true }) !== (deleted ? deletedText : null)) throw new Error('The merged persona state could not be verified.');
      },
    });
  } catch (error) {
    if (!customPersonalityCache.get(profileId)?.pending) customPersonalityCache.delete(profileId);
    throw error;
  }
  // A committed pair stays saved if an optional cache publication fails.
  try {
    if (!customPersonalityCache.get(profileId)?.pending) customPersonalityCache.set(profileId, { personalities: normalizeCustomPersonalities(merged.personalities), rawStored: localStorage.getItem(snapshot.key), pending: false });
  } catch { /* The next strict load rebuilds the cache. */ }
  return { changed: true, recoveryPending: result.recoveryPending };
}
/** Native metadata projection; prompt text and agreement records stay in this owner. */
export async function readCustomPersonalityDirectory(profileId = state.currentProfile, locationLike: PersonaEditorLocation | null | undefined = globalThis.location) {
  if (!profileId) throw new PersonaStorageConflict('Choose a profile before reading personas.');
  return withPersonalityStorage(profileId, async () => {
    const protection = await prepareEncryptedLocalStorageValue(customPersonalityStorageKey(profileId), '');
    const snapshot = await readEditablePersonaState(profileId);
    const isCurrent = () => localStorage.getItem(snapshot.key) === snapshot.raw
      && localStorage.getItem(snapshot.deletedKey) === snapshot.rawDeleted
      && localStorage.getItem(personaJournalFence(profileId)) === null
      && protection.isCurrent() && !customPersonalityCache.get(profileId)?.pending;
    if (!isCurrent()) throw new PersonaStorageConflict('Personas changed while reading their directory. Read it again.');
    const personalities = normalizeCustomPersonalities(snapshot.catalog).filter(personality => {
      const updated = Date.parse(personality.updatedAt || personality.createdAt || '') || 0;
      return !(snapshot.deleted[personality.id] && snapshot.deleted[personality.id]! >= updated);
    });
    const cached = { personalities, rawStored: snapshot.raw, pending: false };
    customPersonalityCache.set(profileId, cached); committedPersonalityCache.set(profileId, cached);
    return { rows: personalities.map(personality => ({ id: personality.id, name: personality.name, icon: personality.icon, usable: isCustomPersonalityUsable(personality, locationLike) })), isCurrent };
  }, true);
}
function activeEditTarget(record: Record<string, unknown> | undefined, deleted: Record<string, number>) {
  if (!record || typeof record.id !== 'string') throw new PersonaStorageConflict('This personality was removed. Copy your draft before creating a new personality.');
  const updated = Date.parse(String(record.updatedAt || record.createdAt || '')) || 0;
  if ((deleted[record.id] || 0) > 0 && deleted[record.id]! >= updated) throw new PersonaStorageConflict('This personality was deleted. Copy your draft before creating a new personality.');
  return record;
}
/** Capture the exact visible target, never the whole editable collection as a replacement. */
export async function captureCustomPersonalityEdit(id: string | null, profileId = state.currentProfile, visible?: Pick<StoredCustomPersonality, 'name' | 'promptText' | 'icon'>) {
  const owner: PersonaEditOwner = { profileId, threadId: state.currentThreadId, root: state.importedData, history: state.chatHistory };
  if (!profileId || !ownsEdit(owner)) throw new PersonaStorageConflict('The originating persona profile changed.');
  return withPersonalityStorage(profileId, async () => {
    try {
      const protection = await prepareEncryptedLocalStorageValue(customPersonalityStorageKey(profileId), '');
      const snapshot = await readEditablePersonaState(profileId);
      const target = id ? activeEditTarget(snapshot.catalog.find(record => record.id === id), snapshot.deleted) : null;
      if (target && (target.promptText != null && (typeof target.promptText !== 'string' || target.promptText.length > 50_000) || target.name != null && (typeof target.name !== 'string' || target.name.length > 60))) throw new PersonaStorageConflict('This personality needs native review before editing.');
      if (target && visible) {
        const normalized = normalizeCustomPersonalities([target])[0]!;
        if (normalized.name !== visible.name || normalized.promptText !== visible.promptText || normalized.icon !== visible.icon) throw new PersonaStorageConflict('This personality changed before the editor opened. Copy your draft and reopen it.');
      }
      const fingerprint = target ? await personaFingerprint(target) : null;
      if (!protection.isCurrent() || !ownsEdit(owner)) throw new PersonaStorageConflict('The originating persona editor or protection changed.');
      const targetId = id || createUniqueId('custom_');
      return { leaseId: keepEditLease({ ...owner, id: targetId, creating: !id, fingerprint, deletedAt: snapshot.deleted[targetId] || 0, protectionCurrent: protection.isCurrent }), id: targetId };
    } catch (error) {
      if (error instanceof PersonaStorageConflict) throw error;
      throw new PersonaStorageConflict('Custom personas could not be read safely. Unlock or review native storage before saving.');
    }
  });
}
/** Only the native Save owner supplies agreement metadata and current ownership. */
export async function commitCustomPersonalityEdit(leaseId: string, fields: NativePersonaEditFields, options: { canCommit: () => boolean }) {
  const lease = editLeases.get(leaseId); editLeases.delete(leaseId);
  if (!lease) throw new PersonaStorageConflict('This persona edit expired. Reopen the editor.');
  if (typeof fields.name !== 'string' || !fields.name || fields.name !== fields.name.trim() || fields.name.length > 60 || typeof fields.promptText !== 'string' || !fields.promptText || fields.promptText !== fields.promptText.trim() || fields.promptText.length > 50_000) throw new PersonaStorageConflict('Review the persona name and instructions before saving.');
  return withPersonalityStorage(lease.profileId, async () => {
    const current = () => { try { return lease.protectionCurrent() && ownsEdit(lease) && options.canCommit() && !customPersonalityCache.get(lease.profileId)?.pending; } catch { return false; } };
    if (!current()) throw new PersonaStorageConflict('The originating persona editor changed. Nothing was saved.');
    const snapshot = await readEditablePersonaState(lease.profileId);
    let target: Record<string, unknown> | null = null;
    if (lease.creating) {
      if (snapshot.catalog.length >= 50 || snapshot.catalog.some(record => record.id === lease.id) || snapshot.deleted[lease.id]) throw new PersonaStorageConflict('Create this personality from a fresh native editor.');
    } else {
      target = activeEditTarget(snapshot.catalog.find(record => record.id === lease.id), snapshot.deleted);
      if (await personaFingerprint(target) !== lease.fingerprint || (snapshot.deleted[lease.id] || 0) !== lease.deletedAt) throw new PersonaStorageConflict('This personality changed after the editor opened. Copy your draft and reopen it.');
    }
    const now = new Date(Math.max(Date.now(), (Date.parse(String(target?.updatedAt || target?.createdAt || '')) || 0) + 1)).toISOString();
    const next = { ...(target || {}), id: lease.id, name: fields.name, promptText: fields.promptText,
      icon: fields.icon ?? target?.icon ?? '✏️', ...(lease.creating ? { evidenceBased: false } : {}),
      ...(lease.creating ? { createdAt: now } : {}), updatedAt: now, ...(fields.personaAgreement ? { personaAgreement: fields.personaAgreement } : {}) };
    const normalized = normalizeCustomPersonalities([next])[0]!;
    if (fields.icon !== undefined && normalized.icon !== fields.icon || fields.personaAgreement && JSON.stringify(normalized.personaAgreement) !== JSON.stringify(fields.personaAgreement)) throw new PersonaStorageConflict('Review the native persona icon or agreement before saving.');
    const nextCatalog = lease.creating ? [...snapshot.catalog, next] : snapshot.catalog.map(record => record.id === lease.id ? next : record);
    const text = JSON.stringify(nextCatalog), prepared = await prepareEncryptedLocalStorageValue(snapshot.key, text), fingerprint = await personaFingerprint(next);
    let result: Awaited<ReturnType<typeof commitPersonaStoragePair>>;
    try {
      result = await commitPersonaStoragePair(lease.profileId, [{ key: snapshot.key, before: snapshot.raw, after: prepared.value }, { key: snapshot.deletedKey, before: snapshot.rawDeleted, after: snapshot.rawDeleted }], {
        canCommit: current, protectionCurrent: prepared.isCurrent,
        verify: async () => { if (await encryptedGetItem(snapshot.key, { throwOnDecryptError: true }) !== text) throw new Error('Persona save was not verified.'); },
      });
    } catch (error) {
      const restored = localStorage.getItem(snapshot.key) === snapshot.raw && localStorage.getItem(snapshot.deletedKey) === snapshot.rawDeleted;
      if (!customPersonalityCache.get(lease.profileId)?.pending) {
        if (restored) customPersonalityCache.set(lease.profileId, { personalities: normalizeCustomPersonalities(snapshot.catalog), rawStored: snapshot.raw, pending: false });
        else customPersonalityCache.delete(lease.profileId);
      }
      throw new PersonaStorageConflict(error instanceof PersonaTransactionError ? error.message : 'The persona save outcome is unconfirmed. Check native storage before retrying.', error instanceof PersonaTransactionError ? error.persistenceUncertain : !restored);
    }
    let nextLeaseId: string | null = null;
    try {
      if (!customPersonalityCache.get(lease.profileId)?.pending) customPersonalityCache.set(lease.profileId, { personalities: normalizeCustomPersonalities(nextCatalog), rawStored: prepared.value, pending: false });
      if (current()) nextLeaseId = keepEditLease({ ...lease, creating: false, fingerprint, deletedAt: snapshot.deleted[lease.id] || 0 });
    } catch { /* Optional cache/continuation publication cannot negate a verified durable save. */ }
    return { id: lease.id, profileId: lease.profileId, name: normalized.name, icon: normalized.icon, saved: true as const, leaseId: nextLeaseId, recoveryPending: result.recoveryPending,
      isCurrent: () => current() && prepared.isCurrent() && localStorage.getItem(snapshot.key) === prepared.value && localStorage.getItem(snapshot.deletedKey) === snapshot.rawDeleted && localStorage.getItem(personaJournalFence(lease.profileId)) === null };
  }, true);
}
