// Browser-serializable, read-only acceptance port for the real encrypted meal cache.
// Static assembly intentionally prunes canonical source-module URLs.
export async function readEncryptedNutritionMeals() {
  type Envelope = { version: number; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
  type Row = { id: string; eatenAt: string; updatedAt: string; _devicePayload: Envelope };
  const request = indexedDB.open('getbased-nutrition-default', 3);
  request.onupgradeneeded = () => request.transaction?.abort();
  const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    const tx = db.transaction(['meta', 'meals'], 'readonly');
    const keyRead = tx.objectStore('meta').get('meal-device-key:v1'), mealsRead = tx.objectStore('meals').getAll();
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error || keyRead.error || mealsRead.error); });
    const key = keyRead.result?.value as CryptoKey | undefined, rows = mealsRead.result as Row[];
    if (!key || key.algorithm.name !== 'AES-GCM') throw new Error('Meal cache is missing its AES-GCM device key');
    return Promise.all(rows.map(async row => {
      if (Object.keys(row).sort().join(',') !== '_devicePayload,eatenAt,id,updatedAt' || row._devicePayload?.version !== 1) throw new Error('Meal cache contains a non-envelope record');
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row._devicePayload.iv }, key, row._devicePayload.ciphertext);
      const payload = JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
      return { id: row.id, eatenAt: row.eatenAt, updatedAt: row.updatedAt, ...payload };
    }));
  } finally { db.close(); }
}
