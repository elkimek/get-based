// Private native selection leases. No persona prompt or thread index enters tools.
import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { isActiveProfileDataOwner } from './profile.js';
import { isChatRuntimeStreaming, notifyChatSavedRuntime } from './chat-runtime.js';
import { prepareEncryptedLocalStorageValue } from './crypto.js';
import { readCustomPersonalityDirectory } from './chat-personality-storage.js';
import type { PersonaEditorLocation } from './chat-personality-policy.js';
import { withChatThreadIndexLock, readChatThreadIndexForCommand, ownsNativeChatThreadIndex, noteChatThreadIndexPublication, nextPersonaMetadataStamp } from './chat-thread-index-storage.js';
import type { PersonaSelectionMetadata } from '../shared/persona-control-contract.js';
export type { PersonaSelectionMetadata } from '../shared/persona-control-contract.js';

export class PersonaSelectionConflict extends Error { readonly noChangeApplied = true; }
const fields = ['personality', 'personalityName', 'personalityIcon', 'personalityUpdatedAt'] as const;
type Metadata = Partial<Record<typeof fields[number], string>>;
interface Owner { profile: string; thread: string; root: typeof state.importedData; history: typeof state.chatHistory; threads: typeof state.chatThreads }
interface Lease extends Owner {
  before: PersonaSelectionMetadata; proposed: PersonaSelectionMetadata; baselineDefinition: PersonaSelectionMetadata | null;
  initialId: string; initialRevision: string | undefined; preference: string | null; directoryCurrent: () => boolean; used: boolean;
  executionAuthorized?: (() => boolean) | undefined;
  restore?: { fields: Metadata; preference: string | null; forward: string };
}
interface Effect extends Owner { previous: Metadata; before: PersonaSelectionMetadata; after: Metadata; preferenceBefore: string | null; preferenceAfter: string | null; directoryCurrent: () => boolean }
interface MetadataLease extends Owner { personaId: string; signature: string; preference: string | null; protectionCurrent: () => boolean }
const leases = new Map<string, Lease>(), effects = new Map<string, Effect>();
const metadataLeases = new Map<string, MetadataLease>();
function keep<T>(map: Map<string, T>, id: string, value: T) { if (map.size >= 100 && !map.has(id)) map.delete(map.keys().next().value!); map.set(id, value); }
const preferenceKey = (profile: string) => `labcharts-${profile}-chatPersonality`;
const owned = (owner: Owner) => state.currentProfile === owner.profile && state.currentThreadId === owner.thread && state.importedData === owner.root
  && state.chatHistory === owner.history && state.chatThreads === owner.threads && isActiveProfileDataOwner(owner.profile, owner.root);
function purgeRetiredOwners() {
  for (const [id, lease] of leases) if (!owned(lease)) leases.delete(id);
  for (const [id, effect] of effects) if (!owned(effect)) effects.delete(id);
  for (const [id, lease] of metadataLeases) if (!owned(lease)) metadataLeases.delete(id);
}
function metadata(record: Record<string, unknown>): Metadata {
  const result: Metadata = {};
  for (const field of fields) if (Object.hasOwn(record, field)) {
    if (typeof record[field] !== 'string') throw new PersonaSelectionConflict('The saved persona selection needs native review.');
    result[field] = record[field];
  }
  return result;
}
const selectionId = (record: Record<string, unknown>) => typeof record.personality === 'string' && record.personality || 'default';
function memoryTarget(owner: Owner) { return owner.threads.find(row => row.id === owner.thread); }
function leaseCurrent(lease: Lease) {
  const target = memoryTarget(lease);
  return owned(lease) && !!target && ownsNativeChatThreadIndex(lease.profile, lease.threads)
    && state.currentChatPersonality === lease.initialId && selectionId(target) === lease.initialId
    && target.personalityUpdatedAt === lease.initialRevision && localStorage.getItem(preferenceKey(lease.profile)) === lease.preference
    && lease.directoryCurrent() && (!lease.restore || isPersonaSelectionEffectCurrent(lease.restore.forward));
}
export async function capturePersonaSelection(id: string, options: { locationLike?: PersonaEditorLocation | null | undefined; executionAuthorized?: (() => boolean) | undefined } = {}) {
  purgeRetiredOwners();
  const owner: Owner = { profile: state.currentProfile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory, threads: state.chatThreads };
  if (!owner.thread || !owned(owner)) throw new PersonaSelectionConflict('The originating persona conversation changed.');
  const directory = await readCustomPersonalityDirectory(owner.profile, options.locationLike);
  const choices = [...CHAT_PERSONALITIES.map(({ id, name, icon }) => ({ id, name, icon, usable: true })), ...directory.rows];
  const target = choices.find(row => row.id === id);
  if (!target || !target.usable) throw new PersonaSelectionConflict('Choose an exact available persona. Any required agreement must be accepted in the native editor.');
  return withChatThreadIndexLock(owner.profile, async () => {
    if (!owned(owner) || !ownsNativeChatThreadIndex(owner.profile, owner.threads) || !directory.isCurrent()) throw new PersonaSelectionConflict('Reload the originating conversation before changing its persona.');
    const stored = await readChatThreadIndexForCommand(owner.profile), thread = stored.records.find(row => row.id === owner.thread), memory = memoryTarget(owner);
    const initialId = state.currentChatPersonality;
    if (!stored.isCurrent() || !owned(owner) || !thread || !memory || selectionId(thread) !== initialId || selectionId(memory) !== initialId
      || thread.personalityUpdatedAt !== memory.personalityUpdatedAt || !directory.isCurrent()) throw new PersonaSelectionConflict('The saved conversation selection changed. Read it again.');
    metadata(thread); metadata(memory);
    const baseline = choices.find(row => row.id === initialId), before = baseline ? { id: baseline.id, name: baseline.name, icon: baseline.icon } : { id: initialId, name: 'Unavailable persona', icon: '' };
    const proposed = { id: target.id, name: target.name, icon: target.icon }, leaseId = crypto.randomUUID();
    keep(leases, leaseId, { ...owner, before, proposed, baselineDefinition: baseline?.usable ? before : null, initialId,
      initialRevision: memory.personalityUpdatedAt as string | undefined, preference: localStorage.getItem(preferenceKey(owner.profile)), directoryCurrent: directory.isCurrent, used: false, executionAuthorized: options.executionAuthorized });
    return { leaseId, before, proposed };
  }, true);
}
export function isPersonaSelectionEffectCurrent(id: string) {
  try {
    const effect = effects.get(id), target = effect && memoryTarget(effect);
    return !!effect && !!target && owned(effect) && ownsNativeChatThreadIndex(effect.profile, effect.threads) && effect.directoryCurrent()
      && state.currentChatPersonality === effect.after.personality && localStorage.getItem(preferenceKey(effect.profile)) === effect.preferenceAfter
      && JSON.stringify(metadata(target)) === JSON.stringify(effect.after);
  } catch { return false; }
}
export function listPersonaSelectionUndoChoices() {
  purgeRetiredOwners();
  return [...effects].filter(([id]) => isPersonaSelectionEffectCurrent(id)).map(([id, effect]) => ({ id, persona: effect.before }));
}
export function previewPersonaSelection(id: string) {
  const lease = leases.get(id);
  if (!lease || lease.used || !leaseCurrent(lease)) throw new PersonaSelectionConflict('This persona selection expired. Read it again.');
  return { before: lease.before, proposed: lease.proposed };
}
export async function capturePersonaRestoration(id: string, options: { executionAuthorized?: (() => boolean) | undefined } = {}) {
  const effect = effects.get(id);
  if (!effect || !isPersonaSelectionEffectCurrent(id)) throw new PersonaSelectionConflict('This persona Undo expired. Read a fresh persona directory.');
  const captured = await capturePersonaSelection(effect.before.id, options);
  if (!isPersonaSelectionEffectCurrent(id)) { leases.delete(captured.leaseId); throw new PersonaSelectionConflict('The persona changed while preparing Undo.'); }
  leases.get(captured.leaseId)!.restore = { fields: effect.previous, preference: effect.preferenceBefore, forward: id };
  return captured;
}
export async function commitPersonaSelection(id: string, options: { canCommit: () => boolean }) {
  const lease = leases.get(id);
  if (!lease || lease.used) throw new PersonaSelectionConflict('This persona selection expired. Read it again.');
  lease.used = true;
  return withChatThreadIndexLock(lease.profile, async () => {
    const ready = () => { try { return options.canCommit() && lease.executionAuthorized?.() !== false && !isChatRuntimeStreaming() && leaseCurrent(lease); } catch { return false; } };
    if (!ready()) throw new PersonaSelectionConflict('Finish the current reply and read a fresh persona selection. Nothing was changed.');
    const stored = await readChatThreadIndexForCommand(lease.profile), target = stored.records.find(row => row.id === lease.thread), memory = memoryTarget(lease);
    if (!target || !memory || selectionId(target) !== lease.initialId || target.personalityUpdatedAt !== lease.initialRevision || !ready()) throw new PersonaSelectionConflict('The saved conversation selection changed. Nothing was replaced.');
    const previous = metadata(target), desiredPreference = lease.restore ? lease.restore.preference : lease.proposed.id;
    if (!lease.restore && lease.initialId === lease.proposed.id && lease.preference === desiredPreference && target.personalityName === lease.proposed.name && target.personalityIcon === lease.proposed.icon) return { before: lease.before, after: lease.proposed, settingsSaved: false, refreshed: true, undoId: null };
    const memoryClock = memory.updatedAt;
    const stamp = nextPersonaMetadataStamp(target, memory);
    const after: Metadata = { ...(lease.restore?.fields || { personality: lease.proposed.id, personalityName: lease.proposed.name, personalityIcon: lease.proposed.icon }), personalityUpdatedAt: stamp };
    const next: Record<string, unknown> = { ...target, updatedAt: stamp };
    for (const field of fields) { if (Object.hasOwn(after, field)) next[field] = after[field]; else delete next[field]; }
    const text = JSON.stringify(stored.records.map(row => row === target ? next : row)), prepared = await prepareEncryptedLocalStorageValue(stored.key, text);
    if (!ready() || !stored.isCurrent() || !prepared.isCurrent() || memory.updatedAt !== memoryClock) throw new PersonaSelectionConflict('The persona or conversation changed before saving. Nothing was written.');
    const prefKey = preferenceKey(lease.profile);
    try {
      localStorage.setItem(stored.key, prepared.value);
      if (!prepared.isCurrent() || localStorage.getItem(stored.key) !== prepared.value || localStorage.getItem(prefKey) !== lease.preference) throw new Error('The persona index publication was not confirmed.');
      if (desiredPreference === null) localStorage.removeItem(prefKey); else localStorage.setItem(prefKey, desiredPreference);
      if (localStorage.getItem(prefKey) !== desiredPreference || localStorage.getItem(stored.key) !== prepared.value) throw new Error('The persona preference was not confirmed.');
    } catch (cause) {
      try {
        const raw = localStorage.getItem(stored.key), pref = localStorage.getItem(prefKey);
        if (raw !== stored.raw && raw !== prepared.value || pref !== lease.preference && pref !== desiredPreference) throw new Error('A newer owner replaced the persona selection.');
        if (raw !== stored.raw) { if (stored.raw === null) localStorage.removeItem(stored.key); else localStorage.setItem(stored.key, stored.raw); }
        if (pref !== lease.preference) { if (lease.preference === null) localStorage.removeItem(prefKey); else localStorage.setItem(prefKey, lease.preference); }
        if (localStorage.getItem(stored.key) !== stored.raw || localStorage.getItem(prefKey) !== lease.preference) throw new Error('Persona compensation was not confirmed.');
      } catch { throw new Error('The persona selection outcome is unconfirmed. Reopen the native chat before changing it again.', { cause }); }
      throw new PersonaSelectionConflict('The persona selection could not be saved. Its exact previous stored state was retained.');
    }
    let refreshed = false;
    try {
      for (const field of fields) { const value = after[field]; if (value !== undefined) memory[field] = value; else delete memory[field]; }
      memory.updatedAt = stamp; state.currentChatPersonality = lease.proposed.id; refreshed = true;
    } catch { /* Stored metadata is authoritative; a retired/frozen view must reload. */ }
    noteChatThreadIndexPublication(lease.profile, prepared.value, refreshed ? lease.threads : undefined);
    let undoId: string | null = null;
    if (refreshed && !lease.restore && lease.initialId !== lease.proposed.id && lease.baselineDefinition) {
      keep(effects, id, { ...lease, previous, before: lease.baselineDefinition, after, preferenceBefore: lease.preference, preferenceAfter: desiredPreference, directoryCurrent: lease.directoryCurrent }); undoId = id;
    }
    try { notifyChatSavedRuntime(lease.profile); } catch { /* A sync notification cannot negate a verified selection. */ }
    return { before: lease.before, after: lease.proposed, settingsSaved: true, refreshed, undoId };
  }, true);
}

/** Capture the selected conversation before saving a custom definition. No prompt enters this owner. */
export async function capturePersonaMetadataRefresh(personaId: string) {
  purgeRetiredOwners();
  const owner: Owner = { profile: state.currentProfile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory, threads: state.chatThreads };
  return withChatThreadIndexLock(owner.profile, async () => {
    if (!owner.thread || !owned(owner) || !ownsNativeChatThreadIndex(owner.profile, owner.threads) || state.currentChatPersonality !== personaId) throw new PersonaSelectionConflict('The selected persona conversation changed before its metadata review.');
    const protection = await prepareEncryptedLocalStorageValue(`labcharts-${owner.profile}-chat-threads`, '');
    const stored = await readChatThreadIndexForCommand(owner.profile), target = stored.records.find(row => row.id === owner.thread), memory = memoryTarget(owner);
    if (!stored.isCurrent() || !protection.isCurrent() || !owned(owner) || !ownsNativeChatThreadIndex(owner.profile, owner.threads) || state.currentChatPersonality !== personaId || !target || !memory || selectionId(target) !== personaId || selectionId(memory) !== personaId || JSON.stringify(metadata(target)) !== JSON.stringify(metadata(memory))) throw new PersonaSelectionConflict('The saved persona metadata changed before its review.');
    const leaseId = crypto.randomUUID();
    keep(metadataLeases, leaseId, { ...owner, personaId, signature: JSON.stringify(metadata(target)), preference: localStorage.getItem(preferenceKey(owner.profile)), protectionCurrent: protection.isCurrent });
    return { leaseId };
  }, true);
}
export function releasePersonaMetadataRefresh(id: string) { metadataLeases.delete(id); }
/** Only the native verified definition receipt can authorize these name/icon fields. Preferences and message bodies are never written. */
export async function commitPersonaMetadataRefresh(id: string, definition: PersonaSelectionMetadata & { isCurrent: () => boolean }, options: { canCommit: () => boolean }) {
  const lease = metadataLeases.get(id); metadataLeases.delete(id);
  if (!lease || definition.id !== lease.personaId) throw new PersonaSelectionConflict('This persona metadata review expired.');
  return withChatThreadIndexLock(lease.profile, async () => {
    const current = () => { try {
      const memory = memoryTarget(lease);
      return options.canCommit() && owned(lease) && !isChatRuntimeStreaming() && definition.isCurrent() && lease.protectionCurrent()
        && state.currentChatPersonality === lease.personaId && localStorage.getItem(preferenceKey(lease.profile)) === lease.preference
        && !!memory && JSON.stringify(metadata(memory)) === lease.signature;
    } catch { return false; } };
    if (!current() || !ownsNativeChatThreadIndex(lease.profile, lease.threads)) throw new PersonaSelectionConflict('The persona definition or originating conversation changed. Its metadata was not replaced.');
    const stored = await readChatThreadIndexForCommand(lease.profile), target = stored.records.find(row => row.id === lease.thread), memory = memoryTarget(lease);
    if (!target || !memory || !current() || JSON.stringify(metadata(target)) !== lease.signature) throw new PersonaSelectionConflict('The saved persona metadata changed. Nothing was replaced.');
    if (target.personalityName === definition.name && target.personalityIcon === definition.icon) return { metadataSaved: false, refreshed: true };
    const memoryClock = memory.updatedAt, stamp = nextPersonaMetadataStamp(target, memory);
    const next = { ...target, personalityName: definition.name, personalityIcon: definition.icon, personalityUpdatedAt: stamp, updatedAt: stamp };
    const prepared = await prepareEncryptedLocalStorageValue(stored.key, JSON.stringify(stored.records.map(row => row === target ? next : row)));
    if (!current() || !stored.isCurrent() || !prepared.isCurrent() || memory.updatedAt !== memoryClock) throw new PersonaSelectionConflict('The persona metadata changed before saving. Nothing was written.');
    try {
      localStorage.setItem(stored.key, prepared.value);
      if (localStorage.getItem(stored.key) !== prepared.value || !prepared.isCurrent() || !current()) throw new Error('Persona metadata publication was not confirmed.');
    } catch (cause) {
      try {
        const raw = localStorage.getItem(stored.key);
        if (raw !== stored.raw && raw !== prepared.value) throw new Error('Newer conversation index');
        if (raw !== stored.raw) { if (stored.raw === null) localStorage.removeItem(stored.key); else localStorage.setItem(stored.key, stored.raw); }
        if (localStorage.getItem(stored.key) !== stored.raw) throw new Error('Unconfirmed metadata compensation');
      } catch { throw new Error('The persona metadata outcome is unconfirmed. Reopen the conversation before changing it again.', { cause }); }
      throw new PersonaSelectionConflict('Persona metadata was not saved. Its prior index was retained.');
    }
    let refreshed = false;
    try { memory.personalityName = definition.name; memory.personalityIcon = definition.icon; memory.personalityUpdatedAt = stamp; memory.updatedAt = stamp; refreshed = true; } catch { /* Saved metadata remains authoritative for a frozen view. */ }
    noteChatThreadIndexPublication(lease.profile, prepared.value, refreshed ? lease.threads : undefined);
    return { metadataSaved: true, refreshed };
  }, true);
}
