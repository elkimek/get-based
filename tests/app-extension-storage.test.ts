import { afterEach, describe, expect, it } from 'vitest';
import { configureAppExtension } from '../js/app-extension-runtime.js';
import {
  decryptKeyCache,
  encryptedRemoveItem,
  encryptedSetItem,
  getCachedKey,
  updateKeyCache,
} from '../js/crypto.js';

afterEach(() => configureAppExtension(null));

describe('app extension runtime', () => {
  it('keeps extension-owned encrypted storage and its synchronous cache coherent', async () => {
    const storageKey = 'edition-encrypted-profile-default';
    configureAppExtension({
      id: 'cache-test-edition',
      sync: { encryptedStoragePrefixes: ['edition-encrypted-profile-'] },
    });
    localStorage.setItem(storageKey, 'stored-before-write');
    updateKeyCache(storageKey, 'stale-before-write');

    await encryptedSetItem(storageKey, 'fresh-after-write');
    expect(getCachedKey(storageKey)).toBe('fresh-after-write');

    updateKeyCache(storageKey, 'stale-before-hydration');
    await decryptKeyCache();
    expect(getCachedKey(storageKey)).toBe('fresh-after-write');

    updateKeyCache(storageKey, 'stale-before-removal');
    await encryptedRemoveItem(storageKey);
    expect(getCachedKey(storageKey)).toBeNull();
  });

  it('invalidates a removed provider credential in the synchronous cache', async () => {
    const storageKey = 'labcharts-openrouter-key';
    localStorage.setItem(storageKey, 'stored-provider-key');
    updateKeyCache(storageKey, 'cached-provider-key');

    await encryptedRemoveItem(storageKey);

    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(getCachedKey(storageKey)).toBeNull();
  });
});
