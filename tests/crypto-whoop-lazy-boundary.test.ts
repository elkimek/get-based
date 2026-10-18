import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as cryptoStorage from '../js/crypto.js';
import {getBlob, setBlob} from '../js/blob-storage.js';
import {deleteWearablesDB, getMeta} from '../js/wearables-store.js';
import type {transformWhoopStorageValue} from '../js/wearables-whoop-storage.js';

const ports = vi.hoisted(() => ({loads: vi.fn(), calls: vi.fn(), failure: null as Error | null}));
vi.mock('../js/wearables-whoop-storage.js', async original => {
  ports.loads();
  const actual = await original<typeof import('../js/wearables-whoop-storage.js')>();
  return {...actual, transformWhoopStorageValue: (...args: Parameters<typeof transformWhoopStorageValue>) => {
    ports.calls(...args);
    if (ports.failure) throw ports.failure;
    return actual.transformWhoopStorageValue(...args);
  }};
});

const profile = 'whoop-lazy-boundary', key = `labcharts-${profile}-imported`;
const payload = {entries: [], wearableConnections: {whoop: {connectedAt: 1, account: 'private@example.test'}}};
const originalTestFlag = (window as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
beforeEach(() => {
  localStorage.clear(); ports.calls.mockClear(); ports.failure = null;
  (window as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = true;
});
afterEach(async () => {
  ports.failure = null; await cryptoStorage._setTestSessionKey(null);
  await cryptoStorage.encryptedRemoveItem(key); await deleteWearablesDB(profile); localStorage.clear();
  (window as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = originalTestFlag;
});

it('cold ordinary imported reads/writes retain bytes while never evaluating the optional WHOOP module', async () => {
  expect(ports.loads).not.toHaveBeenCalled();
  const value = ' {"entries": [], "contextNotes": "WHOOP spelling without source token", "n": 1e2}\n';
  await cryptoStorage.encryptedSetItem(key, value);
  expect(await getBlob(key)).toBe(value);
  expect(await cryptoStorage.encryptedGetItem(key, {throwOnDecryptError: true})).toBe(value);
  expect(ports.loads).not.toHaveBeenCalled(); expect(ports.calls).not.toHaveBeenCalled();
});

it('token-bearing values retain the real device-protection, durable marker and hydration path', async () => {
  const value = JSON.stringify(payload);
  await cryptoStorage.encryptedSetItem(key, value);
  const raw = await getBlob(key), envelope = await getMeta(profile, 'whoop-profile-data:v1');
  expect(raw).toBe(JSON.stringify({entries: [], wearableConnections: {}, _deviceProtectedWearableProfile: 'v1'}));
  expect(raw).not.toContain('private@example.test'); expect(envelope).toMatchObject({version: 1});
  expect(JSON.parse((await cryptoStorage.encryptedGetItem(key, {throwOnDecryptError: true}))!)).toEqual(payload);
  expect(ports.loads).toHaveBeenCalledTimes(1);
  expect(ports.calls.mock.calls.map(call => [call[0], call[1], call[2], call[3]]))
    .toEqual([[key, value, 'protect', false], [key, raw, 'hydrate', false]]);
});

it('plaintext legacy WHOOP reads finish device protection before replacing canonical storage', async () => {
  const value = JSON.stringify(payload); await setBlob(key, value);
  expect(await cryptoStorage.encryptedGetItem(key, {throwOnDecryptError: true})).toBe(value);
  expect(await getBlob(key)).not.toContain('private@example.test');
  expect(await getMeta(profile, 'whoop-profile-data:v1')).toMatchObject({version: 1});
  expect(ports.calls.mock.calls.map(call => call[2])).toEqual(['hydrate']);
});

it('a transformer failure still rejects storage and the same native module path is retried', async () => {
  const value = JSON.stringify(payload), fault = new Error('device protection unavailable');
  ports.failure = fault;
  await expect(cryptoStorage.encryptedSetItem(key, value)).rejects.toBe(fault);
  expect(await getBlob(key)).toBeNull();
  await setBlob(key, value);
  await expect(cryptoStorage.encryptedGetItem(key, {throwOnDecryptError: true})).rejects.toBe(fault);
  expect(await getBlob(key)).toBe(value);
  ports.failure = null;
  expect(await cryptoStorage.encryptedGetItem(key, {throwOnDecryptError: true})).toBe(value);
  expect(await getBlob(key)).not.toContain('private@example.test');
});

it('ordinary no-token values still obey passphrase encryption and the locked storage boundary', async () => {
  const value = '{"entries":[],"notes":[]}'; localStorage.setItem('labcharts-encryption-enabled', 'true');
  await expect(cryptoStorage.encryptedSetItem(key, value)).rejects.toThrow('Profile storage is locked');
  expect(await getBlob(key)).toBeNull();
  await cryptoStorage._setTestSessionKey('whoop-boundary-passphrase');
  await cryptoStorage.encryptedSetItem(key, value);
  const raw = await getBlob(key); expect(raw).toMatch(/^v1:/); expect(raw).not.toContain('entries');
  expect(await cryptoStorage.encryptedGetItem(key, {throwOnDecryptError: true})).toBe(value);
  await cryptoStorage._setTestSessionKey(null);
  await expect(cryptoStorage.encryptedGetItem(key, {throwOnDecryptError: true})).rejects.toThrow('Profile storage is locked');
  expect(ports.calls).not.toHaveBeenCalled();
});

it('unrelated or malformed token-bearing strings still reach the existing transformer unchanged', async () => {
  const value = 'not JSON "whoop"'; await cryptoStorage.encryptedSetItem(key, value);
  expect(await cryptoStorage.encryptedGetItem(key)).toBe(value); expect(await getBlob(key)).toBe(value);
  expect(ports.calls).toHaveBeenCalledTimes(2);
});
