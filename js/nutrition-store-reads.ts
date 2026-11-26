// Ordered encrypted meal row retrieval and optional outer passphrase envelope.
import { bytesToBase64, _base64ToBytes } from './base64.js';
import type { DeviceLocalEnvelope, EncryptedEnvelopeCheck, PassphraseEnvelope } from './wearable-storage-types.js';
import type { StorageMode } from './cashu-wallet-storage-types.js';

interface MealReadOptions { since: unknown; limit: unknown }
type BatchIndex<Row> = IDBIndex & {
  getAllRecords?: (this: IDBIndex, options: {query: IDBKeyRange | null; count: number; direction: 'prev'}) => IDBRequest<{readonly value: Row}[]>;
};
interface NutritionCryptoDeps {
  getEncryptionEnabled: () => boolean;
  encryptObject: (value: unknown) => Promise<PassphraseEnvelope | null>;
  isEncryptedObject: (value: unknown) => EncryptedEnvelopeCheck;
  decryptObject: <Value = Record<string, unknown>>(envelope: unknown) => Promise<Value | null>;
}
const STORE_MEALS = 'meals';
const STORE_META = 'meta';
const META_CRYPTO_KEYS = ['nutrition-summary:v1', 'nutrition-comparison:v1'] as const;
let nutritionCryptoDeps: NutritionCryptoDeps = {
  getEncryptionEnabled: () => false,
  encryptObject: async () => null,
  isEncryptedObject: () => false,
  decryptObject: async () => null,
};

export function configureNutritionStoreCrypto(deps: Partial<NutritionCryptoDeps> = {}) {
  nutritionCryptoDeps = { ...nutritionCryptoDeps, ...deps };
}

function encodeDeviceEnvelope(env: DeviceLocalEnvelope) {
  const ivBytes = env.iv instanceof Uint8Array ? env.iv : new Uint8Array(env.iv);
  const ctBytes = env.ciphertext instanceof Uint8Array ? env.ciphertext : new Uint8Array(env.ciphertext);
  return { version: 1, iv: bytesToBase64(ivBytes), ciphertext: bytesToBase64(ctBytes) };
}

function decodeDeviceEnvelope(plain: Record<string, unknown> | null): DeviceLocalEnvelope | null {
  if (!plain || plain.version !== 1 || typeof plain.iv !== 'string' || typeof plain.ciphertext !== 'string') return null;
  return { version: 1, iv: _base64ToBytes(plain.iv), ciphertext: _base64ToBytes(plain.ciphertext).buffer };
}

export async function wrapNutritionEnvelope(envelope: DeviceLocalEnvelope): Promise<DeviceLocalEnvelope | PassphraseEnvelope> {
  if (!nutritionCryptoDeps.getEncryptionEnabled()) return envelope;
  const wrapped = await nutritionCryptoDeps.encryptObject(encodeDeviceEnvelope(envelope));
  if (!wrapped) {
    const err: Error & { code?: string } = new Error('Nutrition storage is encrypted; unlock with your passphrase before saving.');
    err.code = 'session-locked';
    throw err;
  }
  return wrapped;
}

export async function unwrapNutritionEnvelope(envelope: unknown): Promise<Partial<DeviceLocalEnvelope> | null> {
  if (!envelope || typeof envelope !== 'object') return null;
  if (!nutritionCryptoDeps.isEncryptedObject(envelope)) return envelope as Partial<DeviceLocalEnvelope>;
  const plain = await nutritionCryptoDeps.decryptObject(envelope).catch(() => null);
  return decodeDeviceEnvelope(plain);
}

export async function migrateNutritionProfileDB(profileId: string, mode: StorageMode): Promise<number> {
  if (typeof indexedDB === 'undefined' || !profileId) return 0;
  const dbName = `getbased-nutrition-${profileId}`;
  if (typeof indexedDB.databases === 'function') {
    const list = await indexedDB.databases().catch(() => null);
    if (Array.isArray(list) && !list.some(entry => entry?.name === dbName)) return 0;
  }
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const req = indexedDB.open(dbName);
    let created = false;
    req.onupgradeneeded = () => { if (req.result.version === 1 && !req.result.objectStoreNames.contains(STORE_MEALS)) { created = true; req.transaction?.abort(); } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => created ? resolve(null) : reject(req.error);
  }).catch(() => null);
  if (!db) return 0;
  try {
    if (!db.objectStoreNames.contains(STORE_MEALS) || !db.objectStoreNames.contains(STORE_META)) return 0;
    const readAll = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => reject(req.error);
    });
    const meals = await readAll<Record<string, unknown>>(STORE_MEALS);
    const metaRows = await readAll<{ k?: unknown; value?: unknown }>(STORE_META);
    const updatedMeals: Record<string, unknown>[] = [];
    const updatedMeta: { k: string; value: unknown }[] = [];
    const transform = async (val: unknown) => {
      if (!val || typeof val !== 'object') return null;
      const isEnc = Boolean(nutritionCryptoDeps.isEncryptedObject(val));
      if (mode === 'encrypted') {
        if (isEnc) return null;
        return wrapNutritionEnvelope(val as DeviceLocalEnvelope);
      }
      if (!isEnc) return null;
      const plain = await unwrapNutritionEnvelope(val);
      if (!plain) throw new Error('Encrypted nutrition record could not be decrypted.');
      return plain;
    };
    for (const row of meals) {
      const next = await transform(row._devicePayload);
      if (next) updatedMeals.push({ ...row, _devicePayload: next });
    }
    for (const entry of metaRows) {
      if (typeof entry?.k !== 'string' || !META_CRYPTO_KEYS.includes(entry.k as typeof META_CRYPTO_KEYS[number])) continue;
      const next = await transform(entry.value);
      if (next) updatedMeta.push({ k: entry.k, value: next });
    }
    if (!updatedMeals.length && !updatedMeta.length) return 0;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_MEALS, STORE_META], 'readwrite');
      const mStore = tx.objectStore(STORE_MEALS);
      const metaStore = tx.objectStore(STORE_META);
      for (const row of updatedMeals) mStore.put(row);
      for (const entry of updatedMeta) metaStore.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Nutrition encryption migration aborted.'));
    });
    return updatedMeals.length + updatedMeta.length;
  } finally {
    db.close();
  }
}

export function readNutritionMealRows<Row>(db: IDBDatabase, {since, limit}: MealReadOptions): Promise<Row[]> {
  return new Promise<Row[]>((resolve, reject) => {
    const index = db.transaction(STORE_MEALS, 'readonly').objectStore(STORE_MEALS).index('by_eaten_at');
    const range = since && typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.lowerBound(String(since)) : null;
    // Zero means unbounded to IndexedDB; keep all legacy coercions in the cursor.
    if (typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0 && limit <= 0xffffffff) {
      const getAllRecords = (index as BatchIndex<Row>).getAllRecords;
      if (typeof getAllRecords === 'function') {
        const request = getAllRecords.call(index, {query: range, count: limit, direction: 'prev'});
        request.onsuccess = () => {
          try { resolve(request.result.map(record => record.value)); }
          catch (error) { reject(error); }
        };
        request.onerror = () => reject(request.error);
        return;
      }
    }
    const request = index.openCursor(range, 'prev');
    const found: Row[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && found.length < Math.max(1, Number(limit) || 500)) {
        found.push(cursor.value);
        cursor.continue();
      } else {
        resolve(found);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
