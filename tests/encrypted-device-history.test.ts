import { afterEach, expect, it } from 'vitest';
import { _setTestSessionKey, encryptObject, decryptObject } from '../js/crypto.js';
import { getDailyRange, upsertDaily, getAllDailyRaw, getMeta, resetWearablesDB } from '../js/wearables-store.js';
import { serializeProtectedStorageObject, parseProtectedStorageObject } from '../js/storage-object-codec.js';

afterEach(async () => { await _setTestSessionKey(null); localStorage.removeItem('labcharts-encryption-enabled'); });
it('keeps ordinary JSON wire bytes and literal marker-shaped user objects unchanged', () => {
  (window as Window & {__WEARABLES_TEST?: boolean}).__WEARABLES_TEST = true;
  const value = {ordinary: true, nested: {__getbasedArrayBuffer: 'user text', __getbasedMigrationValue: ['bytes', 'also user text']}};
  expect(serializeProtectedStorageObject(value)).toBe(JSON.stringify(value));
  expect(parseProtectedStorageObject(JSON.stringify(value))).toEqual(value);
});
it('retains nested browser-only bytes through real passphrase object encryption', async () => {
  (window as Window & {__WEARABLES_TEST?: boolean}).__WEARABLES_TEST = true;
  await _setTestSessionKey('SyntheticOriginal1!'); localStorage.setItem('labcharts-encryption-enabled', 'true');
  const value = {nested: {iv: new Uint8Array([1, 3, 8]), ciphertext: new Uint8Array([6, 7, 9]).buffer}, ordinary: {retained: true}};
  expect(await decryptObject(await encryptObject(value))).toEqual(value);
});
it('reads real WHOOP history after passphrase protection wraps its browser-only encryption', async () => {
  (window as Window & {__WEARABLES_TEST?: boolean}).__WEARABLES_TEST = true;
  await _setTestSessionKey('SyntheticOriginal1!'); localStorage.setItem('labcharts-encryption-enabled', 'true');
  const id = 'synthetic-real-device-history'; resetWearablesDB(id);
  await upsertDaily(id, {source: 'whoop', date: '1995-01-01', hrv_rmssd: 71});
  const raw = await getAllDailyRaw(id);
  expect(raw[0]?._payload?._enc).toBe('v1');
  expect(raw[0]?.hrv_rmssd).toBeUndefined();
  const row = (await getDailyRange(id, 'whoop', '1995-01-01', '1995-01-01'))[0];
  expect(row?.hrv_rmssd).toBe(71);
  expect((await getMeta<CryptoKey>(id, 'credential-vault-key:v1'))?.extractable).toBe(false);
});
