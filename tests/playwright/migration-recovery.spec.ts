import fs from 'node:fs/promises';
import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';

test.use({serviceWorkers: 'allow'});

const archivePassword = 'SyntheticMigration2!', appPassword = 'SyntheticOriginal1!';
async function prepare(page: Page, url: string) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice'}));
    for (const suffix of ['emptyTour', 'tour']) localStorage.setItem('labcharts-default-' + suffix, 'completed');
  });
  await page.goto(url); await expect(page.locator('html[data-app-ready]')).toBeAttached();
}
async function seed(page: Page, encrypted: boolean) {
  await page.evaluate(async ({encrypted, appPassword}) => {
    const protection = await import('/js/crypto.js');
    if (encrypted) {
      (window as Window & {__WEARABLES_TEST?: boolean}).__WEARABLES_TEST = true;
      const salt = await protection._setTestSessionKey(appPassword);
      localStorage.setItem('labcharts-encryption-salt', btoa(String.fromCharCode(...salt!)));
      localStorage.setItem('labcharts-encryption-enabled', 'true');
    }
    const id = 'migration-source';
    const profile = await import('/js/profile.js');
    await protection.encryptedSetItem('labcharts-profiles', JSON.stringify([{id, name: 'Synthetic migration profile', createdAt: 1, status: 'active'}]));
    const nutrition = await import('/js/nutrition-store.js');
    const meal = await nutrition.putNutritionMeal(id, {id: 'migration-meal', name: 'Synthetic meal', eatenAt: '2026-01-01T12:00:00.000Z'});
    await protection.encryptedSetItem('labcharts-' + id + '-imported', JSON.stringify({
      ...profile.createDefaultProfileData(), contextNotes: 'Synthetic migration history',
      notes: [{date: '2026-01-01', text: 'Retain the synthetic note.'}], nutritionMeals: [meal],
      unknownFutureField: {preserved: true},
      wearableConnections: {whoop: {connected: true, syntheticMetadata: 'keep me'}},
    }));
    await protection.encryptedSetItem('labcharts-openrouter-key', 'synthetic-api-value');
    const wearables = await import('/js/wearables-store.js');
    await wearables.upsertDaily(id, {source: 'whoop', date: '1995-01-01', hrv_rmssd: 71});
    await wearables.upsertDaily(id, {source: 'manual', date: '2026-01-01', weight: 81});
    await profile.initProfilesCache(); await profile.switchProfile(id);
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('lens-local', {create: true});
    const {DEFAULT_MODEL_KEY, MODELS} = await import('/js/lens-local-embedder-config.js');
    const spec = MODELS[DEFAULT_MODEL_KEY]!;
    const registry = JSON.stringify({activeId: 'migration-library', libraries: [{id: 'migration-library', name: 'Synthetic library', createdAt: 1, model: DEFAULT_MODEL_KEY}], revision: 1, updatedAt: 1});
    for (const name of ['_libraries.json', '_libraries.backup.json']) {
      const writer = await (await dir.getFileHandle(name, {create: true})).createWritable();
      await writer.write(registry); await writer.close();
    }
    const library = await dir.getDirectoryHandle('migration-library', {create: true});
    const values: Record<string, string | Uint8Array<ArrayBuffer>> = {
      'manifest.json': JSON.stringify({numChunks: 1, dim: spec.dim, modelId: spec.id, indexedAt: 1, docs: [{source: 'synthetic.md', chunks: 1}]}),
      'vectors.bin': new Uint8Array(new Float32Array(Array(spec.dim).fill(0.1)).buffer),
      'chunks.json': JSON.stringify([{source: 'synthetic.md', text: 'Preserve synthetic knowledge text'}]),
    };
    for (const [name, value] of Object.entries(values)) {
      const writer = await (await library.getFileHandle(name, {create: true})).createWritable();
      await writer.write(value); await writer.close();
    }
    const backup = await import('/js/backup.js');
    const snapshot = (await backup.buildFullBackupSnapshot())!;
    const db = await backup.openBackupDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put({id: 876, createdAt: snapshot.createdAt, encrypted, snapshot});
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
  }, {encrypted, appPassword});
}
async function openMigration(page: Page) {
  const close = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await close.isVisible()) await close.click();
  await page.locator('[data-shell-action="open-settings"]:visible').first().click();
  await page.locator('#settings-nav-data').click();
  // Keep this write debounced until the actual migration action flushes it.
  await page.evaluate(async () => {
    (await import('/js/chat-draft-storage.js')).rememberChatDraft('migration-source', 'main', 'Synthetic unsent text');
  });
  await page.getByRole('button', {name: 'Start migration', exact: true}).click();
  await expect(page).toHaveURL(/\/migration\.html$/);
  await expect(page.locator('html[data-migration-ready]')).toBeAttached();
}
async function exportFile(page: Page, encrypted: boolean) {
  if (encrypted) await page.locator('#migration-original').fill(appPassword);
  await page.locator('#migration-password').fill(archivePassword);
  await page.locator('#migration-confirm').fill(archivePassword);
  await page.getByRole('button', {name: 'Prepare migration file', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Download migration file', exact: true})).toBeEnabled({timeout: 30000});
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download migration file', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Migration download started', {timeout: 30000});
  const download = await downloading;
  return await fs.readFile((await download.path())!);
}
async function inspectFile(page: Page, bytes?: Buffer) {
  if (bytes) await page.locator('#migration-file').setInputFiles({name: 'synthetic-migration.json', mimeType: 'application/json', buffer: bytes});
  await page.locator('#migration-import-password').fill(archivePassword);
  await page.getByRole('button', {name: 'Check file', exact: true}).click();
  await expect(page.locator('[data-migration-summary]')).toBeVisible();
}
async function acknowledge(page: Page) {
  const overlay = page.locator('#legal-consent-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('checkbox').check();
  await overlay.locator('[data-legal-consent-action="accept"]').click();
  await expect(overlay).not.toBeVisible();
}
async function apply(page: Page, encrypted: boolean) {
  if (encrypted) await page.locator('#migration-import-original').fill(appPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Restore migration file', exact: true}).click();
}
for (const encrypted of [false, true]) test('migration recovers ' + (encrypted ? 'passphrase and browser protected' : 'browser protected') + ' data through the standalone UI', async ({page, browser}) => {
  test.setTimeout(120000);
  await prepare(page, '/app?dev-sw=1'); await seed(page, encrypted); await openMigration(page);
  const source = new URL(page.url()).origin;
  if (!encrypted) await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Saved snapshots are available here without entering an application password.
  await page.getByRole('button', {name: 'Prepare saved backup', exact: true}).last().click();
  await expect(page.getByRole('button', {name: 'Download saved backup', exact: true})).toBeEnabled();
  const olderDownloading = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download saved backup', exact: true}).click();
  expect((await olderDownloading).suggestedFilename()).toBe('getbased-saved-snapshot.json');
  const bytes = await exportFile(page, encrypted);
  expect(bytes.toString()).not.toContain('Synthetic migration history');
  const destination = await browser.newContext({serviceWorkers: 'allow'});
  try {
    const target = await destination.newPage();
    const origin = source.replace('127.0.0.1', 'localhost'); expect(origin).not.toBe(source);
    if (!encrypted) {
      await target.goto(origin + '/app'); await acknowledge(target);
      await expect(target.locator('html[data-app-ready]')).toBeAttached();
    }
    await target.goto(origin + '/app/migration.html'); await expect(target.locator('html[data-migration-ready]')).toBeAttached();
    await inspectFile(target, bytes);
    if (!encrypted) {
      // Fail after a side-store commit. A reload must retain the encrypted file,
      // block normal startup, and allow the same operation to be resumed.
      await target.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
          if (this.transaction.db.name === 'labcharts-blobs') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
          return original.apply(this, args);
        };
      });
      await apply(target, false);
      await expect(target.getByRole('alert')).toContainText('Synthetic quota failure');
      expect(await target.evaluate(() => localStorage.getItem('labcharts-migration-pending'))).toMatch(/^[a-f0-9]{64}$/);
      await destination.setOffline(true);
      await target.goto(origin + '/app'); await expect(target).toHaveURL(origin + '/app/migration.html');
      await expect(target.getByRole('heading', {name: 'Resume recovery'})).toBeVisible();
      await inspectFile(target);
    }
    await apply(target, encrypted);
    await expect(target.getByRole('heading', {name: 'Recovery verified', exact: true})).toBeVisible();
    expect(await target.evaluate(() => localStorage.getItem('labcharts-migration-pending'))).toBeNull();
    // Native development cache names depend on the online commit endpoint.
    // The shipping-artifact journey separately verifies offline application launch.
    await destination.setOffline(false);
    await target.getByRole('link', {name: 'Open getbased', exact: true}).click();
    if (encrypted) await acknowledge(target);
    if (encrypted) {await target.locator('#passphrase-unlock-input').fill(appPassword); await target.locator('#passphrase-unlock-btn').click();}
    await expect(target.locator('html[data-app-ready]')).toBeAttached();
    const recovered = await target.evaluate(async () => {
      const crypto = await import('/js/crypto.js');
      const data = JSON.parse((await crypto.encryptedGetItem('labcharts-migration-source-imported'))!);
      const whoop = await (await import('/js/wearables-store.js')).getDailyRange('migration-source', 'whoop', '1995-01-01', '1995-01-01');
      const meal = await (await import('/js/nutrition-store.js')).getNutritionMeal('migration-source', 'migration-meal');
      return {note: data.contextNotes, notes: data.notes, unknown: data.unknownFutureField,
        draft: await crypto.encryptedGetItem('labcharts-migration-source-chatDraft_main'),
        credential: await crypto.encryptedGetItem('labcharts-openrouter-key'), whoop: whoop[0]?.hrv_rmssd, meal: meal?.name,
        sync: localStorage.getItem('labcharts-sync-enabled'),
        file: await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('lens-local')).getFileHandle('_libraries.json')).getFile().then(file => file.text())};
    });
    expect(recovered).toMatchObject({note: 'Synthetic migration history', notes: [{date: '2026-01-01', text: 'Retain the synthetic note.'}], unknown: {preserved: true}, draft: 'Synthetic unsent text', credential: 'synthetic-api-value', whoop: 71, meal: 'Synthetic meal', sync: 'false'});
    expect(recovered.file).toContain('Synthetic library');
    const knowledge = await target.evaluate(async () => {
      const source = `import {readLatestCorpusSnapshot} from ${JSON.stringify(location.origin + '/js/lens-local-store.js')};
        self.onmessage = async () => {try {
          const root = await navigator.storage.getDirectory();
          const dir = await (await root.getDirectoryHandle('lens-local')).getDirectoryHandle('migration-library');
          const snapshot = await readLatestCorpusSnapshot(dir);
          self.postMessage({text: snapshot?.state.chunks[0]?.text, chunks: snapshot?.state.manifest.numChunks});
        } catch {self.postMessage({error: true});}};`;
      const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
      const worker = new Worker(url, {type: 'module'});
      try {return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The native Knowledge Base worker did not reply.')), 10000);
        worker.onerror = event => {clearTimeout(timer); reject(new Error(event.message));};
        worker.onmessage = event => {clearTimeout(timer); resolve(event.data);}; worker.postMessage({});
      });}
      finally {worker.terminate(); URL.revokeObjectURL(url);}
    });
    expect(knowledge).toEqual({text: 'Preserve synthetic knowledge text', chunks: 1});
    await target.reload();
    if (encrypted) {await target.locator('#passphrase-unlock-input').fill(appPassword); await target.locator('#passphrase-unlock-btn').click();}
    await expect(target.locator('html[data-app-ready]')).toBeAttached();
    expect(await target.evaluate(async () => JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem('labcharts-migration-source-imported'))!).contextNotes)).toBe('Synthetic migration history');
  } finally {await destination.close();}
  expect(await page.evaluate(() => localStorage.getItem('labcharts-migration-completed'))).toBeNull();
});

test('another source window prevents export until it closes', async ({page, context}) => {
  await prepare(page, '/app?dev-sw=1'); await seed(page, false); await openMigration(page);
  const other = await context.newPage(); await other.goto(page.url());
  await expect(other.locator('html[data-migration-ready]')).toBeAttached();
  await page.locator('#migration-password').fill(archivePassword); await page.locator('#migration-confirm').fill(archivePassword);
  let downloads = 0; page.on('download', () => {downloads++;});
  await page.getByRole('button', {name: 'Prepare migration file', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Close every other getbased'); expect(downloads).toBe(0);
  await other.close();
  expect((await exportFile(page, false)).length).toBeGreaterThan(0);
});
