import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

const index = 'getbased-profile-shares-v1';
const record = {
  id: 'fictionalLink00123456789', profileId: 'fictional-profile', profileName: 'Fictional profile',
  manageToken: 'synthetic-revocation-key', shareUrl: '#share/fictional',
  createdAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
};
const key = index + ':' + record.id;
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
});

it('migrates legacy history, reloads its management key, then durably removes the link', async () => {
  localStorage.setItem(index, JSON.stringify([record]));
  const first = await import('../js/profile-share-history.js');
  await first.hydrateShareHistory();
  expect(localStorage.getItem(index)).toBeNull();
  expect(localStorage.getItem(key)).toMatch(/^d1:/);
  expect(localStorage.getItem(key)).not.toContain(record.manageToken);
  expect(localStorage.getItem(key)).not.toContain(record.profileName);
  vi.resetModules();
  const next = await import('../js/profile-share-history.js');
  await next.hydrateShareHistory();
  expect(next.getProfileShareRecords(record.profileId)).toEqual([record]);
  expect(await next.getShareRecord(record.id)).toEqual(record);
  await next.removeShareRecord(record.id);
  expect(await next.getShareRecord(record.id)).toBeNull();
});

it('retains the last readable legacy copy when a device write fails and migrates on retry', async () => {
  const history = await import('../js/profile-share-history.js');
  const source = JSON.stringify([record]);
  localStorage.setItem(index, source);
  const write = localStorage.setItem.bind(localStorage);
  const fail = vi.spyOn(localStorage, 'setItem').mockImplementation((address, value) => {
    if (address === key) throw new Error('Fixture storage unavailable');
    write(address, value);
  });
  try {
    await expect(history.hydrateShareHistory()).rejects.toThrow();
    await expect(history.saveShareRecord(record)).rejects.toThrow();
  } finally { fail.mockRestore(); }
  expect(localStorage.getItem(index)).toBe(source);
  await history.hydrateShareHistory();
  expect(localStorage.getItem(index)).toBeNull();
  expect(await history.getShareRecord(record.id)).toEqual(record);
});
