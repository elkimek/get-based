// Write-ahead recovery for the two existing persona localStorage records.
// The journal stays private in IndexedDB; it is never chat, sync or backup data.
import { getBlob, compareAndSwapBlob, getBlobKeys } from './blob-storage.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';

interface Protection {
  enabled: () => boolean;
  seal: (value: unknown) => Promise<unknown>;
  open: (value: unknown) => Promise<unknown>;
}
let protection: Protection | null = null;
export function configurePersonaJournalProtection(value: Protection) { protection = value; }
export const personaJournalKey = (profile: string) => `labcharts-${profile}-persona-transaction`;
export const personaJournalFence = (profile: string) => `labcharts-${profile}-persona-transaction-pending`;
const profilePattern = /^[A-Za-z0-9_-]{1,128}$/;
interface Change { key: string; before: string | null; after: string | null }
interface Journal { version: 1; profile: string; id: string; phase: 'prepared' | 'committed'; changes: Change[] }
export class PersonaTransactionError extends Error {
  readonly persistenceUncertain: boolean;
  constructor(message: string, uncertain = true) { super(message); this.persistenceUncertain = uncertain; }
}
function validate(value: unknown, profile: string): Journal {
  if (!profilePattern.test(profile) || !value || typeof value !== 'object') throw new PersonaTransactionError('The persona recovery record needs native review.');
  const record = value as Partial<Journal>, keys = [`labcharts-${profile}-chatPersonalityCustom`, `labcharts-${profile}-chatPersonalityDeleted`];
  if (record.version !== 1 || record.profile !== profile || typeof record.id !== 'string' || !/^[a-f0-9-]{36}$/.test(record.id)
    || !['prepared', 'committed'].includes(record.phase || '') || !Array.isArray(record.changes) || record.changes.length !== 2
    || record.changes.some((change, index) => !change || change.key !== keys[index] || !(change.before === null || typeof change.before === 'string') || !(change.after === null || typeof change.after === 'string'))) throw new PersonaTransactionError('The persona recovery record needs native review.');
  return record as Journal;
}
async function decode(stored: unknown, profile: string): Promise<Journal | null> {
  if (stored === null) return null;
  if (!stored || typeof stored !== 'object' || !('sealed' in stored) || !('payload' in stored) || typeof stored.sealed !== 'boolean') throw new PersonaTransactionError('The persona recovery envelope could not be read.');
  if (stored.sealed && !protection) throw new PersonaTransactionError('Unlock persona storage before recovery.');
  const value = stored.sealed ? await protection!.open(stored.payload) : stored.payload;
  return validate(value, profile);
}
async function read(profile: string) { return decode(await getBlob<unknown>(personaJournalKey(profile)), profile); }
async function persist(record: Journal, current: () => boolean, expected: unknown) {
  if (!protection) throw new PersonaTransactionError('Persona recovery storage is not ready.', false);
  const sealed = protection.enabled(), payload = sealed ? await protection.seal(record) : record;
  if (payload === null || !current()) throw new PersonaTransactionError('Persona storage protection changed before saving.', false);
  const stored = { sealed, payload };
  if (!await compareAndSwapBlob(personaJournalKey(record.profile), expected, stored)) throw new PersonaTransactionError('The persona recovery owner changed before saving.');
  const observed = await read(record.profile);
  if (JSON.stringify(observed) !== JSON.stringify(record)) throw new PersonaTransactionError('The persona recovery record could not be confirmed.');
  return stored;
}
async function clear(record: Journal) {
  const fence = personaJournalFence(record.profile), owner = localStorage.getItem(fence);
  if (owner !== null && owner !== record.id) throw new PersonaTransactionError('The persona recovery fence belongs to a newer change.');
  const raw = await getBlob<unknown>(personaJournalKey(record.profile));
  if (raw !== null && (JSON.stringify(await decode(raw, record.profile)) !== JSON.stringify(record) || !await compareAndSwapBlob(personaJournalKey(record.profile), raw, null))) throw new PersonaTransactionError('The persona recovery owner changed before cleanup.');
  if (await getBlob(personaJournalKey(record.profile)) !== null) throw new PersonaTransactionError('Persona recovery cleanup could not be confirmed.');
  if (localStorage.getItem(fence) === record.id) localStorage.removeItem(fence);
}
/** Caller holds the profile's native storage lock. No unproved data is restored. */
export async function recoverPersonaStorageUnlocked(profile: string, force = false) {
  if (!profilePattern.test(profile)) throw new PersonaTransactionError('Invalid persona recovery profile.');
  if (!force && localStorage.getItem(personaJournalFence(profile)) === null) return { recovered: false, committed: false };
  const record = await read(profile);
  if (!record) { localStorage.removeItem(personaJournalFence(profile)); return { recovered: false, committed: false }; }
  const fence = localStorage.getItem(personaJournalFence(profile));
  if (fence !== null && fence !== record.id) throw new PersonaTransactionError('The persona recovery owner and its fence differ. Nothing was overwritten.');
  if (record.phase === 'prepared') {
    if (record.changes.some(change => { const raw = localStorage.getItem(change.key); return raw !== change.before && raw !== change.after; })) throw new PersonaTransactionError('Persona recovery found a newer replacement. Nothing was overwritten.');
    for (const change of [...record.changes].reverse()) {
      const raw = localStorage.getItem(change.key);
      if (raw !== change.before) {
        if (raw !== change.after) throw new PersonaTransactionError('Persona recovery ownership changed.');
        if (change.before === null) localStorage.removeItem(change.key); else localStorage.setItem(change.key, change.before);
      }
      if (localStorage.getItem(change.key) !== change.before) throw new PersonaTransactionError('The interrupted persona change could not be restored.');
    }
  }
  await clear(record);
  return { recovered: true, committed: record.phase === 'committed' };
}
/** Recovery outside the storage owner uses the same cross-tab lock. */
export async function withCommittedPersonaStorage<T>(profile: string, readCurrent: (recovery: { recovered: boolean; committed: boolean }) => T | Promise<T>, force = false) {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks?.request) {
    if (localStorage.getItem(personaJournalFence(profile)) === null && !force) return readCurrent({ recovered: false, committed: false });
    throw new PersonaTransactionError('Persona recovery needs a browser with Web Locks.');
  }
  return runNativeCommandWithLocks(locks, [`getbased-personas-${profile}`], async () => readCurrent(await recoverPersonaStorageUnlocked(profile, force)));
}
export async function recoverPersonaStorage(profile: string, force = false) {
  return withCommittedPersonaStorage(profile, recovery => recovery, force);
}
export async function recoverAllPersonaStorage() {
  const profiles = new Set<string>();
  for (const key of await getBlobKeys()) {
    const match = /^labcharts-([A-Za-z0-9_-]{1,128})-persona-transaction$/.exec(key);
    if (match) profiles.add(match[1]!);
  }
  for (let index = 0; index < localStorage.length; index++) {
    const match = /^labcharts-([A-Za-z0-9_-]{1,128})-persona-transaction-pending$/.exec(localStorage.key(index) || '');
    if (match) profiles.add(match[1]!);
  }
  for (const profile of profiles) await recoverPersonaStorage(profile, true);
}

/** Caller holds the native lock; prepared ciphertext is known before any write. */
export async function commitPersonaStoragePair(profile: string, changes: Change[], options: { canCommit: () => boolean; protectionCurrent: () => boolean; verify: () => Promise<void> }) {
  const record = validate({ version: 1, profile, id: crypto.randomUUID(), phase: 'prepared', changes }, profile);
  const safe = () => { try { return options.canCommit() && options.protectionCurrent(); } catch { return false; } };
  const ownsFence = () => localStorage.getItem(personaJournalFence(profile)) === record.id;
  const beforeCurrent = () => changes.every(change => localStorage.getItem(change.key) === change.before);
  let started = false, committed = false;
  if (!safe() || !beforeCurrent()) throw new PersonaTransactionError('Personas changed before this operation. Nothing was written by it.', false);
  try {
    if (!safe() || !beforeCurrent()) throw new Error('Persona state changed before saving.');
    if (await getBlob(personaJournalKey(profile)) !== null) throw new Error('Finish persona recovery before another change.');
    localStorage.setItem(personaJournalFence(profile), record.id);
    if (localStorage.getItem(personaJournalFence(profile)) !== record.id) throw new Error('Persona recovery fence was not saved.');
    const preparedStored = await persist(record, () => safe() && ownsFence(), null);
    if (!safe() || !ownsFence() || !beforeCurrent()) throw new Error('Persona state changed before writing.');
    for (const change of changes) {
      if (!safe() || !ownsFence() || localStorage.getItem(change.key) !== change.before) throw new Error('Persona state changed during saving.');
      if (change.after === change.before) continue;
      started = true;
      if (change.after === null) localStorage.removeItem(change.key); else localStorage.setItem(change.key, change.after);
      if (localStorage.getItem(change.key) !== change.after) throw new Error('Persona storage was not confirmed.');
    }
    await options.verify();
    if (!options.protectionCurrent() || !ownsFence() || changes.some(change => localStorage.getItem(change.key) !== change.after)) throw new Error('Persona storage changed during verification.');
    await persist({ ...record, phase: 'committed' }, () => options.protectionCurrent() && ownsFence(), preparedStored);
    committed = true;
  } catch {
    try {
      const observed = await read(profile);
      if (observed && observed.id !== record.id) throw new Error('Another persona transaction owns recovery.');
      if (observed?.phase === 'committed' && JSON.stringify(observed.changes) === JSON.stringify(record.changes)) committed = true;
      else if (observed) {
        if (!started) {
          if (JSON.stringify(observed) !== JSON.stringify(record)) throw new Error('The prepared recovery owner changed.');
          // This live owner knows it has not touched either data key. A newer
          // value is retained; only this exact unused journal may be cleared.
          await clear(record);
        } else await recoverPersonaStorageUnlocked(profile);
      }
      else if (started && !beforeCurrent()) throw new Error('No recovery record proves the interrupted write.');
      else if (localStorage.getItem(personaJournalFence(profile)) === record.id) localStorage.removeItem(personaJournalFence(profile));
    } catch {
      throw new PersonaTransactionError('The persona change outcome is unconfirmed. Check the native editor before retrying.');
    }
    if (!committed) throw new PersonaTransactionError(!started ? 'Personas changed before data writes. Nothing was written by this operation.' : 'The persona change could not be saved. Its previous stored state was restored.', started && !beforeCurrent());
  }
  let recoveryPending = false;
  try { await clear({ ...record, phase: 'committed' }); } catch { recoveryPending = true; }
  return { committed: true as const, recoveryPending };
}
