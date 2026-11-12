import path from 'node:path';
import fs from 'node:fs/promises';
import {test as base, expect, type BrowserContextOptions} from '@playwright/test';
import {withNativeCocoaOpfsContext} from '../helpers/cocoa-opfs-context.js';
import {startKitServer} from './kit-release-server.js';

const test = base.extend({
  context: async ({context, playwright, browserName, launchOptions, headless, contextOptions,
    viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, serviceWorkers}, use, info) => {
    if (process.platform !== 'darwin' || browserName !== 'webkit') {await use(context); return;}
    const device: BrowserContextOptions = {
      ...(viewport === undefined ? {} : {viewport}), ...(userAgent === undefined ? {} : {userAgent}),
      ...(deviceScaleFactor === undefined ? {} : {deviceScaleFactor}), ...(isMobile === undefined ? {} : {isMobile}),
      ...(hasTouch === undefined ? {} : {hasTouch}), ...(serviceWorkers === undefined ? {} : {serviceWorkers}),
    };
    await withNativeCocoaOpfsContext({browserType: playwright.webkit, privateContext: context,
      launchOptions: {...launchOptions, headless}, contextOptions: {...contextOptions, ...device}, info}, use);
  },
});
const password = 'SyntheticMigration2!', original = 'SyntheticOriginal1!';
for (const encrypted of [false, true]) test('shipping recovery preserves ' + (encrypted ? 'passphrase-protected' : 'plain') + ' records through offline resume and cold launch', async ({page, browser, context, browserName}) => {
  test.setTimeout(120000);
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('dist'));
  // Cocoa requires its qualified persistent store. Different origins still
  // have completely separate application storage within that browser.
  const destination = process.platform === 'darwin' && browserName === 'webkit' ? context : await browser.newContext({serviceWorkers: 'allow'});
  try {
    await page.goto(server.origin + '/app/migration.html');
    await expect(page.locator('html[data-migration-ready]')).toBeAttached();
    const before = await page.evaluate(async ({encrypted, original}) => {
      const defaults = (await import('/js/profile-defaults.js')).createDefaultProfileData();
      const codec = await import('/js/migration-crypto.js');
      const {bytesToBase64} = await import('/js/base64.js');
      const salt = crypto.getRandomValues(new Uint8Array(16)), key = await codec.deriveMigrationKey(original, salt);
      const wrap = async (value: string) => {
        if (!encrypted) return value;
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(value));
        return 'v1:' + bytesToBase64(iv) + ':' + bytesToBase64(new Uint8Array(ct));
      };
      localStorage.setItem('labcharts-encryption-enabled', String(encrypted));
      if (encrypted) localStorage.setItem('labcharts-encryption-salt', bytesToBase64(salt));
      const profiles = await wrap(JSON.stringify([{id: 'shipping-recovery', name: 'Synthetic recovered profile', createdAt: 1, status: 'active'}]));
      localStorage.setItem('labcharts-profiles', profiles);
      localStorage.setItem('labcharts-active-profile', 'shipping-recovery');
      localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-ai-paused', 'true');
      const imported = await wrap(JSON.stringify({...defaults, contextNotes: 'Synthetic shipping recovery note', unknownFutureField: {retain: true}}));
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('labcharts-blobs', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('kv');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(imported, 'labcharts-shipping-recovery-imported');
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
      }); db.close();
      const library = await (await navigator.storage.getDirectory()).getDirectoryHandle('lens-local', {create: true});
      const bytes = Uint8Array.from({length: 4096}, (_, index) => index % 256);
      const writer = await (await library.getFileHandle('synthetic-migration.bin', {create: true})).createWritable();
      await writer.write(bytes); await writer.close();
      const fileDigest = bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
      return {profiles, imported, fileDigest};
    }, {encrypted, original});
    await page.reload(); await expect(page.locator('html[data-migration-ready]')).toBeAttached();
    if (encrypted) await page.locator('#migration-original').fill(original);
    await page.locator('#migration-password').fill(password); await page.locator('#migration-confirm').fill(password);
    await page.getByRole('button', {name: 'Prepare migration file', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Download migration file', exact: true})).toBeEnabled({timeout: 30000});
    const downloading = page.waitForEvent('download'); await page.getByRole('button', {name: 'Download migration file', exact: true}).click();
    const file = await fs.readFile((await (await downloading).path())!);
    expect(file.toString()).not.toContain('Synthetic shipping recovery note');
    const target = await destination.newPage(), origin = server.origin.replace('127.0.0.1', 'localhost');
    await target.goto(origin + '/app/migration.html'); await expect(target.locator('html[data-migration-ready]')).toBeAttached();
    await target.locator('#migration-file').setInputFiles({name: 'synthetic-migration.json', mimeType: 'application/json', buffer: file});
    const inspect = async () => {
      await target.locator('#migration-import-password').fill(password);
      await target.getByRole('button', {name: 'Check file', exact: true}).click();
      await expect(target.locator('[data-migration-summary]')).toBeVisible();
    };
    const restore = async () => {
      if (encrypted) await target.locator('#migration-import-original').fill(original);
      await target.getByRole('checkbox').check(); await target.getByRole('button', {name: 'Restore migration file', exact: true}).click();
      await expect(target.getByRole('main')).toHaveAttribute('aria-busy', 'false', {timeout: 30000});
    };
    await inspect();
    await target.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        if (this.transaction.db.name === 'labcharts-blobs') throw new DOMException('Synthetic quota interruption', 'QuotaExceededError');
        return put.apply(this, args);
      };
    });
    await restore(); await expect(target.getByRole('alert')).toContainText('Synthetic quota interruption');
    await destination.setOffline(true);
    await target.goto(origin + '/app'); await expect(target).toHaveURL(origin + '/app/migration.html');
    await expect(target.getByRole('heading', {name: 'Resume recovery'})).toBeVisible(); await inspect(); await restore();
    await expect(target.getByRole('heading', {name: 'Recovery verified', exact: true})).toBeVisible();
    await target.getByRole('link', {name: 'Open getbased', exact: true}).click();
    const overlay = target.locator('#legal-consent-overlay'); await expect(overlay).toBeVisible();
    await overlay.getByRole('checkbox').check(); await overlay.locator('[data-legal-consent-action="accept"]').click();
    if (encrypted) {await target.locator('#passphrase-unlock-input').fill(original); await target.locator('#passphrase-unlock-btn').click();}
    await expect(target.locator('html[data-app-ready]')).toBeAttached();
    const check = async () => {
      const actual = await target.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {const r = indexedDB.open('labcharts-blobs'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);});
        try {
          const imported = await new Promise<unknown>((resolve, reject) => {const tx = db.transaction('kv', 'readonly'), r = tx.objectStore('kv').get('labcharts-shipping-recovery-imported'); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error);});
          return {profiles: localStorage.getItem('labcharts-profiles'), imported, pending: localStorage.getItem('labcharts-migration-pending'), sync: localStorage.getItem('labcharts-sync-enabled')};
        } finally {db.close();}
      });
      // Application initialization may persist normalized profile metadata. The
      // irreplaceable imported record must still decrypt to the same content.
      expect(actual.pending).toBeNull(); expect(actual.sync).toBe('false');
      const plain = await target.evaluate(async ({value, original, encrypted}) => {
        if (!encrypted) return value;
        const {deriveMigrationKey, decryptMigrationSourceValue} = await import('/js/migration-crypto.js');
        const {_base64ToBytes} = await import('/js/base64.js');
        const key = await deriveMigrationKey(original, _base64ToBytes(localStorage.getItem('labcharts-encryption-salt')!));
        return decryptMigrationSourceValue(key, String(value));
      }, {value: actual.imported, original, encrypted});
      expect(JSON.parse(String(plain))).toMatchObject({contextNotes: 'Synthetic shipping recovery note', unknownFutureField: {retain: true}});
    };
    await check(); await target.close();
    const cold = await destination.newPage(); await cold.goto(origin + '/app');
    if (encrypted) {await cold.locator('#passphrase-unlock-input').fill(original); await cold.locator('#passphrase-unlock-btn').click();}
    await expect(cold.locator('html[data-app-ready]')).toBeAttached();
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-migration-pending'))).toBeNull();
    const fileDigest = await cold.evaluate(async () => {
      const library = await (await navigator.storage.getDirectory()).getDirectoryHandle('lens-local');
      const bytes = await (await library.getFileHandle('synthetic-migration.bin')).getFile().then(file => file.arrayBuffer());
      const {bytesToBase64} = await import('/js/base64.js');
      return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    });
    expect(fileDigest).toBe(before.fileDigest);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-profiles'))).toBe(before.profiles);
  } finally {if (destination !== context) await destination.close(); await server.close();}
});
