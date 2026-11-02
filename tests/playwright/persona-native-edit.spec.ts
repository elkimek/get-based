import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

async function seed(page: import('@playwright/test').Page) {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => { (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; });
  await seedDashboardControlProfile(page);
  return page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).openChatPanel();
    const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
    await crypto._setTestSessionKey('synthetic native persona editor'); localStorage.setItem('labcharts-encryption-enabled', 'true');
    const key = storage.customPersonalityStorageKey(state.currentProfile), deletedKey = storage.customPersonalityTombstoneStorageKey(state.currentProfile);
    const target = { id: 'custom_edit', name: 'Synthetic reviewer', icon: '🌿', promptText: 'Synthetic original instructions', evidenceBased: true, futureField: { retained: true } };
    const other = { id: 'custom_keep', name: 'Synthetic retained persona', icon: 'K', promptText: 'Synthetic retained instructions', futureField: ['retained'] };
    await crypto.encryptedSetItem(key, JSON.stringify([target, other])); const personalities = await import('/js/chat-personalities.js'); await personalities.loadCustomPersonalities(); personalities.updatePersonalityBar();
    return { profile: state.currentProfile, key, deletedKey, target, other, raw: localStorage.getItem(key), deleted: localStorage.getItem(deletedKey), selection: state.currentChatPersonality, selectionRaw: localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`), index: localStorage.getItem(`labcharts-${state.currentProfile}-chat-threads`), history: JSON.stringify(state.chatHistory) };
  });
}
async function stored(page: import('@playwright/test').Page, key: string) {
  return page.evaluate(async key => JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem(key, { throwOnDecryptError: true }))!) as Array<Record<string, unknown>>, key);
}
for (const mode of ['create', 'edit', 'stale', 'unrelated', 'hosted', 'quota'] as const) test(`native persona ${mode} preserves exact record ownership and encrypted storage`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const before = await seed(page), health = await dashboardHealth(page);
  await page.locator('.chat-personality-current').click();
  if (mode === 'create') await page.locator('.chat-personality-add-btn').click();
  else if (mode === 'hosted') await page.evaluate(async () => (await import('/js/chat-personalities.js')).editCustomPersonality('custom_edit', { hostname: 'getbased.health' }));
  else await page.locator('.chat-personality-edit[data-chat-personality-id="custom_edit"]').click();
  await expect(page.locator('#chat-personality-editor-overlay')).toBeVisible();
  // A second read through the same native queue proves the editor's initial read finished.
  await page.evaluate(async create => { await (await import('/js/chat-personality-storage.js')).captureCustomPersonalityEdit(create ? null : 'custom_edit'); }, mode === 'create');
  await page.locator('#chat-personality-custom-name').fill(mode === 'create' ? 'Synthetic newly created persona' : 'Synthetic revised reviewer');
  await page.locator('#chat-personality-custom-prompt').fill('Synthetic accepted edited instructions');
  let expectedOther: Record<string, unknown> = before.other;
  if (mode === 'stale' || mode === 'unrelated') {
    expectedOther = mode === 'unrelated' ? { ...before.other, promptText: 'Newer unrelated instructions', anotherField: 7 } : before.other;
    await page.evaluate(async ({ before, mode, other }) => {
      const target = mode === 'stale' ? { ...before.target, promptText: 'Newer unseen target instructions' } : before.target;
      await (await import('/js/crypto.js')).encryptedSetItem(before.key, JSON.stringify([target, other]));
    }, { before, mode, other: expectedOther });
  }
  if (mode === 'hosted') {
    await expect(page.locator('.chat-personality-custom-save')).toBeDisabled();
    await page.evaluate(async () => (await import('/js/chat-personalities.js')).saveCustomPersonality()); expect(await page.evaluate(key => localStorage.getItem(key), before.key)).toBe(before.raw);
    await page.locator('#chat-personality-agreement-checkbox').check();
  }
  if (mode === 'quota') await page.evaluate(key => { const set = Storage.prototype.setItem; let fail = true; Storage.prototype.setItem = function(name,value){if(name===key&&fail){fail=false;throw new DOMException('Synthetic quota','QuotaExceededError');}return set.call(this,name,value);}; }, before.key);
  await page.locator('.chat-personality-custom-save').click();
  if (mode === 'quota') {
    await expect(page.locator('#notification-container')).toContainText('previous stored state was restored'); expect(await page.evaluate(key => localStorage.getItem(key), before.key)).toBe(before.raw);
    await expect(page.locator('#chat-personality-custom-prompt')).toHaveValue('Synthetic accepted edited instructions'); await expect(page.locator('.chat-personality-custom-save')).toBeEnabled(); await page.locator('.chat-personality-custom-save').click();
  }
  if (mode === 'stale') {
    await expect(page.locator('#notification-container')).toContainText('changed after the editor opened'); await expect(page.locator('#chat-personality-custom-prompt')).toHaveValue('Synthetic accepted edited instructions');
    expect(await stored(page, before.key)).toEqual([{ ...before.target, promptText: 'Newer unseen target instructions' }, before.other]);
  } else {
    await expect(page.locator('#chat-personality-editor-overlay')).toHaveCount(0); const after = await stored(page, before.key);
    if (mode === 'create') { expect(after.slice(0, 2)).toEqual([before.target, before.other]); expect(after[2]).toMatchObject({ name: 'Synthetic newly created persona', promptText: 'Synthetic accepted edited instructions', evidenceBased: false }); }
    else { expect(after[0]).toMatchObject({ ...before.target, name: 'Synthetic revised reviewer', promptText: 'Synthetic accepted edited instructions' }); expect(after[1]).toEqual(expectedOther); if (mode === 'hosted') expect(after[0]?.personaAgreement).toMatchObject({ accepted: true, version: 1, host: 'getbased.health' }); }
    expect(await page.evaluate(key => localStorage.getItem(key), before.key)).toMatch(/^v1:/);
  }
  const stable = await page.evaluate(async before => {
    const { state } = await import('/js/state.js'); return { deleted: localStorage.getItem(before.deletedKey), selection: state.currentChatPersonality, selectionRaw: localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`), index: localStorage.getItem(`labcharts-${state.currentProfile}-chat-threads`), history: JSON.stringify(state.chatHistory), journal: await (await import('/js/blob-storage.js')).getBlob(`labcharts-${before.profile}-persona-transaction`) };
  }, before);
  expect(stable).toEqual({ deleted: before.deleted, selection: before.selection, selectionRaw: before.selectionRaw, index: before.index, history: before.history, journal: null }); expect(await dashboardHealth(page)).toBe(health); expect(errors).toEqual([]);
});

test('a completed native Save retains newer unsaved inputs and renews the same record for the next Save', async ({ page }) => {
  await routeJavaScript(page, '**/js/crypto.js', `export * from '/js/crypto.js?persona-edit-original';import * as real from '/js/crypto.js?persona-edit-original';export async function prepareEncryptedLocalStorageValue(key,text){const prepared=await real.prepareEncryptedLocalStorageValue(key,text);if(key.endsWith('-chatPersonalityCustom')&&window.pausePersonaEdit){window.pausePersonaEdit=false;document.documentElement.dataset.personaEditPrepared='true';await new Promise(resolve=>window.releasePersonaEdit=resolve);}return prepared;}`);
  const before = await seed(page), health = await dashboardHealth(page);
  await page.locator('.chat-personality-current').click(); await page.locator('.chat-personality-edit[data-chat-personality-id="custom_edit"]').click(); await expect(page.locator('#chat-personality-custom-prompt')).toBeVisible();
  await page.locator('#chat-personality-custom-prompt').fill('First accepted instructions'); await page.evaluate(() => { (window as unknown as { pausePersonaEdit: boolean }).pausePersonaEdit = true; }); await page.locator('.chat-personality-custom-save').click();
  await expect(page.locator('html')).toHaveAttribute('data-persona-edit-prepared', 'true'); expect(await stored(page, before.key)).toEqual([before.target, before.other]);
  await page.locator('#chat-personality-custom-prompt').fill('Newer unsaved instructions'); await page.evaluate(() => (window as unknown as { releasePersonaEdit: () => void }).releasePersonaEdit());
  await expect(page.locator('.chat-personality-custom-save')).toBeEnabled(); await expect(page.locator('#chat-personality-custom-prompt')).toHaveValue('Newer unsaved instructions'); expect((await stored(page, before.key))[0]?.promptText).toBe('First accepted instructions');
  await page.locator('.chat-personality-custom-save').click(); await expect(page.locator('#chat-personality-editor-overlay')).toHaveCount(0); const after = await stored(page, before.key); expect(after).toHaveLength(2); expect(after[0]).toMatchObject({ ...before.target, promptText: 'Newer unsaved instructions' }); expect(after[1]).toEqual(before.other); expect(await dashboardHealth(page)).toBe(health);
});
for (const mode of ['edit', 'delete'] as const) test(`legacy literal persona native ${mode} remains usable`, async ({ page }) => {
  const before = await seed(page), health = await dashboardHealth(page);
  await page.evaluate(async key => { localStorage.setItem(key, '"Quoted legacy native instructions"'); const p = await import('/js/chat-personalities.js'); await p.loadCustomPersonalities(); p.updatePersonalityBar(); }, before.key);
  await page.locator('.chat-personality-current').click();
  if (mode === 'edit') {
    await page.locator('.chat-personality-edit[data-chat-personality-id="custom_migrated"]').click(); await expect(page.locator('#chat-personality-custom-prompt')).toHaveValue('"Quoted legacy native instructions"');
    await page.locator('#chat-personality-custom-name').fill('Updated legacy reviewer'); await page.locator('#chat-personality-custom-prompt').fill('Updated legacy instructions'); await page.locator('.chat-personality-custom-save').click(); await expect(page.locator('#chat-personality-editor-overlay')).toHaveCount(0);
    expect(await stored(page, before.key)).toEqual([expect.objectContaining({ id: 'custom_migrated', name: 'Updated legacy reviewer', promptText: 'Updated legacy instructions' })]);
  } else {
    await page.locator('.chat-personality-delete[data-chat-personality-id="custom_migrated"]').click(); await expect(page.locator('#confirm-dialog-overlay')).toBeVisible(); await page.locator('#confirm-ok').click(); await expect(page.locator('.chat-personality-opt[data-personality="custom_migrated"]')).toHaveCount(0); expect(await stored(page, before.key)).toEqual([]);
  }
  expect(await dashboardHealth(page)).toBe(health);
});
