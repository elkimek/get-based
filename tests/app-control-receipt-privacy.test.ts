import { afterEach, beforeEach, expect, it } from 'vitest';
import * as store from '../js/crypto.js';

const flag = window as { __WEARABLES_TEST?: unknown };
const previousFlag = flag.__WEARABLES_TEST;
const keys = ['labcharts-profile_with-dash-app-control-profile-switch', 'labcharts-profile_with-dash-app-control-display-change', 'labcharts-profile_with-dash-app-control-ordering-change', 'labcharts-profile_with-dash-app-control-persona-change'];
const receipt = JSON.stringify({ version: 1, signature: 'PRIVATE_PROFILE_NAME_AND_HUMAN_EVIDENCE' });
beforeEach(() => { localStorage.clear(); flag.__WEARABLES_TEST = true; });
afterEach(async () => { await store._setTestSessionKey(null); flag.__WEARABLES_TEST = previousFlag; localStorage.clear(); });

it.each(keys)('protects receipt %s with native encryption and refuses locked reads or overwrites', async key => {
  await store._setTestSessionKey('synthetic receipt passphrase'); localStorage.setItem('labcharts-encryption-enabled', 'true');
  await store.encryptedSetItem(key, receipt);
  const raw = localStorage.getItem(key);
  expect(store.isEncryptedValue(raw)).toBe(true); expect(raw).not.toContain('PRIVATE_PROFILE_NAME');
  expect(await store.encryptedGetItem(key, { throwOnDecryptError: true })).toBe(receipt);
  await store._setTestSessionKey(null);
  await expect(store.encryptedGetItem(key, { throwOnDecryptError: true })).rejects.toThrow('locked');
  await expect(store.encryptedSetItem(key, 'unauthorized replacement')).rejects.toThrow('locked');
  expect(localStorage.getItem(key)).toBe(raw);
});

it('includes older plaintext control receipts in the native encryption migration without changing their proof', async () => {
  for (const key of keys) localStorage.setItem(key, receipt);
  await store._setTestSessionKey('synthetic migration passphrase'); localStorage.setItem('labcharts-encryption-enabled', 'true');
  await store._migrateAllStorageForTest('encrypted');
  for (const key of keys) {
    expect(store.isEncryptedValue(localStorage.getItem(key))).toBe(true);
    expect(await store.encryptedGetItem(key, { throwOnDecryptError: true })).toBe(receipt);
  }
  await store._migrateAllStorageForTest('plain');
  for (const key of keys) expect(localStorage.getItem(key)).toBe(receipt);
});
