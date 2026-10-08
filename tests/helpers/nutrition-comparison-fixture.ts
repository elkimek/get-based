import type { Page } from '@playwright/test';

// Persisted benchmark metadata is intentionally outside the synced profile.
export function nutritionComparisonFixture() {
  const analysis = { mealName: 'Reviewed comparison lunch', components: [{ name: 'Rice', quantityG: 150 }, { name: 'Beans', quantityG: 50 }], nutrients: { energyKcal: 400, proteinG: 0, carbohydrateG: 70, fatG: 10, sodiumMg: 120, vitaminCMg: 0 }, warnings: ['Review salt'], assumptions: ['Reviewed portions', 'Review salt'] };
  const route = { provider: 'ollama', model: 'fixture-vision' } as const;
  return { version: 1, savedAt: '2026-10-08T12:00:00.000Z', referenceRunIndex: null, manualReference: { mealName: analysis.mealName, ingredients: ['Rice', 'Beans'], totalWeightG: 200, energyKcal: 400, proteinG: 0, carbohydrateG: 70, fatG: 10, sodiumMg: 100, vitaminCMg: 0 }, runContext: null,
    runs: [
      { route, providerLabel: 'Local AI', modelLabel: 'Fixture precise', status: 'complete', durationMs: 1200, result: { analysis, source: { provider: 'ollama', usage: { inputTokens: 100, outputTokens: 50 } } } },
      { route: { ...route, model: 'fixture-other' }, providerLabel: 'Local AI', modelLabel: 'Fixture alternative', status: 'complete', durationMs: 2500, result: { analysis: { ...analysis, mealName: 'Alternative lunch', nutrients: { energyKcal: 600, proteinG: 0, carbohydrateG: 105, fatG: 15, sodiumMg: 200 }, components: Array.from({ length: 8 }, (_, index) => ({ name: `Ingredient ${index + 1}`, quantityG: 30 })) } } },
      { route: { ...route, model: 'fixture-failed' }, providerLabel: 'Local AI', modelLabel: 'Fixture failed', status: 'error', durationMs: 500, result: null, error: 'Provider unavailable <literal>' },
    ] };
}

// Browser-serializable fixture/read ports use the actual AES-GCM cache envelope;
// acceptance never imports source URLs that static production assembly prunes.
export async function encryptedComparisonFixture({ snapshot, read = false }: { snapshot?: unknown; read?: boolean }) {
  const open = indexedDB.open('getbased-nutrition-default', 3);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('meals')) { const meals = db.createObjectStore('meals', { keyPath: 'id' }); meals.createIndex('by_eaten_at', 'eatenAt'); }
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
  };
  const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  async function get(key: string) {
    const tx = db.transaction('meta', 'readonly'), request = tx.objectStore('meta').get(key);
    return new Promise<unknown>((resolve, reject) => { tx.oncomplete = () => resolve(request.result?.value); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error || request.error); });
  }
  try {
    let key = await get('meal-device-key:v1') as CryptoKey | undefined;
    if (read) {
      const envelope = await get('nutrition-comparison:v1') as { iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer } | undefined;
      if (!envelope) return null;
      if (!key) throw new Error('Comparison cache is missing its device key');
      return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: envelope.iv }, key, envelope.ciphertext))) as unknown;
    }
    key ||= await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(snapshot)));
    const tx = db.transaction('meta', 'readwrite'), store = tx.objectStore('meta');
    store.put({ k: 'meal-device-key:v1', value: key }); store.put({ k: 'nutrition-comparison:v1', value: { version: 1, iv, ciphertext } });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    return null;
  } finally { db.close(); }
}
export async function openNutritionBenchmarkFromInsight(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click();
  await expectVisible(page, '[data-context-cards-view]');
  await page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]').click();
  await expectVisible(page, '[data-nutrition-history-view]');
  await page.locator('[data-nutrition-history-view] [data-nutrition-action="open"]').click();
  await page.getByRole('tab', { name: 'Photo', exact: true }).click();
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await expectVisible(page, '[data-nutrition-comparison-view]');
}
async function expectVisible(page: Page, selector: string) { await page.locator(selector).waitFor({ state: 'visible', timeout: 10000 }); }
export async function readComparisonAcceptanceProfile() {
  const request = indexedDB.open('labcharts-blobs', 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
    return await new Promise<unknown>((resolve, reject) => { tx.oncomplete = () => typeof read.result === 'string' ? resolve(JSON.parse(read.result)) : reject(new Error('Missing committed profile')); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error || read.error); });
  } finally { db.close(); }
}
