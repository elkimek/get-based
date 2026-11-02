import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';

for (const mode of ['confirm', 'cancel', 'stale', 'quota'] as const) test(`native encrypted persona deletion ${mode} preserves other records`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => { (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; });
  await seedDashboardControlProfile(page);
  const health = await dashboardHealth(page);
  const before = await page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).openChatPanel();
    const { state } = await import('/js/state.js'), protection = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
    await protection._setTestSessionKey('synthetic persona browser key'); localStorage.setItem('labcharts-encryption-enabled', 'true');
    const catalogKey = storage.customPersonalityStorageKey(state.currentProfile), deletedKey = storage.customPersonalityTombstoneStorageKey(state.currentProfile);
    const records = [{ id: 'custom_remove', name: 'Synthetic remove', icon: 'R', promptText: 'Remove only these instructions.' }, { id: 'custom_keep', name: 'Synthetic keep', icon: 'K', promptText: 'Keep these instructions.', futureField: { keep: true } }];
    await protection.encryptedSetItem(catalogKey, JSON.stringify(records)); await protection.encryptedSetItem(deletedKey, JSON.stringify({ custom_previous: 100 }));
    const personalities = await import('/js/chat-personalities.js'); await personalities.loadCustomPersonalities(); personalities.updatePersonalityBar();
    return { catalogKey, deletedKey, records, catalog: localStorage.getItem(catalogKey), deleted: localStorage.getItem(deletedKey), selection: state.currentChatPersonality, history: JSON.stringify(state.chatHistory) };
  });
  await page.locator('.chat-personality-current').click();
  await page.locator('.chat-personality-delete[data-chat-personality-id="custom_remove"]').click();
  await expect(page.locator('#confirm-dialog-overlay')).toBeVisible();
  await expect(page.locator('#confirm-dialog-overlay')).toContainText('Delete "Synthetic remove"?');
  let expectedCatalog = before.catalog;
  if (mode === 'stale') expectedCatalog = await page.evaluate(async before => {
    const records = [{ ...before.records[0]!, name: 'Newer synthetic edit' }, before.records[1]!];
    await (await import('/js/crypto.js')).encryptedSetItem(before.catalogKey, JSON.stringify(records)); return localStorage.getItem(before.catalogKey);
  }, before);
  if (mode === 'quota') await page.evaluate(key => {
    const set = Storage.prototype.setItem; let fail = true;
    Storage.prototype.setItem = function (name, value) { if (name === key && fail) { fail = false; throw new DOMException('Synthetic quota', 'QuotaExceededError'); } return set.call(this, name, value); };
  }, before.deletedKey);
  await page.locator(mode === 'cancel' ? '#confirm-cancel' : '#confirm-ok').click();
  await expect(page.locator('#confirm-dialog-overlay')).not.toBeVisible();
  if (mode === 'confirm') await expect(page.locator('.chat-personality-opt[data-personality="custom_remove"]')).toHaveCount(0);
  if (mode === 'quota') await expect(page.locator('#notification-container')).toContainText('previous stored state was restored');
  if (mode === 'stale') await expect(page.locator('#notification-container')).toContainText('Nothing was deleted');
  const after = await page.evaluate(async before => {
    const protection = await import('/js/crypto.js'), { state } = await import('/js/state.js');
    return { catalog: localStorage.getItem(before.catalogKey), deleted: localStorage.getItem(before.deletedKey), records: JSON.parse((await protection.encryptedGetItem(before.catalogKey, { throwOnDecryptError: true }))!), tombstones: JSON.parse((await protection.encryptedGetItem(before.deletedKey, { throwOnDecryptError: true }))!), selection: state.currentChatPersonality, history: JSON.stringify(state.chatHistory) };
  }, before);
  if (mode === 'confirm') {
    expect(after.records).toEqual([before.records[1]]); expect(after.tombstones.custom_previous).toBe(100); expect(after.tombstones.custom_remove).toBeGreaterThan(0);
    expect(after.catalog).toMatch(/^v1:/); expect(after.catalog).not.toContain('instructions');
  } else { expect(after.catalog).toBe(expectedCatalog); expect(after.deleted).toBe(before.deleted); }
  expect(after.selection).toBe(before.selection); expect(after.history).toBe(before.history); expect(await dashboardHealth(page)).toBe(health); expect(errors).toEqual([]);
});

test('native persona deletion waits for another tab and refuses its newer catalog after the lock releases', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page); const health = await dashboardHealth(page);
  const owner = await page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).openChatPanel();
    const { state } = await import('/js/state.js'), personalities = await import('/js/chat-personalities.js'), storage = await import('/js/chat-personality-storage.js');
    await personalities.saveCustomPersonalities([{ id: 'custom_wait', name: 'Wait for lock', icon: 'W', promptText: 'Synthetic original' }]); personalities.updatePersonalityBar();
    return { profile: state.currentProfile, key: storage.customPersonalityStorageKey(state.currentProfile), deletedKey: storage.customPersonalityTombstoneStorageKey(state.currentProfile) };
  });
  await page.locator('.chat-personality-current').click(); await page.locator('.chat-personality-delete[data-chat-personality-id="custom_wait"]').click(); await expect(page.locator('#confirm-dialog-overlay')).toBeVisible();
  const holder = await context.newPage(); holder.on('pageerror', error => errors.push(error.message)); await holder.goto('/app'); await holder.locator('html[data-app-ready]').waitFor();
  const lock = `getbased-personas-${owner.profile}`;
  const held = holder.evaluate(async lock => {
    await navigator.locks.request(lock, async () => {
      const fixture = window as unknown as { personaLockReady: boolean; releasePersonaLock: () => void };
      fixture.personaLockReady = true; await new Promise<void>(resolve => { fixture.releasePersonaLock = resolve; });
    });
  }, lock);
  try {
    await expect.poll(() => holder.evaluate(() => (window as unknown as { personaLockReady?: boolean }).personaLockReady === true)).toBe(true);
    await page.bringToFront();
    await page.locator('#confirm-ok').click();
    await expect.poll(() => holder.evaluate(async lock => (await navigator.locks.query()).pending?.filter(item => item.name === lock).length, lock)).toBe(1);
    const newer = JSON.stringify([{ id: 'custom_wait', name: 'Newer edit from another tab', icon: 'W', promptText: 'Synthetic new instructions', retainedUnknown: true }]);
    await Promise.all([
      expect(page.locator('#notification-container')).toContainText('Nothing was deleted'),
      holder.evaluate(({ key, newer }) => { localStorage.setItem(key, newer); (window as unknown as { releasePersonaLock: () => void }).releasePersonaLock(); }, { key: owner.key, newer }),
      held,
    ]);
    expect(await page.evaluate(key => localStorage.getItem(key), owner.key)).toBe(newer); expect(await page.evaluate(key => localStorage.getItem(key), owner.deletedKey)).toBeNull(); expect(await dashboardHealth(page)).toBe(health); expect(errors).toEqual([]);
  } finally {
    await holder.evaluate(() => (window as unknown as { releasePersonaLock?: () => void }).releasePersonaLock?.()); await held; await holder.close();
  }
});
