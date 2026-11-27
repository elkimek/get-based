import { encryptDeviceCredential, decryptDeviceCredential } from './wearables-credential-vault.js';
import type { RawShareRecord, ShareRecord } from '../types/profile-share.js';

const LEGACY_INDEX = 'getbased-profile-shares-v1';
const PREFIX = LEGACY_INDEX + ':';
type ManagedShare = ShareRecord & { id: string; expiresAt: string };
let cache = new Map<string, ManagedShare>();
let work: Promise<unknown> = Promise.resolve();

function serialize<T>(action: () => Promise<T>) {
  const task = work.then(() => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(LEGACY_INDEX, action) : action());
  work = task.catch(() => {});
  return task;
}

function readRecord(raw: unknown): ManagedShare | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as RawShareRecord;
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(row.id)
    || !(Date.parse(String(row.expiresAt)) > Date.now())) return null;
  return {
    id: row.id,
    profileId: String(row.profileId || ''),
    profileName: String(row.profileName || 'Profile'),
    shareUrl: String(row.shareUrl || ''),
    manageToken: String(row.manageToken || ''),
    createdAt: String(row.createdAt || ''),
    expiresAt: String(row.expiresAt),
  };
}

async function store(row: ManagedShare) {
  const address = PREFIX + row.id;
  const serialized = JSON.stringify(row);
  const encrypted = await encryptDeviceCredential(address, serialized);
  localStorage.setItem(address, encrypted);
  const stored = localStorage.getItem(address);
  if (stored !== encrypted || await decryptDeviceCredential(address, stored) !== serialized) {
    throw new Error('Could not verify the Stop sharing credential on this device.');
  }
}

async function migrateLegacyIndex() {
  const legacy = localStorage.getItem(LEGACY_INDEX);
  if (legacy === null) return;
  const rows: unknown = JSON.parse(legacy);
  if (!Array.isArray(rows)) throw new Error('Could not read the previous share history.');
  for (const raw of rows) {
    const row = readRecord(raw);
    if (row) await store(row);
  }
  // Keep the only prior copy until every live record has a verified encrypted copy.
  if (localStorage.getItem(LEGACY_INDEX) === legacy) localStorage.removeItem(LEGACY_INDEX);
}

async function readAt(address: string) {
  const saved = localStorage.getItem(address);
  if (!saved) return null;
  const raw = saved.startsWith('d1:') ? await decryptDeviceCredential(address, saved) : saved;
  if (raw === null) throw new Error('This device could not read its share management credential.');
  const row = readRecord(JSON.parse(raw));
  if (!row) {
    if (localStorage.getItem(address) === saved) localStorage.removeItem(address);
    return null;
  }
  if (PREFIX + row.id !== address) throw new Error('Invalid share management record.');
  if (!saved.startsWith('d1:')) await store(row);
  return row;
}

export function hydrateShareHistory() {
  return serialize(async () => {
    let failed = false;
    try { await migrateLegacyIndex(); } catch { failed = true; }
    const next = new Map<string, ManagedShare>();
    const addresses: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const address = localStorage.key(i);
      if (address?.startsWith(PREFIX)) addresses.push(address);
    }
    for (const address of addresses) {
      try {
        const row = await readAt(address);
        if (row) next.set(row.id, row);
      } catch { failed = true; }
    }
    cache = next;
    if (failed) throw new Error('Some sharing credentials could not be read on this device.');
  });
}

export function getProfileShareRecords(profileId: unknown) {
  return [...cache.values()].filter(row => row.profileId === profileId
    && Date.parse(row.expiresAt) > Date.now() && localStorage.getItem(PREFIX + row.id) !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getShareRecord(id: string) {
  return serialize(async () => {
    if (localStorage.getItem(PREFIX + id) === null) await migrateLegacyIndex();
    return readAt(PREFIX + id);
  });
}

export function saveShareRecord(record: ShareRecord) {
  return serialize(async () => {
    const row = readRecord(record);
    if (!row) throw new Error('Invalid Stop sharing credential.');
    await store(row);
    cache.set(row.id, row);
  });
}

export function removeShareRecord(id: string) {
  return serialize(async () => {
    // Finish migration before deleting the new copy so an old index cannot resurrect it.
    await migrateLegacyIndex();
    localStorage.removeItem(PREFIX + id);
    cache.delete(id);
  });
}
