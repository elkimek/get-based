// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64 } from '../js/base64.js';
import type { PassphraseServices } from '../js/passphrase-controller.js';

const dialog = vi.hoisted(() => ({ services: null as PassphraseServices | null }));
vi.mock('../js/crypto-ui.js', async importOriginal => {
  const original = await importOriginal<typeof import('../js/crypto-ui.js')>();
  return {
    ...original,
    configureCryptoUi(services: PassphraseServices) {
      dialog.services = services;
      return original.configureCryptoUi(services);
    },
  };
});

describe('protected storage audit regressions', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());
  it('rotates one wrapped key without changing the stored ciphertext and unlocks with the new password after reload', async () => {
    const settings = await import('../js/crypto.js');
    const fixture = window as typeof window & { __WEARABLES_TEST?: boolean };
    fixture.__WEARABLES_TEST = true;
    const oldPassphrase = 'fictional original passphrase';
    const newPassphrase = 'fictional replacement passphrase';
    const manifestKey = 'labcharts-encryption-salt';
    const profileKey = 'labcharts-profiles';
    const cacheKey = 'labcharts-fixture-focusCard';
    const salt = await settings._setTestSessionKey(oldPassphrase);
    const services = dialog.services!;
    try {
      localStorage.setItem('labcharts-encryption-enabled', 'true');
      localStorage.setItem(manifestKey, bytesToBase64(salt!));
      await settings.encryptedSetItem(profileKey, '[{"name":"Synthetic"}]');
      await settings.encryptedSetItem(cacheKey, '{"text":"Fictional lab summary"}');
      const oldManifest = localStorage.getItem(manifestKey);
      const original = localStorage.getItem(profileKey);
      const cache = localStorage.getItem(cacheKey);
      expect(cache).toMatch(/^v1:/);
      const write = Storage.prototype.setItem;
      const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
        if (key === manifestKey) throw new Error('Synthetic quota limit');
        write.call(this, key, value);
      });
      try {
        await expect(services.changeEncryptionPassphrase!(oldPassphrase, newPassphrase)).rejects.toThrow('quota');
      } finally { fail.mockRestore(); }
      expect(localStorage.getItem(manifestKey)).toBe(oldManifest);
      expect(localStorage.getItem(profileKey)).toBe(original);
      expect(await settings.encryptedGetItem(cacheKey)).toContain('Fictional lab summary');
      await services.changeEncryptionPassphrase!(oldPassphrase, newPassphrase);
      expect(localStorage.getItem(manifestKey)).toMatch(/^v2:/);
      expect(localStorage.getItem(profileKey)).toBe(original);
      expect(localStorage.getItem(cacheKey)).toBe(cache);
      await settings._setTestSessionKey(null);
      await expect(services.unlockEncryption!(oldPassphrase)).rejects.toThrow();
      await services.unlockEncryption!(newPassphrase);
      expect(await settings.encryptedGetItem(cacheKey)).toContain('Fictional lab summary');
    } finally {
      localStorage.clear();
      await settings._setTestSessionKey(null);
      delete fixture.__WEARABLES_TEST;
    }
  });

  it('retains a protected pending revocation after relay failure and clears it after acknowledgement', async () => {
    const { configureSyncMessenger, queueMessengerRevocation, flushQueuedMessengerRevocations } = await import('../js/sync-messenger.js');
    const owner = { id: 'synthetic-owner', writeKey: new Uint8Array(32).fill(7) };
    configureSyncMessenger({ getAppOwner: () => owner, getSyncRelay: () => 'wss://relay.invalid' });
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);
    try {
      const token = 'a'.repeat(64);
      const key = await queueMessengerRevocation(token);
      expect(localStorage.getItem(key!)).toMatch(/^d1:/);
      expect(localStorage.getItem(key!)).not.toContain(token);
      await expect(flushQueuedMessengerRevocations()).resolves.toBe(false);
      expect(localStorage.getItem(key!)).toBeTruthy();
      await expect(flushQueuedMessengerRevocations()).resolves.toBe(true);
      expect(localStorage.getItem(key!)).toBeNull();
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      localStorage.clear();
      vi.unstubAllGlobals();
      configureSyncMessenger({ getAppOwner: () => null });
    }
  });

  it('purges legacy plaintext auto-backups when unlocking an already-encrypted profile', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const settings = await import('../js/crypto.js');
    const backup = await import('../js/backup.js');
    const fixture = window as typeof window & { __WEARABLES_TEST?: boolean };
    fixture.__WEARABLES_TEST = true;
    const passphrase = 'fictional existing passphrase';
    const salt = await settings._setTestSessionKey(passphrase);
    const services = dialog.services!;
    try {
      localStorage.setItem('labcharts-encryption-enabled', 'true');
      localStorage.setItem('labcharts-encryption-salt', bytesToBase64(salt!));
      await settings.encryptedSetItem('labcharts-profiles', '[{"name":"Synthetic"}]');
      const db = await backup.openBackupDB();
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').add({ createdAt: '2025-01-01T00:00:00Z', encrypted: false, snapshot: { encrypted: false } });
      tx.objectStore('snapshots').add({ createdAt: '2026-01-01T00:00:00Z', encrypted: true, snapshot: { encrypted: true } });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
      await settings._setTestSessionKey(null);
      await services.unlockEncryption!(passphrase);
      const remaining = await backup.getAutoBackupSnapshots();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.encrypted).toBe(true);
    } finally {
      localStorage.clear();
      await settings._setTestSessionKey(null);
      delete fixture.__WEARABLES_TEST;
    }
  });
});
