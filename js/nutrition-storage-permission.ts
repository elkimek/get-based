// Origin-wide optional eviction protection, independent of meal commit success.
let persistentStorageRequest: Promise<boolean> | null = null;

export function requestPersistentNutritionStorage(): Promise<boolean> {
  // The browser may keep this permission request pending. Share it across
  // meal writes, while allowing a later request after denial or failure.
  if (persistentStorageRequest) return persistentStorageRequest;
  persistentStorageRequest = Promise.resolve().then(async () => {
    try {
      if (typeof globalThis.navigator?.storage?.persist !== 'function') return false;
      return await globalThis.navigator.storage.persist();
    } catch {
      return false;
    }
  }).finally(() => { persistentStorageRequest = null; });
  return persistentStorageRequest;
}
