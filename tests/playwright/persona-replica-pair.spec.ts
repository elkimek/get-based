import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';

for (const mode of ['sync', 'sync-edit', 'quota', 'import', 'import-deleted', 'import-existing', 'sync-contention', 'import-contention'] as const) test(`encrypted persona replica pair: ${mode}`, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort());
  await page.addInitScript(() => { (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; });
  await seedDashboardControlProfile(page);
  const health = await dashboardHealth(page);
  const before = await page.evaluate(async mode => {
    await (await import('/js/chat-panel.js')).openChatPanel();
    const { state } = await import('/js/state.js'), protection = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
    await protection._setTestSessionKey('Synthetic persona replica browser key'); localStorage.setItem('labcharts-encryption-enabled', 'true');
    const catalog = storage.customPersonalityStorageKey(state.currentProfile), deleted = storage.customPersonalityTombstoneStorageKey(state.currentProfile);
    const local = { id: 'custom_native', name: 'Synthetic native', icon: 'N', promptText: 'Private synthetic native instructions', updatedAt: '2090-01-01', createdAt: null, opaque: { native: ['keep', null] } };
    const remote = { id: mode === 'sync-edit' ? local.id : 'custom_remote', name: 'Synthetic portable', icon: 'R', promptText: 'Private synthetic remote instructions', updatedAt: '2090-01-02', remoteExtension: { retained: true } };
    if (mode === 'import' || mode === 'import-deleted' || mode === 'import-contention') localStorage.removeItem(catalog);
    else await protection.encryptedSetItem(catalog, JSON.stringify([local]));
    if (mode === 'import') localStorage.removeItem(deleted);
    else await protection.encryptedSetItem(deleted, JSON.stringify(mode === 'import-deleted' ? { [remote.id]: Date.parse('2091-01-01') } : { custom_previous: 100 }));
    const newer = { ...local, name: 'Newer retained native', updatedAt: '2095-01-01', opaque: { native: ['newer', null] } };
    const replacement = await protection.prepareEncryptedLocalStorageValue(catalog, JSON.stringify([newer]));
    return { profile: state.currentProfile, catalog, deleted, local, remote, newer, replacement: replacement.value, rawCatalog: localStorage.getItem(catalog), rawDeleted: localStorage.getItem(deleted), preference: localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`), history: JSON.stringify(state.chatHistory) };
  }, mode);
  let holder: import('@playwright/test').Page | null = null;
  if (mode.endsWith('contention')) {
    holder = await context.newPage(); await holder.goto('/app');
    await holder.evaluate(profile => {
      const fixture = window as unknown as { holdingPersona?: Promise<unknown>; personaLockHeld?: boolean; releasePersonaLock?: () => void };
      fixture.holdingPersona = navigator.locks.request(`getbased-personas-${profile}`, { mode: 'exclusive' }, async () => { fixture.personaLockHeld = true; await new Promise<void>(resolve => { fixture.releasePersonaLock = resolve; }); });
    }, before.profile);
    await expect.poll(() => holder!.evaluate(() => !!(window as unknown as { personaLockHeld?: boolean }).personaLockHeld)).toBe(true);
  }
  if (mode === 'quota') await page.evaluate(deleted => {
    const set = Storage.prototype.setItem; let fail = true;
    Storage.prototype.setItem = function (key, text) { if (key === deleted && fail) { fail = false; throw new DOMException('Synthetic pair quota', 'QuotaExceededError'); } return set.call(this, key, text); };
  }, before.deleted);
  if (mode === 'import' || mode === 'import-existing' || mode === 'import-deleted') {
    await page.evaluate(async before => {
      const backup = { version: 2, entries: [], chat: { threads: [], messages: {}, customPersonalities: [before.remote], customPersonalityDeleted: { custom_remote_previous: 200 } } };
      await (await import('/js/export.js')).importDataJSON(new File([JSON.stringify(backup)], 'synthetic-personas.json', { type: 'application/json' }));
    }, before);
    await expect(page.locator('#notification-container')).toContainText('Imported');
  } else {
    await page.evaluate(({ mode, before }) => {
      const fixture = window as unknown as { personaReplicaDone?: boolean; personaReplicaResult?: unknown; personaReplicaFailure?: { uncertain: boolean; message: string } };
      fixture.personaReplicaDone = false;
      const input = { customPersonalities: [before.remote], customPersonalityDeleted: { custom_remote_previous: 200 } };
      const run = async () => mode === 'import-contention'
        ? (await import('/js/chat-personality-storage.js')).mergeCustomPersonalitiesFromReplica(input, before.profile, 'import')
        : (await import('/js/sync-chat-apply.js')).applyChatData(before.profile, { threads: [], messages: {}, ...input });
      void run().then(result => { fixture.personaReplicaResult = result; }, error => { fixture.personaReplicaFailure = { uncertain: !!error.persistenceUncertain, message: String(error.message) }; }).finally(() => { fixture.personaReplicaDone = true; });
    }, { mode, before });
    if (holder) {
      await expect.poll(() => page.evaluate(async profile => (await navigator.locks.query()).pending?.filter(lock => lock.name === `getbased-personas-${profile}`).length || 0, before.profile)).toBeGreaterThan(0);
      expect(await page.evaluate(catalog => localStorage.getItem(catalog), before.catalog)).toBe(before.rawCatalog);
      await holder.evaluate(async before => {
        localStorage.setItem(before.catalog, before.replacement);
        const fixture = window as unknown as { releasePersonaLock: () => void; holdingPersona: Promise<unknown> }; fixture.releasePersonaLock(); await fixture.holdingPersona;
      }, before); await holder.close();
    }
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { personaReplicaDone?: boolean }).personaReplicaDone)).toBe(true);
  }
  const after = await page.evaluate(async before => {
    const protection = await import('/js/crypto.js'), { state } = await import('/js/state.js');
    const fixture = window as unknown as { personaReplicaFailure?: unknown };
    const catalogText = await protection.encryptedGetItem(before.catalog, { throwOnDecryptError: true }), deletedText = await protection.encryptedGetItem(before.deleted, { throwOnDecryptError: true });
    await (await import('/js/chat-personalities.js')).loadCustomPersonalities();
    return { rawCatalog: localStorage.getItem(before.catalog), rawDeleted: localStorage.getItem(before.deleted), records: JSON.parse(catalogText || '[]') as Array<Record<string, unknown>>, tombstones: JSON.parse(deletedText || '{}') as Record<string, number>, failure: fixture.personaReplicaFailure, history: JSON.stringify(state.chatHistory), preference: localStorage.getItem(`labcharts-${before.profile}-chatPersonality`), journal: await (await import('/js/blob-storage.js')).getBlob(`labcharts-${before.profile}-persona-transaction`), fence: localStorage.getItem(`labcharts-${before.profile}-persona-transaction-pending`) };
  }, before);
  if (mode === 'quota') {
    expect(after.failure).toEqual({ uncertain: false, message: 'The persona change could not be saved. Its previous stored state was restored.' }); expect(after.rawCatalog).toBe(before.rawCatalog); expect(after.rawDeleted).toBe(before.rawDeleted);
  } else {
    expect(after.failure).toBeUndefined();
    if (mode === 'sync') expect(after.records).toEqual([before.local, before.remote]);
    if (mode === 'sync-edit') expect(after.records).toEqual([{ ...before.remote, opaque: before.local.opaque }]);
    if (mode === 'sync-contention') expect(after.records).toEqual([before.newer, before.remote]);
    if (mode === 'import') expect(after.records).toEqual([expect.objectContaining({ ...before.remote, updatedAt: '2090-01-02T00:00:00.000Z' })]);
    if (mode === 'import-existing') { expect(after.rawCatalog).toBe(before.rawCatalog); expect(after.rawDeleted).toBe(before.rawDeleted); }
    if (mode === 'import-contention') { expect(after.rawCatalog).toBe(before.replacement); expect(after.rawDeleted).toBe(before.rawDeleted); }
    if (mode === 'import-deleted') { expect(after.records).toEqual([]); expect(after.rawDeleted).toBe(before.rawDeleted); }
    if (mode === 'sync' || mode === 'sync-edit' || mode === 'sync-contention') expect(after.tombstones).toEqual({ custom_previous: 100, custom_remote_previous: 200 });
    if (mode === 'import') expect(after.tombstones).toEqual({ custom_remote_previous: 200 });
  }
  expect(after.journal).toBeNull(); expect(after.fence).toBeNull(); expect(after.history).toBe(before.history); expect(after.preference).toBe(before.preference);
  if (!mode.startsWith('import')) expect(await dashboardHealth(page)).toBe(health);
  else {
    const retained = JSON.parse(health!);
    const current = JSON.parse((await dashboardHealth(page))!); expect(current.entries).toEqual(retained.entries); expect(current.contextNotes).toBe(retained.contextNotes);
  }
  const visible = mode === 'import' || mode === 'sync' || mode === 'sync-edit' || mode === 'sync-contention';
  if (visible) {
    await page.evaluate(async () => { await (await import('/js/chat-panel.js')).openChatPanel(); (await import('/js/chat-personalities.js')).updatePersonalityBar(); });
    await page.locator('.chat-personality-current').click(); await expect(page.locator(`.chat-personality-opt[data-personality="${before.remote.id}"]`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
