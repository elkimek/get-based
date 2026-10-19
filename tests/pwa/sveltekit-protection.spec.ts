import {nativeTabKey} from '../helpers/native-tab-key.js';
import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { artifactInputs } from './kit-native-receipts.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const protectionOwners = ['js/state.js', 'js/settings-protection-classes.js', 'js/settings-protection-component.js',
  'js/components/EncryptionSettings.svelte', 'js/components/BackupSettings.svelte'] as const;
const protectionSheets = ['css/settings.css'] as const;
const coarseTargetClass = 'gb:protection:[@media(pointer:coarse)]:min-h-11';
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}
async function data(page: Page) {
  await openStaticSettings(page);
  await page.locator('#settings-nav-data').click();
  await expect(page.locator('[data-protection-view="encryption"]')).toBeVisible();
}

test('Security and Backup preserve offline first use, keyboard actions, themes and encrypted cold launch', async ({ page, context }) => {
  test.setTimeout(150_000);
  const ownedArtifact = await artifactInputs(protectionOwners, protectionSheets);
  expect(ownedArtifact.directory).toBe(artifact);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00.000Z',
      appVersion: 'kit-test', location: 'local-test' }));
  });
  const errors: string[] = []; const csp: string[] = [];
  context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    (window as unknown as { protectionCsp: string[] }).protectionCsp ??= [];
    (window as unknown as { protectionCsp: string[] }).protectionCsp.push(event.violatedDirective);
  }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page);
    expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
    await page.evaluate(async () => {
      localStorage.setItem('labcharts-last-autobackup', '2026-01-01T00:00:00.000Z');
      const open = indexedDB.open('labcharts-backups', 2);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('snapshots')) open.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
        if (!open.result.objectStoreNames.contains('folder-handle')) open.result.createObjectStore('folder-handle');
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      const tx = db.transaction('snapshots', 'readwrite'); const store = tx.objectStore('snapshots'); store.clear();
      for (let id = 1; id <= 5; id++) store.put({ id, createdAt: '2026-01-01T00:00:00.000Z', encrypted: true,
        snapshot: { profiles: [{ id: 'synthetic', medicalData: 'Never render private backup payloads' }] } });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    });
    server.state.offline = true;
    await data(page);
    const security = page.locator('#encryption-section'); const backup = page.locator('#backup-section');
    await expect(security).toContainText('Encryption is OFF'); await expect(backup).toContainText('Backups are unencrypted');
    const toggle = backup.locator('#backup-snapshots-toggle'); const list = backup.locator('#backup-snapshot-list');
    await expect(toggle).toBeVisible(); await expect(list).toBeHidden(); await expect(list).toHaveCSS('display', 'none');
    await toggle.focus(); await toggle.press('Space'); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(list).toBeVisible(); await expect(list).toHaveCSS('display', 'flex');
    await expect(list.locator('.backup-snapshot-item')).toHaveCount(5);
    await expect(list).toContainText('1 profile(s) • encrypted'); await expect(list).not.toContainText('Never render private');
    await expect(list.locator('[data-crypto-action="restore-auto-backup"]').first()).toHaveAttribute('data-crypto-snapshot-id', '5');
    await expect(list.locator('[data-crypto-action="restore-auto-backup"]').first()).toHaveAttribute('data-crypto-snapshot-id-type', 'number');
    await toggle.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(list).toHaveCSS('display', 'none');
    const picker = backup.getByRole('button', { name: 'Restore Backup', exact: true });
    const fileChooser = page.waitForEvent('filechooser'); await picker.focus(); await picker.press('Enter');
    expect((await fileChooser).isMultiple()).toBe(false);
    await expect(backup.locator('[data-crypto-action="import-backup"]')).toBeHidden();
    const downloadEvent = page.waitForEvent('download'); await backup.getByRole('button', { name: 'Download Backup' }).click();
    const download = await downloadEvent; const exported = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
    expect(exported).toMatchObject({ format: 'labcharts-backup', encrypted: false }); expect(exported.profiles.length).toBeGreaterThan(0);

    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
      await page.locator('[data-tweaks-action="close"]').click();
      const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (await closeChat.isVisible()) await closeChat.click();
      await data(page); await backup.locator('#backup-snapshots-toggle').click();
      for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const section of [security, backup]) {
          await section.scrollIntoViewIfNeeded();
          expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
          const violations = await section.evaluate(async element => {
            const result = await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element,
              { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
            return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
          });
          expect(violations, `${theme} ${viewport.width} ${await section.getAttribute('id')}`).toEqual([]);
        }
        const coarsePointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
        for (const [button, fineMinimum, parentDisplay] of [
          [security.getByRole('button', { name: 'Enable Encryption' }), '0px', 'block'],
          [picker, 'auto', 'flex'],
          [toggle, '0px', 'block'],
        ] as const) {
          // Historical native block controls compute 0px; Restore is a flex
          // item with an automatic minimum. Coarse pointers explicitly use 44px.
          expect(await button.evaluate(element => getComputedStyle(element.parentElement!).display)).toBe(parentDisplay);
          if (parentDisplay === 'flex') expect(await button.evaluate(element => element.parentElement!.classList.contains('gb:protection:flex'))).toBe(true);
          expect(await button.evaluate((element, token) => element.classList.contains(token), coarseTargetClass)).toBe(true);
          expect(await button.evaluate(element => element.classList.contains('gb:protection:min-h-11'))).toBe(false);
          await expect(button).toHaveAttribute('type', 'button');
          await expect(button).toHaveCSS('min-height', coarsePointer ? '44px' : fineMinimum);
          if (coarsePointer) {
            const target = await button.evaluate(element => { const rect = element.getBoundingClientRect(); return {width: rect.width, height: rect.height}; });
            expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
          }
          await button.focus(); await page.keyboard.press(nativeTabKey(page)); await page.keyboard.press(nativeTabKey(page, true));
          await expect(button).toBeFocused(); await expect(button).toHaveCSS('outline-width', '2px');
        }
      }
    }
    await security.getByRole('button', { name: 'Enable Encryption' }).click();
    await page.locator('#passphrase-set-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-confirm-input').fill('SyntheticStrong1!');
    await page.locator('#passphrase-set-btn').click();
    await expect(security).toContainText('Encryption is ON'); await expect(backup).toContainText('same passphrase required');
    expect(await page.evaluate(() => localStorage.getItem('labcharts-encryption-enabled'))).toBe('true');
    await security.getByRole('button', { name: 'Change Passphrase' }).click();
    await expect(page.locator('#passphrase-old-input')).toBeFocused();
    await page.locator('#passphrase-old-input').fill('SyntheticStrong1!');
    await page.locator('#passphrase-new1-input').fill('SyntheticChanged1!');
    await page.locator('#passphrase-new2-input').fill('Mismatch1!');
    await page.locator('#passphrase-new2-input').press('Enter');
    await expect(page.locator('#passphrase-change-error')).toHaveText('New passphrases do not match');
    await page.locator('#passphrase-new2-input').fill('SyntheticChanged1!');
    await page.locator('#passphrase-new2-input').press('Enter');
    await expect(page.locator('.passphrase-dialog')).toHaveCount(0);
    csp.push(...await page.evaluate(() => (window as unknown as { protectionCsp?: string[] }).protectionCsp || []));
    await page.close(); const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' });
    await expect(cold.locator('#passphrase-unlock-input')).toBeFocused();
    await cold.locator('#passphrase-unlock-input').fill('SyntheticStrong1!');
    await cold.locator('#passphrase-unlock-input').press('Enter');
    await expect(cold.locator('#passphrase-error')).toHaveText('Wrong passphrase (attempt 1)');
    await cold.locator('#passphrase-forgot-btn').click();
    await expect(cold.locator('.passphrase-dialog')).toContainText('This cannot be undone');
    await expect(cold.locator('#passphrase-forgot-cancel')).toBeFocused();
    await cold.locator('#passphrase-forgot-cancel').click();
    await expect(cold.locator('#passphrase-unlock-input')).toBeFocused();
    await cold.locator('#passphrase-unlock-input').fill('SyntheticChanged1!');
    await cold.locator('#passphrase-unlock-input').press('Enter');
    await ready(cold); await data(cold);
    await expect(cold.locator('#encryption-section')).toContainText('Encryption is ON');
    await expect(cold.locator('#backup-section')).toContainText('same passphrase required');
    await cold.locator('#backup-snapshots-toggle').press('Space'); await expect(cold.locator('.backup-snapshot-item')).toHaveCount(5);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-last-autobackup'))).toBe('2026-01-01T00:00:00.000Z');
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);
    csp.push(...await cold.evaluate(() => (window as unknown as { protectionCsp?: string[] }).protectionCsp || []));
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    expect(await artifactInputs(protectionOwners, protectionSheets)).toEqual(ownedArtifact);
  } finally { await server.close(); }
});
