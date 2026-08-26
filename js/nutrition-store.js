// @ts-check
// nutrition-store.js — encrypted local cache for cross-device meal records.
//
// Reviewed meal data and 240px thumbnails are mirrored into importedData for
// encrypted cross-device sync. Full-size uploads exist only in memory while an
// AI request is being prepared and are stripped again at this storage boundary.
// A non-extractable AES key encrypts every local cached meal payload.

import { state } from './state.js';
import { computeNutritionSummary, NUTRITION_SUMMARY_VERSION } from './nutrition-summary.js';
import { getDailyRange } from './wearables-store.js';
import { clearTombstone, recordTombstone } from './data-merge.js';
import { sanitizeNutritionMeal } from './nutrition-sync-sanitize.js';

export { sanitizeNutritionMeal } from './nutrition-sync-sanitize.js';

const DB_PREFIX = 'getbased-nutrition-';
const DB_VERSION = 2;
const STORE_MEALS = 'meals';
const STORE_META = 'meta';
const STORE_FOODS = 'food-cache';
const DEVICE_KEY_META = 'meal-device-key:v1';
const SUMMARY_META = 'nutrition-summary:v1';
const COMPARISON_META = 'nutrition-comparison:v1';
const PROFILE_SYNC_INITIALIZED_META = 'nutrition-profile-sync-initialized:v1';
const TOMBSTONE_KEYS = ['_deleted', '_deletedAt', '_deletedClearedAt'];

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const dbPromises = new Map();
/** @type {Promise<any>} */
let nutritionOperationTail = Promise.resolve();

/** @template T @param {() => Promise<T>} operation @returns {Promise<T>} */
function queueNutritionOperation(operation) {
  const result = nutritionOperationTail.then(operation);
  nutritionOperationTail = result.catch(() => {});
  return result;
}

function localDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sleepCandidateSources(importedData = state.importedData) {
  const metrics = importedData?.wearableSummary?.metrics || {};
  const preferred = metrics.sleep_total_min?.primarySource || metrics.sleep_score?.primarySource || '';
  const connected = Object.keys(importedData?.wearableSummary?.sources || {});
  return [...new Set([preferred, ...connected, 'oura'].filter(Boolean))];
}

/** @returns {Promise<Array<{source: string, sleepStart: string, sleepEnd: string}>>} */
async function loadLocalSleepIntervals(profileId, {
  days = 100,
  now = new Date(),
  importedData = state.importedData,
} = {}) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(7, Number(days) || 100));
  for (const source of sleepCandidateSources(importedData)) {
    const rows = await getDailyRange(profileId, source, localDay(start), localDay(end)).catch(() => []);
    /** @type {Array<{source: string, sleepStart: string, sleepEnd: string}>} */
    const intervals = rows.flatMap(row => row?.sleep_start_at && row?.sleep_end_at ? [{
      source,
      sleepStart: row.sleep_start_at,
      sleepEnd: row.sleep_end_at,
    }] : []);
    if (intervals.length) return intervals;
  }
  return [];
}

export class NutritionStorageIntegrityError extends Error {
  constructor(message = 'A stored meal could not be decrypted. The local meal database may be damaged or its device key may be unavailable.') {
    super(message);
    this.name = 'NutritionStorageIntegrityError';
  }
}

function normalizeProfileId(profileId) {
  return String(profileId || 'default').replace(/[^a-z0-9_-]/gi, '').slice(0, 128) || 'default';
}

function databaseName(profileId) {
  return DB_PREFIX + normalizeProfileId(profileId);
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error || new Error('Nutrition storage transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('Nutrition storage transaction was aborted.'));
  });
}

export function openNutritionDB(profileId) {
  const normalized = normalizeProfileId(profileId);
  const name = databaseName(normalized);
  if (dbPromises.has(name)) return dbPromises.get(name);
  const promise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Secure meal storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MEALS)) {
        const meals = db.createObjectStore(STORE_MEALS, { keyPath: 'id' });
        meals.createIndex('by_eaten_at', 'eatenAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'k' });
      }
      if (!db.objectStoreNames.contains(STORE_FOODS)) {
        db.createObjectStore(STORE_FOODS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        resetNutritionDB(normalized);
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromises.delete(name);
      reject(request.error || new Error('Secure meal storage could not be opened.'));
    };
  });
  dbPromises.set(name, promise);
  return promise;
}

export function resetNutritionDB(profileId) {
  const name = databaseName(profileId);
  const cached = dbPromises.get(name);
  dbPromises.delete(name);
  cached?.then(db => db?.close?.()).catch(() => {});
}

function isAesKey(value) {
  return !!(value
    && typeof value === 'object'
    && value.type === 'secret'
    && value.algorithm?.name === 'AES-GCM');
}

async function readMeta(profileId, key) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeMeta(profileId, key, value) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ k: key, value });
  await transactionDone(tx);
}

async function deleteMeta(profileId, key) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).delete(key);
  await transactionDone(tx);
}

async function claimDeviceKey(profileId, candidate) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const tx = db.transaction(STORE_META, 'readwrite');
  const store = tx.objectStore(STORE_META);
  const request = store.get(DEVICE_KEY_META);
  let selected = candidate;
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const existing = request.result?.value;
      if (isAesKey(existing)) selected = existing;
      else store.put({ k: DEVICE_KEY_META, value: candidate });
    };
    request.onerror = () => reject(request.error || new Error('The meal encryption key could not be read.'));
    tx.oncomplete = () => resolve(selected);
    tx.onerror = () => reject(tx.error || new Error('The meal encryption key could not be stored.'));
    tx.onabort = () => reject(tx.error || new Error('The meal encryption key transaction was aborted.'));
  });
}

async function getOrCreateDeviceKey(profileId) {
  const existing = await readMeta(profileId, DEVICE_KEY_META);
  if (isAesKey(existing)) return existing;
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure browser encryption is unavailable. No meal was saved.');
  }
  const candidate = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  // IndexedDB read/write transactions are serialized. Rechecking and
  // claiming the key inside one transaction prevents two first-save tabs
  // from encrypting records with different keys when Web Locks is absent.
  return claimDeviceKey(profileId, candidate);
}

async function encryptPayload(profileId, value) {
  const key = await getOrCreateDeviceKey(profileId);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { version: 1, iv, ciphertext };
}

async function decryptPayload(profileId, envelope) {
  if (envelope?.version !== 1 || !envelope.iv || !envelope.ciphertext) return null;
  const key = await readMeta(profileId, DEVICE_KEY_META);
  if (!isAesKey(key)) return null;
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: envelope.iv },
      key,
      envelope.ciphertext,
    );
    const parsed = JSON.parse(decoder.decode(plaintext));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function createMealId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `meal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMeal(meal, { preserveUpdatedAt = false } = {}) {
  const now = new Date().toISOString();
  const sanitized = sanitizeNutritionMeal(meal);
  const eatenAt = new Date(sanitized?.eatenAt || now);
  if (!Number.isFinite(eatenAt.getTime())) throw new Error('A valid meal date is required.');
  const suppliedUpdatedAt = new Date(sanitized?.updatedAt || '');
  const updatedAt = preserveUpdatedAt && Number.isFinite(suppliedUpdatedAt.getTime())
    ? suppliedUpdatedAt.toISOString()
    : now;
  return {
    ...sanitized,
    id: String(sanitized?.id || createMealId()),
    eatenAt: eatenAt.toISOString(),
    createdAt: sanitized?.createdAt || now,
    updatedAt,
    reviewed: sanitized?.reviewed !== false,
  };
}

export async function putNutritionMeal(profileId, meal, options = {}) {
  const normalized = normalizeMeal(meal, options);
  const { id, eatenAt, updatedAt, ...payload } = normalized;
  const encrypted = await encryptPayload(profileId, payload);
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const tx = db.transaction(STORE_MEALS, 'readwrite');
  tx.objectStore(STORE_MEALS).put({ id, eatenAt, updatedAt, _devicePayload: encrypted });
  await transactionDone(tx);
  return normalized;
}

async function decryptStoredMeal(profileId, row) {
  if (!row?._devicePayload) throw new NutritionStorageIntegrityError('A stored meal is missing its encrypted payload.');
  const payload = await decryptPayload(profileId, row._devicePayload);
  if (!payload) throw new NutritionStorageIntegrityError();
  return { id: row.id, eatenAt: row.eatenAt, updatedAt: row.updatedAt, ...payload };
}

export async function getNutritionMeal(profileId, id) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const row = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_MEALS, 'readonly').objectStore(STORE_MEALS).get(String(id || ''));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  return row ? decryptStoredMeal(profileId, row) : null;
}

export async function listNutritionMeals(profileId, { since = null, limit = 500 } = {}) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const rows = await new Promise((resolve, reject) => {
    const index = db.transaction(STORE_MEALS, 'readonly').objectStore(STORE_MEALS).index('by_eaten_at');
    const range = since && typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.lowerBound(String(since)) : null;
    const request = index.openCursor(range, 'prev');
    const found = [];
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
  return Promise.all(rows.map(row => decryptStoredMeal(profileId, row)));
}

export async function deleteNutritionMeal(profileId, id) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const tx = db.transaction(STORE_MEALS, 'readwrite');
  tx.objectStore(STORE_MEALS).delete(String(id || ''));
  await transactionDone(tx);
}

async function foodCacheId(barcode) {
  const normalized = String(barcode || '').replace(/\D/g, '');
  if (!normalized || !globalThis.crypto?.subtle) throw new Error('Secure food cache is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(normalized));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function putNutritionFood(profileId, food) {
  const barcode = String(food?.barcode || '').replace(/\D/g, '');
  if (!barcode) throw new Error('A barcode is required to cache this food.');
  const id = await foodCacheId(barcode);
  const encrypted = await encryptPayload(profileId, { ...food, barcode });
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const tx = db.transaction(STORE_FOODS, 'readwrite');
  tx.objectStore(STORE_FOODS).put({ id, updatedAt: new Date().toISOString(), _devicePayload: encrypted });
  await transactionDone(tx);
  return { ...food, barcode };
}

export async function getNutritionFood(profileId, barcode) {
  const id = await foodCacheId(barcode);
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const row = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_FOODS, 'readonly').objectStore(STORE_FOODS).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  if (!row?._devicePayload) return null;
  const food = await decryptPayload(profileId, row._devicePayload);
  if (!food) throw new NutritionStorageIntegrityError('A cached food record could not be decrypted.');
  return food;
}

export async function clearNutritionMeals(profileId) {
  const db = /** @type {IDBDatabase} */ (await openNutritionDB(profileId));
  const tx = db.transaction(STORE_MEALS, 'readwrite');
  tx.objectStore(STORE_MEALS).clear();
  await transactionDone(tx);
}

export async function setLocalNutritionSummary(profileId, summary) {
  const encrypted = await encryptPayload(profileId, summary || null);
  await writeMeta(profileId, SUMMARY_META, encrypted);
}

export async function getLocalNutritionSummary(profileId) {
  const encrypted = await readMeta(profileId, SUMMARY_META);
  if (!encrypted) return null;
  return decryptPayload(profileId, encrypted);
}

export async function setLocalNutritionComparison(profileId, comparison) {
  if (comparison == null) {
    await deleteMeta(profileId, COMPARISON_META);
    return null;
  }
  const encrypted = await encryptPayload(profileId, comparison);
  await writeMeta(profileId, COMPARISON_META, encrypted);
  return comparison;
}

export async function getLocalNutritionComparison(profileId) {
  const encrypted = await readMeta(profileId, COMPARISON_META);
  if (!encrypted) return null;
  return decryptPayload(profileId, encrypted);
}

export async function requestPersistentNutritionStorage() {
  try {
    if (typeof globalThis.navigator?.storage?.persist !== 'function') return false;
    return await globalThis.navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function deleteNutritionDB(profileId) {
  const name = databaseName(profileId);
  const cached = dbPromises.get(name);
  if (cached) {
    try { (await cached)?.close?.(); } catch {}
  }
  resetNutritionDB(profileId);
  if (typeof indexedDB === 'undefined') return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error || new Error('Meal data could not be deleted.'));
    request.onblocked = () => reject(new Error('Meal data deletion is blocked by another open tab.'));
  });
}

export async function buildNutritionArchive(profileId) {
  const meals = (await listNutritionMeals(profileId, { limit: 10000 }))
    .map(sanitizeNutritionMeal);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    includesPhotos: meals.some(meal => Array.isArray(meal?.images) ? meal.images.length > 0 : !!meal?.image),
    meals,
  };
}

const ARCHIVE_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/i;

function validateArchiveImageDataUrl(value, maxBytes, label) {
  if (typeof value !== 'string') throw new Error(`A meal ${label} has an invalid image.`);
  const match = value.match(ARCHIVE_IMAGE_PATTERN);
  if (!match) throw new Error(`A meal ${label} must be an embedded JPG, PNG, WebP, or GIF image.`);
  const encoded = match[2];
  if (!encoded || encoded.length % 4 === 1) throw new Error(`A meal ${label} contains malformed image data.`);
  const decodedBytes = Math.max(0, Math.floor((encoded.length * 3) / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0));
  if (decodedBytes > maxBytes) throw new Error(`A meal ${label} is too large to restore safely.`);
  return match[1].toLowerCase() === 'jpg' ? 'image/jpeg' : `image/${match[1].toLowerCase()}`;
}

function validateArchiveImage(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) throw new Error('A meal archive contains an invalid photo.');
  // Accept an embedded full image from a legacy portable archive only so the
  // archive can be recovered. putNutritionMeal strips it before any write.
  const dataType = image.dataUrl == null
    ? null
    : validateArchiveImageDataUrl(image.dataUrl, 8 * 1024 * 1024, 'photo');
  const thumbnailType = validateArchiveImageDataUrl(image.thumbnailUrl, 1024 * 1024, 'thumbnail');
  if (image.mediaType && ![dataType, thumbnailType].filter(Boolean).includes(String(image.mediaType).toLowerCase())) {
    throw new Error('A meal photo has inconsistent media metadata.');
  }
  if (image.fileName != null && (typeof image.fileName !== 'string' || image.fileName.length > 160)) {
    throw new Error('A meal photo has an invalid file name.');
  }
  for (const key of ['width', 'height', 'originalWidth', 'originalHeight']) {
    if (image[key] != null && (!Number.isFinite(Number(image[key])) || Number(image[key]) < 0 || Number(image[key]) > 50000)) {
      throw new Error('A meal photo has invalid dimensions.');
    }
  }
}

export async function restoreNutritionArchive(profileId, archive) {
  if (!archive) return 0;
  if (archive?.version !== 1 || !Array.isArray(archive?.meals)) {
    throw new Error('The Meals & Nutrition archive has an unsupported format.');
  }
  if (archive.meals.length > 10000) throw new Error('The Meals & Nutrition archive contains too many records.');
  const validatedMeals = archive.meals.map(meal => {
    if (!meal || typeof meal !== 'object' || Array.isArray(meal)) throw new Error('The Meals & Nutrition archive contains an invalid record.');
    const serialized = JSON.stringify(meal);
    if (serialized.length > 12 * 1024 * 1024) throw new Error('A meal record is too large to restore safely.');
    if (typeof meal.name !== 'string' || meal.name.length > 120) throw new Error('A meal record has an invalid name.');
    if (typeof meal.id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(meal.id)) throw new Error('A meal record has an invalid identifier.');
    if (!Number.isFinite(new Date(meal.eatenAt).getTime())) throw new Error('A meal record has an invalid date.');
    if (meal.images != null && !Array.isArray(meal.images)) throw new Error('A meal record has an invalid photo collection.');
    if (Array.isArray(meal.images) && meal.images.length > 4) throw new Error('A meal record contains too many photos.');
    for (const image of meal.images || []) validateArchiveImage(image);
    if (meal.image != null) validateArchiveImage(meal.image);
    if (Array.isArray(meal.components) && meal.components.length > 100) throw new Error('A meal record contains too many ingredients.');
    return meal;
  });
  let restored = 0;
  for (const meal of validatedMeals) {
    await putNutritionMeal(profileId, meal, { preserveUpdatedAt: true });
    restored += 1;
  }
  if (restored && state.currentProfile === profileId) {
    await reconcileNutritionMealsFromProfileData(profileId);
  }
  if (restored) await recomputeActiveSummary(profileId);
  return restored;
}

function mealFreshness(meal) {
  for (const value of [meal?.updatedAt, meal?.createdAt, meal?.eatenAt]) {
    const clock = Date.parse(value || '');
    if (Number.isFinite(clock)) return clock;
  }
  return 0;
}

function canonicalNutritionMeals(meals) {
  return (Array.isArray(meals) ? meals : [])
    .map(sanitizeNutritionMeal)
    .filter(meal => meal && typeof meal.id === 'string' && meal.id
      && Number.isFinite(Date.parse(meal.eatenAt || '')))
    .sort((a, b) => {
      const dateOrder = Date.parse(b.eatenAt) - Date.parse(a.eatenAt);
      return dateOrder || String(a.id).localeCompare(String(b.id));
    });
}

function alignActiveNutritionSurface(profileId, source) {
  const target = state.importedData;
  if (state.currentProfile !== profileId || !target || target === source) return;
  target.nutritionMeals = canonicalNutritionMeals(source.nutritionMeals);
  for (const key of TOMBSTONE_KEYS) {
    const from = source[key];
    const current = target[key];
    const hasNutrition = from && typeof from === 'object' && Object.hasOwn(from, 'nutritionMeals');
    if (hasNutrition) {
      const value = from.nutritionMeals;
      target[key] = { ...(current && typeof current === 'object' ? current : {}), nutritionMeals: Array.isArray(value) ? [...value] : value && typeof value === 'object' ? { ...value } : value };
    } else if (current && typeof current === 'object' && Object.hasOwn(current, 'nutritionMeals')) {
      const remaining = { ...current };
      delete remaining.nutritionMeals;
      if (Object.keys(remaining).length) target[key] = remaining;
      else delete target[key];
    }
  }
}

function mealSnapshot(value) {
  try { return JSON.stringify(value); } catch { return ''; }
}

async function persistNutritionProfileData(profileId, importedData) {
  const { saveImportedDataForProfile } = await import('./data.js');
  // Meal writes can outlive the initiating profile view. Persist the captured
  // profile snapshot explicitly so a mid-save switch cannot split the IDB
  // cache from the canonical sync surface or write profile A into profile B.
  return saveImportedDataForProfile(profileId, importedData, { forceProfileScope: true });
}

/**
 * Reconcile the encrypted IDB cache with the thumbnail-only importedData
 * surface. The one-time initialization union protects meals created by an old
 * device-local-only build; after that, synced tombstones are authoritative.
 */
export async function reconcileNutritionMealsFromProfileData(profileId = state.currentProfile) {
  if (!profileId || state.currentProfile !== profileId) return [];
  const importedData = state.importedData || (state.importedData = /** @type {any} */ ({}));
  const localMeals = await listNutritionMeals(profileId, { limit: 10000 });
  const initialized = await readMeta(profileId, PROFILE_SYNC_INITIALIZED_META) === true;
  const syncedMeals = canonicalNutritionMeals(importedData.nutritionMeals);
  const tombstones = new Set(Array.isArray(importedData?._deleted?.nutritionMeals)
    ? importedData._deleted.nutritionMeals
    : []);

  let desiredMeals = syncedMeals.filter(meal => !tombstones.has(meal.id));
  if (!initialized || !Array.isArray(importedData.nutritionMeals)) {
    const byId = new Map(desiredMeals.map(meal => [meal.id, meal]));
    for (const localMeal of canonicalNutritionMeals(localMeals)) {
      if (tombstones.has(localMeal.id)) continue;
      const existing = byId.get(localMeal.id);
      if (!existing || mealFreshness(localMeal) > mealFreshness(existing)) {
        byId.set(localMeal.id, localMeal);
      }
    }
    desiredMeals = canonicalNutritionMeals([...byId.values()]);
  }

  const stateChanged = mealSnapshot(importedData.nutritionMeals) !== mealSnapshot(desiredMeals);
  if (stateChanged) {
    importedData.nutritionMeals = desiredMeals;
    const saved = await persistNutritionProfileData(profileId, importedData);
    if (!saved) throw new Error('Meal data was cached locally but could not be prepared for cross-device sync.');
  }

  const localById = new Map(localMeals.map(meal => [meal.id, meal]));
  const desiredIds = new Set(desiredMeals.map(meal => meal.id));
  for (const localMeal of localMeals) {
    if (!desiredIds.has(localMeal.id)) await deleteNutritionMeal(profileId, localMeal.id);
  }
  for (const meal of desiredMeals) {
    const localMeal = localById.get(meal.id);
    const sanitizedLocalMeal = sanitizeNutritionMeal(localMeal);
    if (!localMeal
        || mealSnapshot(localMeal) !== mealSnapshot(sanitizedLocalMeal)
        || mealSnapshot(sanitizedLocalMeal) !== mealSnapshot(meal)) {
      await putNutritionMeal(profileId, meal, { preserveUpdatedAt: true });
    }
  }
  await writeMeta(profileId, PROFILE_SYNC_INITIALIZED_META, true);
  return desiredMeals;
}

async function recomputeActiveSummary(profileId, importedData = state.importedData) {
  const meals = await listNutritionMeals(profileId, { limit: 10000 });
  const sleepIntervals = await loadLocalSleepIntervals(profileId, { importedData }).catch(() => []);
  const wearableRevision = Object.values(importedData?.wearableConnections || {}).reduce(
    (latest, connection) => Math.max(latest, Number(connection?.lastSyncAt || 0)),
    0,
  );
  const summary = { ...computeNutritionSummary(meals, { sleepIntervals }), wearableRevision };
  await setLocalNutritionSummary(profileId, summary);
  if (state.currentProfile === profileId) {
    state.nutritionSummary = summary;
    notifyNutritionSummaryChanged(profileId, summary);
  }
  return { meals, summary };
}

function isUsableNutritionSummary(value) {
  return !!(value && typeof value === 'object' && value.windows?.d7 && Number.isFinite(Number(value.totalMeals)));
}

function notifyNutritionSummaryChanged(profileId, summary) {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
  try {
    globalThis.dispatchEvent(new globalThis.CustomEvent('labcharts-nutrition-summary-changed', {
      detail: { profileId, totalMeals: Number(summary?.totalMeals || 0) },
    }));
  } catch {}
}

function nutritionStorageRetryDelay() {
  return new Promise(resolve => setTimeout(resolve, 40));
}

async function hydrateNutritionSummaryOperation(profileId) {
  if (!profileId || state.currentProfile !== profileId) return null;
  state.nutritionSummary = null;
  const wearableRevision = Object.values(state.importedData?.wearableConnections || {}).reduce(
    (latest, connection) => Math.max(latest, Number(connection?.lastSyncAt || 0)),
    0,
  );
  let fallback = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const cached = await getLocalNutritionSummary(profileId);
      if (cached?.version === NUTRITION_SUMMARY_VERSION && isUsableNutritionSummary(cached)) fallback = cached;
      await reconcileNutritionMealsFromProfileData(profileId);
      if (state.currentProfile !== profileId) return null;
      if (cached?.version === NUTRITION_SUMMARY_VERSION && Number(cached?.wearableRevision || 0) === wearableRevision) {
        state.nutritionSummary = cached;
        notifyNutritionSummaryChanged(profileId, cached);
        return cached;
      }
      return (await recomputeActiveSummary(profileId)).summary;
    } catch (error) {
      lastError = error;
      resetNutritionDB(profileId);
      if (attempt < 2) await nutritionStorageRetryDelay();
    }
  }
  if (fallback && state.currentProfile === profileId) {
    state.nutritionSummary = fallback;
    notifyNutritionSummaryChanged(profileId, fallback);
    return fallback;
  }
  throw lastError || new Error('Saved nutrition data could not be loaded.');
}

export function hydrateNutritionSummary(profileId = state.currentProfile) {
  return queueNutritionOperation(() => hydrateNutritionSummaryOperation(profileId));
}

export async function refreshNutritionSummaryFromWearables(profileId = state.currentProfile) {
  if (state.currentProfile !== profileId || !state.nutritionSummary?.totalMeals) return null;
  return (await recomputeActiveSummary(profileId)).summary;
}

export async function listActiveProfileMeals(options = {}) {
  return listNutritionMeals(state.currentProfile, options);
}

export async function getActiveProfileMeal(id) {
  return getNutritionMeal(state.currentProfile, id);
}

export async function getActiveProfileFood(barcode) {
  return getNutritionFood(state.currentProfile, barcode);
}

export async function cacheActiveProfileFood(food) {
  return putNutritionFood(state.currentProfile, food);
}

export function saveActiveProfileMeal(meal) {
  const profileId = state.currentProfile;
  const importedData = state.importedData || (state.importedData = /** @type {any} */ ({}));
  return queueNutritionOperation(() => saveProfileMeal(profileId, importedData, meal));
}

async function saveProfileMeal(profileId, importedData, meal) {
  const previousLocalMeal = meal?.id
    ? await getNutritionMeal(profileId, String(meal.id))
    : null;
  const saved = await putNutritionMeal(profileId, meal);

  const previousMeals = importedData.nutritionMeals;
  const previousTombstoneSurfaces = new Map(TOMBSTONE_KEYS.map(key => [key, {
    had: Object.hasOwn(importedData, key),
    value: importedData[key],
  }]));
  for (const key of TOMBSTONE_KEYS) {
    const surface = importedData[key];
    if (!surface || typeof surface !== 'object') continue;
    importedData[key] = {
      ...surface,
      nutritionMeals: Array.isArray(surface.nutritionMeals)
        ? [...surface.nutritionMeals]
        : surface.nutritionMeals && typeof surface.nutritionMeals === 'object'
          ? { ...surface.nutritionMeals }
          : surface.nutritionMeals,
    };
  }

  const byId = new Map(canonicalNutritionMeals(importedData.nutritionMeals).map(item => [item.id, item]));
  byId.set(saved.id, sanitizeNutritionMeal(saved));
  importedData.nutritionMeals = canonicalNutritionMeals([...byId.values()]);
  clearTombstone(importedData, 'nutritionMeals', saved.id);
  let persisted = false;
  try {
    persisted = await persistNutritionProfileData(profileId, importedData);
  } catch {}
  if (!persisted) {
    importedData.nutritionMeals = previousMeals;
    for (const [key, previous] of previousTombstoneSurfaces) {
      if (previous.had) importedData[key] = previous.value;
      else delete importedData[key];
    }
    try {
      if (previousLocalMeal) await putNutritionMeal(profileId, previousLocalMeal, { preserveUpdatedAt: true });
      else await deleteNutritionMeal(profileId, saved.id);
    } catch (rollbackError) {
      console.warn('[nutrition] Could not roll back a failed canonical meal save:', rollbackError);
    }
    throw new Error('Meal could not be saved because its cross-device copy could not be persisted.');
  }
  alignActiveNutritionSurface(profileId, importedData);
  // Hydration may have reconciled an older profile snapshot while canonical
  // persistence was in flight. Re-assert the committed record so save success
  // always leaves the encrypted local cache aligned with canonical state.
  await putNutritionMeal(profileId, saved, { preserveUpdatedAt: true });
  await writeMeta(profileId, PROFILE_SYNC_INITIALIZED_META, true);
  await requestPersistentNutritionStorage();
  await recomputeActiveSummary(profileId, importedData);
  return saved;
}

export function deleteActiveProfileMeal(id) {
  const profileId = state.currentProfile;
  const importedData = state.importedData || (state.importedData = /** @type {any} */ ({}));
  return queueNutritionOperation(async () => {
    const previousMeals = importedData.nutritionMeals;
    const previousTombstoneSurfaces = new Map(TOMBSTONE_KEYS.map(key => [key, {
      had: Object.hasOwn(importedData, key),
      value: importedData[key],
    }]));
    const deleted = importedData._deleted && typeof importedData._deleted === 'object' ? importedData._deleted : {};
    importedData._deleted = {
      ...deleted,
      nutritionMeals: Array.isArray(deleted.nutritionMeals) ? [...deleted.nutritionMeals] : [],
    };
    for (const key of ['_deletedAt', '_deletedClearedAt']) {
      const surface = importedData[key];
      if (!surface || typeof surface !== 'object') continue;
      importedData[key] = {
        ...surface,
        nutritionMeals: surface.nutritionMeals && typeof surface.nutritionMeals === 'object'
          ? { ...surface.nutritionMeals }
          : surface.nutritionMeals,
      };
    }
    recordTombstone(importedData, 'nutritionMeals', String(id || ''));
    importedData.nutritionMeals = canonicalNutritionMeals(importedData.nutritionMeals)
      .filter(meal => meal.id !== id);
    const persisted = await persistNutritionProfileData(profileId, importedData);
    if (!persisted) {
      importedData.nutritionMeals = previousMeals;
      for (const [key, previous] of previousTombstoneSurfaces) {
        if (previous.had) importedData[key] = previous.value;
        else delete importedData[key];
      }
      throw new Error('Meal could not be deleted because its cross-device deletion could not be saved.');
    }
    alignActiveNutritionSurface(profileId, importedData);
    await writeMeta(profileId, PROFILE_SYNC_INITIALIZED_META, true);
    await deleteNutritionMeal(profileId, id);
    await recomputeActiveSummary(profileId, importedData);
  });
}
