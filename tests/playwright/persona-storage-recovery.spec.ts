import { expect, test, startPageCoverage, stopPageCoverage } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

for (const stage of ['journal', 'catalog', 'pair', 'committed'] as const) test(`encrypted persona recovery after closing a tab at ${stage}`, async ({ page, context }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => { (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; });
  if (stage === 'pair') await routeJavaScript(page, '**/js/crypto.js', `
    export * from '/js/crypto.js?persona-recovery-original';
    import * as real from '/js/crypto.js?persona-recovery-original';
    export async function encryptedGetItem(key,options){
      const profile=(await import('/js/state.js')).state.currentProfile;
      if(key==='labcharts-'+profile+'-chatPersonalityCustom'&&localStorage.getItem('labcharts-'+profile+'-persona-transaction-pending')){
        document.documentElement.dataset.personaInterrupted='pair';await new Promise(()=>{});
      }return real.encryptedGetItem(key,options);
    }`);
  else await routeJavaScript(page, '**/js/blob-storage.js', `
    export * from '/js/blob-storage.js?persona-recovery-original';
    import * as real from '/js/blob-storage.js?persona-recovery-original';
    const stage=${JSON.stringify(stage)};
    export async function compareAndSwapBlob(key,expected,next){
      if(stage==='committed'&&next===null&&key.endsWith('-persona-transaction')){document.documentElement.dataset.personaInterrupted=stage;await new Promise(()=>{});}
      const changed=await real.compareAndSwapBlob(key,expected,next);
      if(stage==='journal'&&next!==null&&changed&&key.endsWith('-persona-transaction')){document.documentElement.dataset.personaInterrupted=stage;await new Promise(()=>{});}return changed;
    }
    export async function getBlob(key){if(stage==='catalog'&&key.endsWith('-persona-transaction')&&document.documentElement.dataset.personaCatalogFailed==='true'){document.documentElement.dataset.personaInterrupted=stage;await new Promise(()=>{});}return real.getBlob(key);}
  `);
  await seedDashboardControlProfile(page); const health = await dashboardHealth(page);
  const before = await page.evaluate(async stage => {
    await (await import('/js/chat-panel.js')).openChatPanel();
    const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
    const salt = await crypto._setTestSessionKey('Synthetic persona recovery passphrase!');
    if (!salt) throw new Error('Synthetic key setup failed.');
    localStorage.setItem('labcharts-encryption-salt', btoa(String.fromCharCode(...salt))); localStorage.setItem('labcharts-encryption-enabled', 'true');
    const catalog = storage.customPersonalityStorageKey(state.currentProfile), deleted = storage.customPersonalityTombstoneStorageKey(state.currentProfile);
    const records = [{ id: 'custom_interrupt', name: 'Synthetic interrupted persona', icon: 'I', promptText: 'Private synthetic interrupted prompt' }, { id: 'custom_keep', name: 'Synthetic retained persona', icon: 'K', promptText: 'Private synthetic retained prompt', retainedUnknown: true }];
    await crypto.encryptedSetItem(catalog, JSON.stringify(records)); await crypto.encryptedSetItem(deleted, '{"custom_previous":100}');
    const personalities = await import('/js/chat-personalities.js'); await personalities.loadCustomPersonalities(); personalities.updatePersonalityBar();
    if (stage === 'catalog') {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key,value){if(key===deleted&&localStorage.getItem('labcharts-'+state.currentProfile+'-persona-transaction-pending')){document.documentElement.dataset.personaCatalogFailed='true';throw new Error('Synthetic interrupted second write');}return set.call(this,key,value);};
    }
    return { profile: state.currentProfile, catalog, deleted, records, rawCatalog: localStorage.getItem(catalog), rawDeleted: localStorage.getItem(deleted) };
  }, stage);
  await page.locator('.chat-personality-current').click(); await page.locator('.chat-personality-delete[data-chat-personality-id="custom_interrupt"]').click();
  await expect(page.locator('#confirm-dialog-overlay')).toBeVisible(); await page.locator('#confirm-ok').click();
  await expect(page.locator('html')).toHaveAttribute('data-persona-interrupted', stage);
  const interrupted = await page.evaluate(async before => {
    const raw = await (await import('/js/blob-storage.js?persona-recovery-original')).getBlob<unknown>(`labcharts-${before.profile}-persona-transaction`);
    if (!raw || typeof raw !== 'object' || !('sealed' in raw) || typeof raw.sealed !== 'boolean' || !('payload' in raw)) throw new Error('The synthetic journal envelope is missing.');
    const record = raw;
    return { sealed: record.sealed, serialized: JSON.stringify(raw), journal: await (await import('/js/crypto.js')).decryptObject<{ phase: string }>(record.payload), catalog: localStorage.getItem(before.catalog), deleted: localStorage.getItem(before.deleted) };
  }, before);
  expect(interrupted.sealed).toBe(true); expect(interrupted.serialized).not.toContain('Private synthetic');
  expect(interrupted.journal?.phase).toBe(stage === 'committed' ? 'committed' : 'prepared');
  expect(interrupted.catalog === before.rawCatalog).toBe(stage === 'journal'); expect(interrupted.deleted === before.rawDeleted).toBe(stage === 'journal' || stage === 'catalog');
  await stopPageCoverage(page, testInfo, 'interrupted-persona-owner'); await page.close();
  const reopened = await context.newPage(); reopened.on('pageerror', error => errors.push(error.message)); await startPageCoverage(reopened);
  try {
    await reopened.route('https://**/*', route => route.abort()); await reopened.goto('/app');
    await expect(reopened.locator('#passphrase-unlock-input')).toBeVisible(); await reopened.locator('#passphrase-unlock-input').fill('Synthetic persona recovery passphrase!'); await reopened.locator('#passphrase-unlock-btn').click();
    await reopened.locator('html[data-app-ready]').waitFor();
    const after = await reopened.evaluate(async before => {
      const crypto = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
      return { records: JSON.parse((await crypto.encryptedGetItem(before.catalog, { throwOnDecryptError: true }))!), tombstones: JSON.parse((await crypto.encryptedGetItem(before.deleted, { throwOnDecryptError: true }))!), rawCatalog: localStorage.getItem(before.catalog), rawDeleted: localStorage.getItem(before.deleted), journal: await (await import('/js/blob-storage.js')).getBlob(`labcharts-${before.profile}-persona-transaction`), fence: localStorage.getItem(`labcharts-${before.profile}-persona-transaction-pending`), visible: await storage.loadCustomPersonalitiesFromStorage(before.profile) };
    }, before);
    if (stage === 'committed') { expect(after.records).toEqual([before.records[1]]); expect(after.tombstones.custom_interrupt).toBeGreaterThan(0); }
    else { expect(after.rawCatalog).toBe(before.rawCatalog); expect(after.rawDeleted).toBe(before.rawDeleted); expect(after.records).toEqual(before.records); }
    expect(after.journal).toBeNull(); expect(after.fence).toBeNull(); expect(after.visible.map(item => item.id)).toEqual(stage === 'committed' ? ['custom_keep'] : ['custom_interrupt','custom_keep']); expect(await dashboardHealth(reopened)).toBe(health); expect(errors).toEqual([]);
    await reopened.evaluate(async () => { await (await import('/js/chat-panel.js')).openChatPanel(); }); await reopened.locator('.chat-personality-current').click();
    await expect(reopened.locator('.chat-personality-opt[data-personality="custom_keep"]')).toBeVisible(); await expect(reopened.locator('.chat-personality-opt[data-personality="custom_interrupt"]')).toHaveCount(stage === 'committed' ? 0 : 1);
  } finally { await stopPageCoverage(reopened, testInfo, 'reopened-persona-owner'); await reopened.close(); }
});
